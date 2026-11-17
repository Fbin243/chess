import { Chess } from 'chess.js'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  AnalysisEngineLike,
  AnalysisOptions,
  AnalysisPriority,
  AnalysisResult,
} from '../engine/analysisEngine'
import { UI_STORAGE_KEY, useAnalysis } from './useAnalysis'

interface Job {
  fen: string
  options: AnalysisOptions
  resolve: (result: AnalysisResult | null) => void
  reject: (error: Error) => void
  settled: boolean
}

class FakeAnalysis implements AnalysisEngineLike {
  jobs: Job[] = []
  cancels: Array<AnalysisPriority | undefined> = []
  disposed = false
  /** When set, every request is answered immediately with this reply. */
  auto: ((fen: string, options: AnalysisOptions) => AnalysisResult) | null = null

  analyze(fen: string, options: AnalysisOptions) {
    if (this.auto) return Promise.resolve(this.auto(fen, options))
    return new Promise<AnalysisResult | null>((resolve, reject) => {
      const job: Job = {
        fen,
        options,
        settled: false,
        resolve: (result) => {
          job.settled = true
          resolve(result)
        },
        reject: (error) => {
          job.settled = true
          reject(error)
        },
      }
      this.jobs.push(job)
    })
  }

  cancel(priority?: AnalysisPriority) {
    this.cancels.push(priority)
    for (const job of this.jobs) {
      if (!job.settled && (!priority || job.options.priority === priority)) job.resolve(null)
    }
  }

  dispose() {
    this.disposed = true
  }

  pending(priority: AnalysisPriority) {
    return this.jobs.filter((job) => !job.settled && job.options.priority === priority)
  }
}

const cp = (value: number): AnalysisResult => ({
  score: { kind: 'cp', value },
  bestMove: 'e2e4',
  depth: 14,
})

function play(...sans: string[]) {
  const game = new Chess()
  for (const san of sans) game.move(san)
  return game
}

interface Props {
  game: Chess
  over: boolean
}

