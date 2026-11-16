import { describe, expect, it } from 'vitest'
import { StockfishClient, parseBestMove, type WorkerLike } from './stockfishClient'
import { LEVELS } from './levels'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

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
}

function setup() {
  const worker = new FakeWorker()
  const client = new StockfishClient(() => worker)
  return { worker, client }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('parseBestMove', () => {
  it('parses plain, ponder and promotion moves', () => {
    expect(parseBestMove('bestmove e2e4')).toBe('e2e4')
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4')
    expect(parseBestMove('bestmove e7e8q')).toBe('e7e8q')
  })

  it('returns null when there is no move', () => {
    expect(parseBestMove('bestmove (none)')).toBeNull()
    expect(parseBestMove('info depth 3')).toBeNull()
  })
})

describe('StockfishClient', () => {
  it('performs the UCI handshake', async () => {
    const { worker, client } = setup()
    await client.init()
    expect(worker.sent).toEqual(['uci', 'isready'])
  })

  it('creates the worker only once', async () => {
    let created = 0
    const worker = new FakeWorker()
    const client = new StockfishClient(() => {
      created++
      return worker
    })
    await Promise.all([client.init(), client.init()])
    expect(created).toBe(1)
  })

  it('sends option and go commands for each level', async () => {
    for (const level of [1, 5, 10]) {
      const { worker, client } = setup()
      const result = client.bestMove(START_FEN, level)
      await flush()
      const { skill, depth, movetimeMs } = LEVELS[level]
      expect(worker.sent).toEqual([
        'uci',
        'isready',
        'ucinewgame',
        `setoption name Skill Level value ${skill}`,
        `position fen ${START_FEN}`,
        `go depth ${depth} movetime ${movetimeMs}`,
      ])
      worker.emit('info depth 1 score cp 10\nbestmove e2e4 ponder e7e5')
      await expect(result).resolves.toBe('e2e4')
    }
  })

  it('only sends ucinewgame again after newGame()', async () => {
    const { worker, client } = setup()
    const first = client.bestMove(START_FEN, 3)
    await flush()
    worker.emit('bestmove e2e4')
    await first

    const second = client.bestMove(START_FEN, 3)
    await flush()
    worker.emit('bestmove d2d4')
    await second
    expect(worker.sent.filter((m) => m === 'ucinewgame')).toHaveLength(1)

    client.newGame()
    const third = client.bestMove(START_FEN, 3)
    await flush()
    worker.emit('bestmove c2c4')
    await third
    expect(worker.sent.filter((m) => m === 'ucinewgame')).toHaveLength(2)
  })

  it('resolves promotion moves in UCI format', async () => {
    const { worker, client } = setup()
    const result = client.bestMove('8/P7/8/8/8/8/8/k6K w - - 0 1', 2)
    await flush()
    worker.emit('bestmove a7a8q')
    await expect(result).resolves.toBe('a7a8q')
  })

  it('ignores stale results after stop()', async () => {
    const { worker, client } = setup()
    const stale = client.bestMove(START_FEN, 3)
    await flush()
    client.stop()
    expect(worker.sent.at(-1)).toBe('stop')
    await expect(stale).resolves.toBeNull()
    worker.emit('bestmove e2e4')
  })

  it('discards the old bestmove and runs the newest search after a restart', async () => {
    const { worker, client } = setup()
    const old = client.bestMove(START_FEN, 3)
    await flush()
    const fresh = client.bestMove('4k3/8/8/8/8/8/8/4K2R w K - 0 1', 3)
    await flush()
    await expect(old).resolves.toBeNull()
    expect(worker.sent.at(-1)).toBe('stop')

    worker.emit('bestmove e2e4')
    await flush()
    expect(worker.sent.at(-1)).toBe('go depth 3 movetime 150')
    expect(worker.sent.at(-2)).toBe('position fen 4k3/8/8/8/8/8/8/4K2R w K - 0 1')

    worker.emit('bestmove h1h8')
    await expect(fresh).resolves.toBe('h1h8')
  })

  it('does not start a search that was stopped during init', async () => {
    const { worker, client } = setup()
    const pending = client.bestMove(START_FEN, 3)
    client.stop()
    await expect(pending).resolves.toBeNull()
    expect(worker.sent.some((m) => m.startsWith('go'))).toBe(false)
  })

  it('dispose terminates the worker and resolves pending searches with null', async () => {
    const { worker, client } = setup()
    const pending = client.bestMove(START_FEN, 3)
    await flush()
    client.dispose()
    await expect(pending).resolves.toBeNull()
    expect(worker.terminated).toBe(true)
  })

  it('rejects when the worker errors during init', async () => {
    const worker = new FakeWorker()
    worker.postMessage = () => {}
    const client = new StockfishClient(() => worker)
    const init = client.init()
    worker.onerror?.(new Error('boom'))
    await expect(init).rejects.toThrow()
  })
})
