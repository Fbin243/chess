import { Chess } from 'chess.js'
import {
  createStockfishWorker,
  parseBestMove,
  type WorkerFactory,
  type WorkerLike,
} from './stockfishClient'
import { parseInfo, toWhitePov, type Score, type SideToMove } from './uci'

export type AnalysisPriority = 'live' | 'review'

/** A progress report for the running search; the score is relative to White. */
export interface AnalysisInfo {
  depth: number
  score: Score
  pv?: string[]
}

export interface AnalysisOptions {
  depth: number
  movetimeMs?: number
  priority: AnalysisPriority
  onInfo?: (info: AnalysisInfo) => void
}

export interface AnalysisResult {
  /** Relative to White. */
  score: Score
  bestMove: string | null
  depth: number
}

export interface AnalysisEngineLike {
  analyze(fen: string, options: AnalysisOptions): Promise<AnalysisResult | null>
  cancel(priority?: AnalysisPriority): void
  dispose(): void
}

export type AnalysisEngineFactory = () => AnalysisEngineLike

/** The result of a position that is already over (mate or draw), or null while the game goes on. */
export function terminalResult(game: Chess): AnalysisResult | null {
  if (game.isCheckmate()) {
    const whiteMated = game.turn() === 'w'
    return { score: { kind: 'mate', value: whiteMated ? -0 : 0 }, bestMove: null, depth: 0 }
  }
  if (game.isDraw()) return { score: { kind: 'cp', value: 0 }, bestMove: null, depth: 0 }
  return null
}

interface Job {
  fen: string
  sideToMove: SideToMove
  options: AnalysisOptions
  cancelled: boolean
  last: AnalysisInfo | null
  resolve: (result: AnalysisResult | null) => void
  reject: (error: Error) => void
}

const SKILL_LEVEL = 20

export class AnalysisEngine implements AnalysisEngineLike {
  private worker: WorkerLike | null = null
  private initPromise: Promise<void> | null = null
  private ready = false
  private waiters: Array<{ token: string; resolve: () => void }> = []
  private failInit: ((error: Error) => void) | null = null
  private current: Job | null = null
  private queue: Job[] = []
  private disposed = false

  constructor(private readonly createWorker: WorkerFactory = createStockfishWorker) {}

  init(): Promise<void> {
    if (this.initPromise) return this.initPromise
    this.initPromise = new Promise<void>((resolve, reject) => {
      this.failInit = reject
      try {
        const worker = this.createWorker()
        this.worker = worker
        worker.onmessage = (event) => this.handleMessage(event.data)
        worker.onerror = () => this.handleError(new Error('Analysis engine failed'))
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }
      this.send('uci')
      this.waitFor('uciok')
        .then(() => {
          this.send(`setoption name Skill Level value ${SKILL_LEVEL}`)
          this.send('isready')
          return this.waitFor('readyok')
        })
        .then(resolve, reject)
    })
    this.initPromise.then(
      () => {
        this.ready = true
        this.pump()
      },
      (error: unknown) => this.handleError(error instanceof Error ? error : new Error(String(error))),
    )
    return this.initPromise
  }

  analyze(fen: string, options: AnalysisOptions): Promise<AnalysisResult | null> {
    if (this.disposed) return Promise.resolve(null)

    let position: Chess
    try {
      position = new Chess(fen)
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error('Invalid position'))
    }
    const terminal = terminalResult(position)
    if (terminal) return Promise.resolve(terminal)

    return new Promise<AnalysisResult | null>((resolve, reject) => {
      const job: Job = {
        fen,
        sideToMove: position.turn(),
        options,
        cancelled: false,
        last: null,
        resolve,
        reject,
      }
      this.enqueue(job)
      this.init().catch((error: unknown) => {
        this.queue = this.queue.filter((queued) => queued !== job)
        job.reject(error instanceof Error ? error : new Error(String(error)))
      })
      this.pump()
    })
  }

  cancel(priority?: AnalysisPriority): void {
    const matches = (job: Job) => !priority || job.options.priority === priority
    this.queue = this.queue.filter((job) => {
      if (!matches(job)) return true
      job.resolve(null)
      return false
    })
    if (this.current && !this.current.cancelled && matches(this.current)) this.cancelCurrent()
  }

  dispose(): void {
    this.disposed = true
    for (const job of this.queue.splice(0)) job.resolve(null)
    if (this.current) {
      this.current.cancelled = true
      this.current.resolve(null)
      this.current = null
    }
    this.failInit?.(new Error('Analysis engine disposed'))
    this.waiters = []
    if (this.worker) {
      this.worker.onmessage = null
      this.worker.onerror = null
      this.worker.terminate()
      this.worker = null
    }
  }

  private enqueue(job: Job): void {
    if (job.options.priority === 'live') {
      this.queue = this.queue.filter((queued) => {
        if (queued.options.priority !== 'live') return true
        queued.resolve(null)
        return false
      })
      this.queue.push(job)
      if (this.current?.options.priority === 'live') this.cancelCurrent()
      return
    }

    const firstLive = this.queue.findIndex((queued) => queued.options.priority === 'live')
    if (firstLive === -1) this.queue.push(job)
    else this.queue.splice(firstLive, 0, job)
    if (this.current?.options.priority === 'live') this.cancelCurrent()
  }

  private cancelCurrent(): void {
    if (!this.current || this.current.cancelled) return
    this.current.cancelled = true
    this.current.resolve(null)
    this.send('stop')
  }

  private pump(): void {
    if (!this.ready || this.current || this.disposed) return
    const next = this.queue.shift()
    if (!next) return
    this.current = next
    const { depth, movetimeMs } = next.options
    this.send(`position fen ${next.fen}`)
    this.send(movetimeMs ? `go depth ${depth} movetime ${movetimeMs}` : `go depth ${depth}`)
  }

  private send(command: string): void {
    this.worker?.postMessage(command)
  }

  private waitFor(token: string): Promise<void> {
    return new Promise((resolve) => this.waiters.push({ token, resolve }))
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return
    for (const raw of data.split('\n')) {
      const line = raw.trim()
      if (line) this.handleLine(line)
    }
  }

  private handleLine(line: string): void {
    const waiterIndex = this.waiters.findIndex((waiter) => line === waiter.token)
    if (waiterIndex >= 0) {
      const [waiter] = this.waiters.splice(waiterIndex, 1)
      waiter.resolve()
      return
    }

    if (line.startsWith('info')) {
      const job = this.current
      if (!job || job.cancelled) return
      const parsed = parseInfo(line)
      if (!parsed) return
      const info: AnalysisInfo = { ...parsed, score: toWhitePov(parsed.score, job.sideToMove) }
      job.last = info
      job.options.onInfo?.(info)
      return
    }

    if (!line.startsWith('bestmove')) return
    const finished = this.current
    this.current = null
    if (finished && !finished.cancelled) {
      const last = finished.last
      finished.resolve({
        score: last?.score ?? { kind: 'cp', value: 0 },
        bestMove: parseBestMove(line),
        depth: last?.depth ?? 0,
      })
    }
    this.pump()
  }

  private handleError(error: Error): void {
    if (this.disposed) return
    this.failInit?.(error)
    for (const job of this.queue.splice(0)) job.reject(error)
    if (this.current) {
      this.current.reject(error)
      this.current = null
    }
  }
}
