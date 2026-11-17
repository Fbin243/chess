import { describe, expect, it } from 'vitest'
import { AnalysisEngine, terminalResult, type AnalysisInfo } from './analysisEngine'
import type { WorkerLike } from './stockfishClient'
import { mateSign } from './uci'
import { Chess } from 'chess.js'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const AFTER_D4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1'
const AFTER_C4 = 'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq - 0 1'
const WHITE_MATED = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'
const BLACK_MATED = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4'
const STALEMATE = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'

class FakeWorker implements WorkerLike {
  sent: string[] = []
  terminated = false
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null

  postMessage(message: string) {
    this.sent.push(message)
    if (message === 'uci') queueMicrotask(() => this.emit('id name Fake\nuciok'))
    if (message === 'isready') queueMicrotask(() => this.emit('readyok'))
  }

  terminate() {
    this.terminated = true
  }

  emit(data: string) {
    this.onmessage?.({ data })
  }

  get searches() {
    return this.sent.filter((command) => command.startsWith('position fen'))
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup() {
  const worker = new FakeWorker()
  const engine = new AnalysisEngine(() => worker)
  return { worker, engine }
}

describe('AnalysisEngine', () => {
  it('starts with the UCI handshake and full strength, then searches', async () => {
    const { worker, engine } = setup()
    const pending = engine.analyze(START, { depth: 14, priority: 'review' })
    await flush()
    expect(worker.sent).toEqual([
      'uci',
      'setoption name Skill Level value 20',
      'isready',
      `position fen ${START}`,
      'go depth 14',
    ])
    worker.emit('bestmove e2e4')
    await expect(pending).resolves.toMatchObject({ bestMove: 'e2e4' })
  })

  it('adds a time limit when one is given and creates the worker only once', async () => {
    let created = 0
    const worker = new FakeWorker()
    const engine = new AnalysisEngine(() => {
      created++
      return worker
    })
    const first = engine.analyze(START, { depth: 16, movetimeMs: 1500, priority: 'live' })
    await flush()
    expect(worker.sent).toContain('go depth 16 movetime 1500')
    worker.emit('bestmove e2e4')
    await first
    const second = engine.analyze(AFTER_E4, { depth: 14, priority: 'review' })
    await flush()
    worker.emit('bestmove e7e5')
    await second
    expect(created).toBe(1)
  })

  it('streams info lines relative to White and resolves with the last one', async () => {
    const { worker, engine } = setup()
    const infos: AnalysisInfo[] = []
    const pending = engine.analyze(AFTER_E4, {
      depth: 16,
      priority: 'live',
      onInfo: (info) => infos.push(info),
    })
    await flush()
    worker.emit('info depth 1 score cp 20 pv e7e5')
    worker.emit('info depth 2 score cp 30 lowerbound pv e7e5')
    worker.emit('info string ignored')
    worker.emit('info depth 5 score cp 45 pv e7e5 g1f3\ninfo depth 6 score mate -3 pv e7e5')
    expect(infos.map((info) => [info.depth, info.score])).toEqual([
      [1, { kind: 'cp', value: -20 }],
      [5, { kind: 'cp', value: -45 }],
      [6, { kind: 'mate', value: 3 }],
    ])
    worker.emit('bestmove e7e5 ponder g1f3')
    await expect(pending).resolves.toEqual({
      score: { kind: 'mate', value: 3 },
      bestMove: 'e7e5',
      depth: 6,
    })
  })

  it('replaces a running live search with a newer live search', async () => {
    const { worker, engine } = setup()
    const first = engine.analyze(AFTER_E4, { depth: 16, priority: 'live' })
    await flush()
    const second = engine.analyze(AFTER_D4, { depth: 16, priority: 'live' })
    await expect(first).resolves.toBeNull()
    expect(worker.sent.at(-1)).toBe('stop')
    expect(worker.searches).toEqual([`position fen ${AFTER_E4}`])

    // The old search must finish before the next one starts.
    worker.emit('bestmove e7e5')
    expect(worker.searches).toEqual([`position fen ${AFTER_E4}`, `position fen ${AFTER_D4}`])
    worker.emit('info depth 4 score cp 10 pv d7d5')
    worker.emit('bestmove d7d5')
    await expect(second).resolves.toMatchObject({ bestMove: 'd7d5' })
  })

  it('keeps only the newest of several queued live requests', async () => {
    const { worker, engine } = setup()
    const review = engine.analyze(START, { depth: 14, priority: 'review' })
    await flush()
    const live1 = engine.analyze(AFTER_E4, { depth: 16, priority: 'live' })
    const live2 = engine.analyze(AFTER_D4, { depth: 16, priority: 'live' })
    await expect(live1).resolves.toBeNull()
    worker.emit('bestmove e2e4')
    await review
    expect(worker.searches).toEqual([`position fen ${START}`, `position fen ${AFTER_D4}`])
    worker.emit('bestmove d7d5')
    await expect(live2).resolves.toMatchObject({ bestMove: 'd7d5' })
  })

  it('stops a running live search when a review job arrives, and runs the review first', async () => {
    const { worker, engine } = setup()
    const live = engine.analyze(AFTER_E4, { depth: 16, priority: 'live' })
    await flush()
    const review = engine.analyze(START, { depth: 14, priority: 'review' })
    await expect(live).resolves.toBeNull()
    expect(worker.sent.at(-1)).toBe('stop')
    worker.emit('bestmove e7e5')
    expect(worker.searches.at(-1)).toBe(`position fen ${START}`)
    worker.emit('bestmove e2e4')
    await expect(review).resolves.toMatchObject({ bestMove: 'e2e4' })
  })

  it('puts review jobs ahead of queued live jobs but keeps review order', async () => {
    const { worker, engine } = setup()
    const first = engine.analyze(START, { depth: 14, priority: 'review' })
    await flush()
    const live = engine.analyze(AFTER_C4, { depth: 16, priority: 'live' })
    const second = engine.analyze(AFTER_E4, { depth: 14, priority: 'review' })
    const third = engine.analyze(AFTER_D4, { depth: 14, priority: 'review' })

    worker.emit('bestmove e2e4')
    await first
    expect(worker.searches.at(-1)).toBe(`position fen ${AFTER_E4}`)
    worker.emit('bestmove e7e5')
    await second
    expect(worker.searches.at(-1)).toBe(`position fen ${AFTER_D4}`)
    worker.emit('bestmove d7d5')
    await third
    expect(worker.searches.at(-1)).toBe(`position fen ${AFTER_C4}`)
    worker.emit('bestmove c7c5')
    await expect(live).resolves.toMatchObject({ bestMove: 'c7c5' })
  })

  it('cancels by priority and sends stop for a running search', async () => {
    const { worker, engine } = setup()
    const review = engine.analyze(START, { depth: 14, priority: 'review' })
    await flush()
    const live = engine.analyze(AFTER_E4, { depth: 16, priority: 'live' })

    engine.cancel('live')
    await expect(live).resolves.toBeNull()
    expect(worker.sent).not.toContain('stop')

    engine.cancel('review')
    await expect(review).resolves.toBeNull()
    expect(worker.sent.at(-1)).toBe('stop')
  })

  it('cancels everything when no priority is given', async () => {
    const { worker, engine } = setup()
    const running = engine.analyze(START, { depth: 14, priority: 'review' })
    await flush()
    const queued = engine.analyze(AFTER_E4, { depth: 16, priority: 'live' })
    engine.cancel()
    await expect(running).resolves.toBeNull()
    await expect(queued).resolves.toBeNull()
    worker.emit('bestmove e2e4')
    expect(worker.searches).toHaveLength(1)
  })

  it('ignores the bestmove of a cancelled search and does not feed it to the next one', async () => {
    const { worker, engine } = setup()
    const infos: number[] = []
    const stale = engine.analyze(START, {
      depth: 16,
      priority: 'live',
      onInfo: (info) => infos.push(info.depth),
    })
    await flush()
    engine.cancel('live')
    await expect(stale).resolves.toBeNull()

    const next = engine.analyze(AFTER_E4, { depth: 14, priority: 'review' })
    worker.emit('info depth 9 score cp 100 pv e2e4') // still the cancelled search
    worker.emit('bestmove e2e4') // cancelled search ends
    expect(infos).toEqual([])
    expect(worker.searches.at(-1)).toBe(`position fen ${AFTER_E4}`)

    worker.emit('info depth 3 score cp 25 pv e7e5')
    worker.emit('bestmove e7e5')
    await expect(next).resolves.toEqual({
      score: { kind: 'cp', value: -25 },
      bestMove: 'e7e5',
      depth: 3,
    })
  })

  it('answers finished positions without using the engine', async () => {
    const { worker, engine } = setup()
    const whiteMated = await engine.analyze(WHITE_MATED, { depth: 14, priority: 'review' })
    expect(whiteMated?.score.kind).toBe('mate')
    expect(Math.abs(whiteMated!.score.value)).toBe(0)
    expect(mateSign(whiteMated!.score)).toBe(-1)
    expect(whiteMated?.bestMove).toBeNull()

    const blackMated = await engine.analyze(BLACK_MATED, { depth: 14, priority: 'review' })
    expect(mateSign(blackMated!.score)).toBe(1)

    const stalemate = await engine.analyze(STALEMATE, { depth: 14, priority: 'live' })
    expect(stalemate?.score).toEqual({ kind: 'cp', value: 0 })

    expect(worker.sent).toEqual([])
  })

  it('terminalResult reports draws as 0 and ongoing games as null', () => {
    expect(terminalResult(new Chess())).toBeNull()
    expect(terminalResult(new Chess('8/8/8/8/8/5k2/8/4K2B w - - 0 1'))?.score).toEqual({
      kind: 'cp',
      value: 0,
    })
  })

  it('rejects an invalid position', async () => {
    const { engine } = setup()
    await expect(engine.analyze('not a fen', { depth: 14, priority: 'live' })).rejects.toThrow()
  })

  it('rejects pending searches when the worker fails', async () => {
    const { worker, engine } = setup()
    const running = engine.analyze(START, { depth: 14, priority: 'review' })
    await flush()
    worker.onerror?.({})
    await expect(running).rejects.toThrow('Analysis engine failed')
  })

  it('rejects when the worker cannot be created', async () => {
    const engine = new AnalysisEngine(() => {
      throw new Error('no worker')
    })
    await expect(engine.analyze(START, { depth: 14, priority: 'live' })).rejects.toThrow('no worker')
  })

  it('disposes: terminates the worker and resolves pending work with null', async () => {
    const { worker, engine } = setup()
    const running = engine.analyze(START, { depth: 14, priority: 'review' })
    await flush()
    const queued = engine.analyze(AFTER_E4, { depth: 16, priority: 'live' })
    engine.dispose()
    await expect(running).resolves.toBeNull()
    await expect(queued).resolves.toBeNull()
    expect(worker.terminated).toBe(true)
    await expect(engine.analyze(START, { depth: 14, priority: 'live' })).resolves.toBeNull()
  })

  it('can be disposed before it has started', () => {
    const { engine } = setup()
    expect(() => engine.dispose()).not.toThrow()
  })
})
