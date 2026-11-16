import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import {
  canUndo,
  cloneGame,
  createGame,
  describeStatus,
  getStatus,
  isGameOver,
  isPromotionMove,
  kingInCheckSquare,
  moveRows,
  tryMove,
  undoTurn,
} from './gameState'

function play(sans: string[]): Chess {
  const game = new Chess()
  for (const san of sans) game.move(san)
  return game
}

describe('createGame', () => {
  it('starts a fresh game by default', () => {
    expect(createGame().fen()).toBe(new Chess().fen())
  })

  it('restores a game from PGN with its history', () => {
    const game = createGame({ pgn: '1. e4 e5 2. Nf3' })
    expect(game.history()).toEqual(['e4', 'e5', 'Nf3'])
  })

  it('creates a game from a FEN', () => {
    const fen = '4k3/8/8/8/8/8/8/4K2R w K - 0 1'
    expect(createGame({ fen }).fen()).toBe(fen)
  })

  it('falls back to a new game for invalid saved data', () => {
    expect(createGame({ pgn: 'not a pgn at all 1. zz9' }).history()).toEqual([])
    expect(createGame({ fen: 'garbage' }).fen()).toBe(new Chess().fen())
  })
})

describe('tryMove', () => {
  it('plays legal moves without mutating the original', () => {
    const game = new Chess()
    const result = tryMove(game, { from: 'e2', to: 'e4' })
    expect(result?.move.san).toBe('e4')
    expect(game.history()).toEqual([])
    expect(result?.game.history()).toEqual(['e4'])
  })

  it('rejects illegal moves', () => {
    expect(tryMove(new Chess(), { from: 'e2', to: 'e5' })).toBeNull()
  })

  it('supports castling', () => {
    const game = createGame({ fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1' })
    const result = tryMove(game, { from: 'e1', to: 'g1' })
    expect(result?.move.san).toBe('O-O')
    expect(result?.game.get('f1')).toMatchObject({ type: 'r', color: 'w' })
  })

  it('supports en passant', () => {
    const game = play(['e4', 'a6', 'e5', 'd5'])
    const result = tryMove(game, { from: 'e5', to: 'd6' })
    expect(result?.move.isEnPassant()).toBe(true)
    expect(result?.game.get('d5')).toBeFalsy()
  })

  it('supports promotion and requires a piece', () => {
    const game = createGame({ fen: '8/P7/8/8/8/8/8/k6K w - - 0 1' })
    expect(isPromotionMove(game, 'a7', 'a8')).toBe(true)
    expect(isPromotionMove(game, 'h1', 'h2')).toBe(false)
    expect(tryMove(game, { from: 'a7', to: 'a8' })).toBeNull()
    const result = tryMove(game, { from: 'a7', to: 'a8', promotion: 'n' })
    expect(result?.game.get('a8')).toMatchObject({ type: 'n', color: 'w' })
  })
})

describe('getStatus', () => {
  it('detects playing and check', () => {
    expect(getStatus(new Chess()).kind).toBe('playing')
    const game = play(['e4', 'f6', 'Qh5+'])
    expect(getStatus(game).kind).toBe('check')
    expect(kingInCheckSquare(game)).toBe('e8')
    expect(kingInCheckSquare(new Chess())).toBeNull()
  })

  it("detects fool's mate with the winner", () => {
    const game = play(['f3', 'e5', 'g4', 'Qh4#'])
    expect(getStatus(game)).toEqual({ kind: 'checkmate', winner: 'b' })
    expect(isGameOver(getStatus(game))).toBe(true)
    expect(describeStatus(getStatus(game), 'b')).toContain('you win')
    expect(describeStatus(getStatus(game), 'w')).toContain('bot wins')
  })

  it('detects stalemate', () => {
    const game = createGame({ fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1' })
    expect(getStatus(game).kind).toBe('stalemate')
  })

  it('detects insufficient material', () => {
    const game = createGame({ fen: '8/8/4k3/8/8/4K3/8/8 w - - 0 1' })
    expect(getStatus(game).kind).toBe('insufficient')
  })

  it('detects threefold repetition', () => {
    const game = play(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'])
    expect(getStatus(game).kind).toBe('threefold')
  })

  it('detects the 50-move rule', () => {
    const game = createGame({ fen: '4k3/8/8/8/8/8/R7/4K3 w - - 100 80' })
    expect(getStatus(game).kind).toBe('fiftyMove')
  })

  it('does not treat check as game over', () => {
    expect(isGameOver({ kind: 'check' })).toBe(false)
    expect(isGameOver({ kind: 'playing' })).toBe(false)
  })
})

describe('undoTurn', () => {
  it('removes the bot reply and the player move', () => {
    const game = play(['e4', 'e5', 'Nf3', 'Nc6'])
    const next = undoTurn(game, 'w')
    expect(next.history()).toEqual(['e4', 'e5'])
    expect(next.turn()).toBe('w')
    expect(game.history()).toHaveLength(4)
  })

  it('removes only the player move while the bot is still thinking', () => {
    const next = undoTurn(play(['e4']), 'w')
    expect(next.history()).toEqual([])
  })

  it('works when playing black', () => {
    const next = undoTurn(play(['e4', 'e5', 'Nf3']), 'b')
    expect(next.history()).toEqual(['e4'])
    expect(next.turn()).toBe('b')
  })

  it('is a no-op when the player has not moved yet', () => {
    const game = play(['e4'])
    expect(canUndo(game, 'b')).toBe(false)
    expect(undoTurn(game, 'b')).toBe(game)
  })
})

describe('moveRows', () => {
  it('pairs moves into numbered rows', () => {
    expect(moveRows(play(['e4', 'e5', 'Nf3']))).toEqual([
      { number: 1, white: 'e4', black: 'e5' },
      { number: 2, white: 'Nf3' },
    ])
  })

  it('returns no rows for a new game', () => {
    expect(moveRows(new Chess())).toEqual([])
  })
})

describe('cloneGame', () => {
  it('keeps the history', () => {
    const game = play(['e4', 'e5'])
    const copy = cloneGame(game)
    expect(copy.history()).toEqual(['e4', 'e5'])
    copy.move('Nf3')
    expect(game.history()).toHaveLength(2)
  })
})
