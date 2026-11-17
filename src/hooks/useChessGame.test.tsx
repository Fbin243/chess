import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChessEngine } from '../engine/stockfishClient'
import { STORAGE_KEY, useChessGame } from './useChessGame'

class FakeEngine implements ChessEngine {
  replies: string[] = []
  requests: Array<{ fen: string; level: number }> = []
  stops = 0
  disposed = false
  private waiting: Array<(move: string | null) => void> = []

  bestMove(fen: string, level: number) {
    this.requests.push({ fen, level })
    return new Promise<string | null>((resolve) => {
      const reply = this.replies.shift()
      if (reply) resolve(reply)
      else this.waiting.push(resolve)
    })
  }
  newGame() {}
  stop() {
    this.stops++
    for (const resolve of this.waiting.splice(0)) resolve(null)
  }
  dispose() {
    this.disposed = true
  }
}

function setup() {
  const engine = new FakeEngine()
  const hook = renderHook(() => useChessGame(() => engine))
  return { engine, ...hook }
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('useChessGame', () => {
  it('lets the bot reply after the player moves', async () => {
    const { engine, result } = setup()
    engine.replies.push('e7e5')

    act(() => {
      expect(result.current.makeMove('e2', 'e4')).toBe(true)
    })
    await waitFor(() => expect(result.current.game.history()).toEqual(['e4', 'e5']))
    expect(result.current.thinking).toBe(false)
    expect(result.current.canMove).toBe(true)
  })

  it('blocks player moves while the bot thinks', async () => {
    const { result } = setup()
    act(() => {
      result.current.makeMove('e2', 'e4')
    })
    await waitFor(() => expect(result.current.thinking).toBe(true))
    expect(result.current.canMove).toBe(false)
    act(() => {
      expect(result.current.makeMove('d2', 'd4')).toBe(false)
    })
    expect(result.current.game.history()).toEqual(['e4'])
  })

  it('rejects illegal moves', () => {
    const { result } = setup()
    act(() => {
      expect(result.current.makeMove('e2', 'e5')).toBe(false)
    })
    expect(result.current.game.history()).toEqual([])
  })

  it('makes the bot move first when the player picks Black', async () => {
    const { engine, result } = setup()
    engine.replies.push('e2e4')
    act(() => result.current.newGame('b'))
    await waitFor(() => expect(result.current.game.history()).toEqual(['e4']))
    expect(result.current.playerColor).toBe('b')
    expect(result.current.orientation).toBe('b')
    expect(result.current.canMove).toBe(true)
  })

  it('undo stops the search and returns to the player turn', async () => {
    const { engine, result } = setup()
    act(() => {
      result.current.makeMove('e2', 'e4')
    })
    await waitFor(() => expect(result.current.thinking).toBe(true))
    const stopsBefore = engine.stops

    act(() => result.current.undo())
    expect(result.current.game.history()).toEqual([])
    expect(result.current.canMove).toBe(true)
    expect(engine.stops).toBeGreaterThan(stopsBefore)
    expect(result.current.thinking).toBe(false)
  })

  it('uses the current level for the next bot move', async () => {
    const { engine, result } = setup()
    act(() => result.current.setLevel(9))
    act(() => {
      result.current.makeMove('e2', 'e4')
    })
    await waitFor(() => expect(engine.requests).toHaveLength(1))
    expect(engine.requests[0].level).toBe(9)
  })

  it('saves and restores the game', async () => {
    const first = setup()
    first.engine.replies.push('e7e5')
    act(() => {
      first.result.current.makeMove('e2', 'e4')
    })
    await waitFor(() => expect(first.result.current.game.history()).toHaveLength(2))
    act(() => first.result.current.setLevel(7))
    first.unmount()

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(saved).toMatchObject({ playerColor: 'w', level: 7 })

    const second = setup()
    expect(second.result.current.game.history()).toEqual(['e4', 'e5'])
    expect(second.result.current.level).toBe(7)
  })

  it('falls back to a new game when saved data is corrupted', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const { result } = setup()
    expect(result.current.game.history()).toEqual([])
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pgn: '1. zz9', playerColor: 'x', level: 99 }))
    const again = setup()
    expect(again.result.current.game.history()).toEqual([])
    expect(again.result.current.playerColor).toBe('w')
    expect(again.result.current.level).toBe(10)
  })

  it('bumps the marks reset key on every new game', () => {
    const { result } = setup()
    const start = result.current.marksResetKey
    act(() => result.current.newGame('w'))
    expect(result.current.marksResetKey).toBe(start + 1)
    act(() => result.current.newGame('w'))
    expect(result.current.marksResetKey).toBe(start + 2)
  })

  it('reports engine failures', async () => {
    const engine = new FakeEngine()
    engine.bestMove = () => Promise.reject(new Error('no wasm'))
    const { result } = renderHook(() => useChessGame(() => engine))
    act(() => {
      result.current.makeMove('e2', 'e4')
    })
    await waitFor(() => expect(result.current.engineError).toBe('no wasm'))
    expect(result.current.thinking).toBe(false)
  })
})
