import { getLevel } from './levels'

export interface WorkerLike {
  postMessage(message: string): void
  terminate(): void
  onmessage: ((event: { data: unknown }) => void) | null
  onerror: ((event: unknown) => void) | null
}

export type WorkerFactory = () => WorkerLike

export interface ChessEngine {
  bestMove(fen: string, level: number): Promise<string | null>
  newGame(): void
  stop(): void
  dispose(): void
}

interface Search {
  id: number
  fen: string
  level: number
  cancelled: boolean
  resolve: (move: string | null) => void
}

export function createStockfishWorker(): WorkerLike {
  const url = `${import.meta.env.BASE_URL}engine/stockfish.js`
  return new Worker(url) as unknown as WorkerLike
}

export function parseBestMove(line: string): string | null {
  const match = /^bestmove\s+(\S+)/.exec(line.trim())
  if (!match || match[1] === '(none)' || match[1] === '0000') return null
  return match[1]
}

export class StockfishClient implements ChessEngine {
  private worker: WorkerLike | null = null
  private initPromise: Promise<void> | null = null
  private waiters: Array<{ token: string; resolve: () => void }> = []
  private failInit: ((error: Error) => void) | null = null
  private latestId = 0
  private current: Search | null = null
  private queued: Search | null = null
  private needsNewGame = true
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
        worker.onerror = () => this.handleError(new Error('Stockfish worker failed'))
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }
      this.send('uci')
      this.waitFor('uciok')
        .then(() => {
          this.send('isready')
          return this.waitFor('readyok')
        })
        .then(resolve, reject)
    })
    return this.initPromise
  }

  newGame(): void {
    this.needsNewGame = true
  }

  async bestMove(fen: string, level: number): Promise<string | null> {
    const id = ++this.latestId
    await this.init()
    if (id !== this.latestId || this.disposed) return null

    return new Promise<string | null>((resolve) => {
      const search: Search = { id, fen, level, cancelled: false, resolve }
      this.queued?.resolve(null)
      this.queued = null
      if (this.current) {
        this.cancelCurrent()
        this.queued = search
      } else {
        this.start(search)
      }
    })
  }

  stop(): void {
    this.latestId++
    this.queued?.resolve(null)
    this.queued = null
    this.cancelCurrent()
  }

  dispose(): void {
    this.disposed = true
    this.latestId++
    this.queued?.resolve(null)
    this.queued = null
    if (this.current) {
      this.current.cancelled = true
      this.current.resolve(null)
      this.current = null
    }
    this.failInit?.(new Error('Stockfish disposed'))
    this.waiters = []
    if (this.worker) {
      this.worker.onmessage = null
      this.worker.onerror = null
      this.worker.terminate()
      this.worker = null
    }
  }

  private cancelCurrent(): void {
    if (!this.current || this.current.cancelled) return
    this.current.cancelled = true
    this.current.resolve(null)
    this.send('stop')
  }

  private start(search: Search): void {
    const { skill, depth, movetimeMs } = getLevel(search.level)
    this.current = search
    if (this.needsNewGame) {
      this.send('ucinewgame')
      this.needsNewGame = false
    }
    this.send(`setoption name Skill Level value ${skill}`)
    this.send(`position fen ${search.fen}`)
    this.send(`go depth ${depth} movetime ${movetimeMs}`)
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
      if (!line) continue
      this.handleLine(line)
    }
  }

  private handleLine(line: string): void {
    const waiterIndex = this.waiters.findIndex((waiter) => line === waiter.token)
    if (waiterIndex >= 0) {
      const [waiter] = this.waiters.splice(waiterIndex, 1)
      waiter.resolve()
      return
    }
    if (!line.startsWith('bestmove')) return

    const finished = this.current
    this.current = null
    if (finished && !finished.cancelled) finished.resolve(parseBestMove(line))
    if (this.queued) {
      const next = this.queued
      this.queued = null
      this.start(next)
    }
  }

  private handleError(error: Error): void {
    this.failInit?.(error)
    this.queued?.resolve(null)
    this.queued = null
    if (this.current) {
      this.current.resolve(null)
      this.current = null
    }
  }
}