function setup(initial: Props = { game: new Chess(), over: false }) {
  const engine = new FakeAnalysis()
  const hook = renderHook(
    ({ game, over }: Props) => useAnalysis(game, over, () => engine),
    { initialProps: initial },
  )
  return { engine, ...hook }
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('useAnalysis live evaluation', () => {
  it('requests a depth-16 live search with a 1.5 s limit and follows each depth', async () => {
    const { engine, result } = setup()
    await waitFor(() => expect(engine.jobs).toHaveLength(1))
    const [job] = engine.jobs
    expect(job.fen).toBe(new Chess().fen())
    expect(job.options).toMatchObject({ depth: 16, movetimeMs: 1500, priority: 'live' })
    expect(result.current.liveEval).toBeNull()

    act(() => job.options.onInfo?.({ depth: 6, score: { kind: 'cp', value: 20 } }))
    expect(result.current.liveEval).toEqual({ score: { kind: 'cp', value: 20 }, depth: 6 })
    act(() => job.options.onInfo?.({ depth: 12, score: { kind: 'cp', value: 31 } }))
    expect(result.current.liveEval?.depth).toBe(12)

    await act(async () => job.resolve({ score: { kind: 'cp', value: 35 }, bestMove: 'e2e4', depth: 16 }))
    expect(result.current.liveEval).toEqual({ score: { kind: 'cp', value: 35 }, depth: 16 })
  })

  it('cancels the old search and starts a new one when the position changes', async () => {
    const { engine, rerender } = setup()
    await waitFor(() => expect(engine.jobs).toHaveLength(1))
    rerender({ game: play('e4'), over: false })
    await waitFor(() => expect(engine.jobs).toHaveLength(2))
    expect(engine.cancels).toContain('live')
    expect(engine.jobs[1].fen).toBe(play('e4').fen())
  })

  it('shows the result instead of searching when the game is over', async () => {
    const mated = play('f3', 'e5', 'g4', 'Qh4#')
    const { engine, result } = setup({ game: mated, over: true })
    expect(engine.jobs).toHaveLength(0)
    expect(result.current.liveEval?.score.kind).toBe('mate')
    expect(Object.is(result.current.liveEval?.score.value, -0)).toBe(true)
  })

  it('stops the live search when the eval bar is turned off and resumes when on', async () => {
    const { engine, result } = setup()
    await waitFor(() => expect(engine.jobs).toHaveLength(1))
    act(() => result.current.setShowEval(false))
    expect(engine.cancels).toContain('live')
    expect(engine.jobs).toHaveLength(1)
    act(() => result.current.setShowEval(true))
    await waitFor(() => expect(engine.jobs).toHaveLength(2))
  })

  it('reports an engine failure without throwing', async () => {
    const { engine, result } = setup()
    await waitFor(() => expect(engine.jobs).toHaveLength(1))
    await act(async () => engine.jobs[0].reject(new Error('boom')))
    expect(result.current.analysisError).toBe('boom')
    expect(engine.disposed).toBe(true)
  })

  it('disposes the engine on unmount', async () => {
    const { engine, unmount } = setup()
    await waitFor(() => expect(engine.jobs).toHaveLength(1))
    unmount()
    expect(engine.disposed).toBe(true)
  })
})

describe('useAnalysis eval bar toggle', () => {
  it('defaults to shown, saves the choice and restores it', () => {
    const first = setup()
    expect(first.result.current.showEval).toBe(true)
    act(() => first.result.current.setShowEval(false))
    expect(JSON.parse(localStorage.getItem(UI_STORAGE_KEY) ?? '{}')).toEqual({ showEval: false })
    first.unmount()

    const second = setup()
    expect(second.result.current.showEval).toBe(false)
    expect(second.engine.jobs).toHaveLength(0)
  })

  it('falls back to shown when storage is corrupted', () => {
    localStorage.setItem(UI_STORAGE_KEY, '{nope')
    expect(setup().result.current.showEval).toBe(true)
  })
})

describe('useAnalysis review', () => {
  it('analyses every position at depth 14 with review priority and reports progress', async () => {
    const game = play('e4', 'e5', 'Nf3')
    const { engine, result } = setup({ game, over: false })
    await waitFor(() => expect(engine.jobs).toHaveLength(1))

    act(() => result.current.startReview())
    expect(result.current.review.status).toBe('running')
    await waitFor(() => expect(engine.pending('review')).toHaveLength(1))
    expect(engine.pending('review')[0].options).toMatchObject({ depth: 14, priority: 'review' })
    expect(engine.pending('review')[0].fen).toBe(new Chess().fen())

    for (let i = 0; i < 4; i++) {
      await waitFor(() => expect(engine.pending('review')).toHaveLength(1))
      await act(async () => engine.pending('review')[0].resolve(cp(i * 10)))
      expect(result.current.review.progress).toBeCloseTo((i + 1) / 4)
    }

    await waitFor(() => expect(result.current.review.status).toBe('done'))
    expect(result.current.review.byPly).toHaveLength(3)
    expect(result.current.review.byPly.every(Boolean)).toBe(true)
    expect(result.current.review.byPly[0]?.san).toBe('e4')
    expect(result.current.review.summary?.w.moves).toBe(2)
    expect(result.current.review.summary?.b.moves).toBe(1)
  })

  it('does nothing without moves', () => {
    const { engine, result } = setup()
    act(() => result.current.startReview())
    expect(result.current.review.status).toBe('idle')
    expect(engine.pending('review')).toHaveLength(0)
  })

  it('keeps results after Undo and marks only the new moves as not reviewed', async () => {
    const full = play('e4', 'e5', 'Nf3')
    const { engine, result, rerender } = setup({ game: full, over: false })
    engine.auto = () => cp(0)
    act(() => result.current.startReview())
    await waitFor(() => expect(result.current.review.status).toBe('done'))
    expect(result.current.review.byPly.every(Boolean)).toBe(true)

    // Undo the last full turn, then play a different move.
    rerender({ game: play('e4'), over: false })
    expect(result.current.review.byPly).toHaveLength(1)
    expect(result.current.review.byPly[0]?.san).toBe('e4')

    rerender({ game: play('e4', 'c5'), over: false })
    expect(result.current.review.byPly[0]?.san).toBe('e4')
    expect(result.current.review.byPly[1]).toBeUndefined()
  })

  it('skips cached positions when reviewing again', async () => {
    const { engine, result, rerender } = setup({ game: play('e4', 'e5'), over: false })
    engine.auto = () => cp(0)
    act(() => result.current.startReview())
    await waitFor(() => expect(result.current.review.status).toBe('done'))

    engine.auto = null
    engine.jobs.length = 0
    rerender({ game: play('e4', 'e5', 'Nf3'), over: false })
    act(() => result.current.startReview())
    await waitFor(() => expect(engine.pending('review')).toHaveLength(1))
    expect(engine.pending('review')[0].fen).toBe(play('e4', 'e5', 'Nf3').fen())
  })

  it('cancels a running review when the game changes', async () => {
    const { engine, result, rerender } = setup({ game: play('e4', 'e5'), over: false })
    act(() => result.current.startReview())
    await waitFor(() => expect(engine.pending('review')).toHaveLength(1))

    rerender({ game: play('e4', 'e5', 'Nf3'), over: false })
    expect(result.current.review.status).toBe('idle')
    expect(result.current.review.progress).toBe(0)
    expect(engine.cancels).toContain('review')
    expect(engine.pending('review')).toHaveLength(0)
  })

  it('can be cancelled by the user', async () => {
    const { engine, result } = setup({ game: play('e4'), over: false })
    act(() => result.current.startReview())
    await waitFor(() => expect(engine.pending('review')).toHaveLength(1))
    act(() => result.current.cancelReview())
    expect(result.current.review.status).toBe('idle')
    expect(engine.cancels).toContain('review')
  })

  it('reviews automatically when the game ends', async () => {
    const before = play('f3', 'e5', 'g4')
    const { engine, result, rerender } = setup({ game: before, over: false })
    engine.auto = () => cp(0)
    expect(result.current.review.status).toBe('idle')

    rerender({ game: play('f3', 'e5', 'g4', 'Qh4#'), over: true })
    await waitFor(() => expect(result.current.review.status).toBe('done'))
    expect(result.current.review.byPly).toHaveLength(4)
    expect(result.current.review.byPly.every(Boolean)).toBe(true)
  })

  it('does not review a game that was already over on load', () => {
    const { engine, result } = setup({ game: play('f3', 'e5', 'g4', 'Qh4#'), over: true })
    expect(result.current.review.status).toBe('idle')
    expect(engine.jobs).toHaveLength(0)
  })

  it('reports a failing review and leaves the hook usable', async () => {
    const { engine, result } = setup({ game: play('e4'), over: false })
    act(() => result.current.startReview())
    await waitFor(() => expect(engine.pending('review')).toHaveLength(1))
    await act(async () => engine.pending('review')[0].reject(new Error('worker died')))
    expect(result.current.review.status).toBe('idle')
    expect(result.current.analysisError).toBe('worker died')
  })
})
