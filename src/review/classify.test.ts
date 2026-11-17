import { describe, expect, it } from 'vitest'
import type { Score } from '../engine/uci'
import {
  BEST_MAX_LOSS,
  EXCELLENT_MAX_LOSS,
  GOOD_MAX_LOSS,
  INACCURACY_MAX_LOSS,
  MISTAKE_MAX_LOSS,
  classifyMove,
  materialAfterBestReply,
  moveAccuracy,
  moverCp,
  summarize,
  type MoveClass,
} from './classify'

const cp = (value: number): Score => ({ kind: 'cp', value })
const mate = (value: number): Score => ({ kind: 'mate', value })

/** A White move from an equal position that loses `loss` centipawns and is not the engine's move. */
function whiteLoss(loss: number): MoveClass {
  return classifyMove({
    before: cp(0),
    after: cp(-loss),
    playedUci: 'a2a3',
    bestUci: 'e2e4',
    moverColor: 'w',
    materialSwing: 0,
  })
}

describe('classifyMove thresholds', () => {
  it.each<[string, number, MoveClass]>([
    ['no loss', 0, 'best'],
    [`${BEST_MAX_LOSS} cp`, BEST_MAX_LOSS, 'best'],
    [`${BEST_MAX_LOSS + 1} cp`, BEST_MAX_LOSS + 1, 'excellent'],
    [`${EXCELLENT_MAX_LOSS} cp`, EXCELLENT_MAX_LOSS, 'excellent'],
    [`${EXCELLENT_MAX_LOSS + 1} cp`, EXCELLENT_MAX_LOSS + 1, 'good'],
    [`${GOOD_MAX_LOSS} cp`, GOOD_MAX_LOSS, 'good'],
    [`${GOOD_MAX_LOSS + 1} cp`, GOOD_MAX_LOSS + 1, 'inaccuracy'],
    [`${INACCURACY_MAX_LOSS} cp`, INACCURACY_MAX_LOSS, 'inaccuracy'],
    [`${INACCURACY_MAX_LOSS + 1} cp`, INACCURACY_MAX_LOSS + 1, 'mistake'],
    [`${MISTAKE_MAX_LOSS} cp`, MISTAKE_MAX_LOSS, 'mistake'],
    [`${MISTAKE_MAX_LOSS + 1} cp`, MISTAKE_MAX_LOSS + 1, 'blunder'],
  ])('%s is %s', (_name, loss, expected) => {
    expect(whiteLoss(loss)).toBe(expected)
  })

  it('treats an improvement as best', () => {
    expect(whiteLoss(-80)).toBe('best')
  })

  it('is best when the engine move is played, whatever the numbers say', () => {
    expect(
      classifyMove({
        before: cp(0),
        after: cp(-90),
        playedUci: 'e2e4',
        bestUci: 'e2e4',
        moverColor: 'w',
        materialSwing: 0,
      }),
    ).toBe('best')
  })

  it('measures loss from the mover’s side for Black', () => {
    const base = { playedUci: 'a7a6', bestUci: 'e7e5', moverColor: 'b' as const, materialSwing: 0 }
    expect(classifyMove({ ...base, before: cp(0), after: cp(100) })).toBe('inaccuracy')
    expect(classifyMove({ ...base, before: cp(0), after: cp(-100) })).toBe('best')
  })

  it('caps evaluations at ±1000 cp', () => {
    // Winning by 1500 cp and by 1100 cp are the same once capped: no loss.
    expect(
      classifyMove({
        before: cp(1500),
        after: cp(1100),
        playedUci: 'a2a3',
        bestUci: 'e2e4',
        moverColor: 'w',
        materialSwing: 0,
      }),
    ).toBe('best')
  })
})

describe('classifyMove mate overrides', () => {
  const base = { playedUci: 'a2a3', bestUci: 'e2e4', materialSwing: 0 }

  it('makes missing a forced mate at least a mistake', () => {
    expect(
      classifyMove({ ...base, before: mate(3), after: cp(900), moverColor: 'w' }),
    ).toBe('mistake')
    expect(
      classifyMove({ ...base, before: mate(-3), after: cp(-900), moverColor: 'b' }),
    ).toBe('mistake')
  })

  it('keeps a worse class when missing the mate loses more', () => {
    expect(
      classifyMove({ ...base, before: mate(3), after: cp(0), moverColor: 'w' }),
    ).toBe('blunder')
  })

  it('does not punish a different move that still mates', () => {
    expect(
      classifyMove({ ...base, before: mate(3), after: mate(2), moverColor: 'w' }),
    ).toBe('best')
  })

  it('makes allowing a forced mate a blunder, even when the capped loss is zero', () => {
    expect(
      classifyMove({ ...base, before: cp(-1500), after: mate(-3), moverColor: 'w' }),
    ).toBe('blunder')
    expect(
      classifyMove({ ...base, before: cp(0), after: mate(2), moverColor: 'b' }),
    ).toBe('blunder')
  })

  it('does not call it a blunder when the mover was already being mated', () => {
    expect(
      classifyMove({ ...base, before: mate(-3), after: mate(-2), moverColor: 'w' }),
    ).toBe('best')
  })

  it('ignores the overrides for the engine’s own move', () => {
    expect(
      classifyMove({
        before: mate(3),
        after: cp(900),
        playedUci: 'e2e4',
        bestUci: 'e2e4',
        moverColor: 'w',
        materialSwing: 0,
      }),
    ).toBe('best')
  })
})

describe('classifyMove brilliant', () => {
  const base = {
    before: cp(80),
    playedUci: 'd1d8',
    bestUci: 'd1d8',
    moverColor: 'w' as const,
  }

  it('is a best move that gives up at least two pawns and keeps the position fine', () => {
    expect(classifyMove({ ...base, after: cp(90), materialSwing: 3 })).toBe('brilliant')
    expect(classifyMove({ ...base, after: cp(-50), materialSwing: 2 })).toBe('brilliant')
  })

  it('needs a real sacrifice', () => {
    expect(classifyMove({ ...base, after: cp(90), materialSwing: 1 })).toBe('best')
    expect(classifyMove({ ...base, after: cp(90), materialSwing: 0 })).toBe('best')
    expect(classifyMove({ ...base, after: cp(90), materialSwing: -3 })).toBe('best')
  })

  it('needs the position to stay at least -0.5 for the mover', () => {
    expect(classifyMove({ ...base, after: cp(-51), materialSwing: 3 })).toBe('best')
  })

  it('is judged from Black’s side for Black', () => {
    expect(
      classifyMove({
        before: cp(-80),
        after: cp(-90),
        playedUci: 'd8d1',
        bestUci: 'd8d1',
        moverColor: 'b',
        materialSwing: 4,
      }),
    ).toBe('brilliant')
  })

  it('is never given to a move that allows a forced mate', () => {
    expect(
      classifyMove({ ...base, before: cp(0), after: mate(-2), materialSwing: 5 }),
    ).toBe('best')
  })

  it('only upgrades best moves', () => {
    expect(
      classifyMove({
        before: cp(0),
        after: cp(-20),
        playedUci: 'a2a3',
        bestUci: 'e2e4',
        moverColor: 'w',
        materialSwing: 5,
      }),
    ).toBe('excellent')
  })
})

describe('materialAfterBestReply', () => {
  it('counts a queen sacrificed for a rook as a swing of 4 pawns', () => {
    expect(materialAfterBestReply('3rk3/8/8/8/8/8/8/3QK3 w - - 0 1', 'd1d8', 'e8d8')).toBe(4)
  })

  it('is negative for a plain capture of a loose pawn', () => {
    expect(materialAfterBestReply('4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1', 'd1d5', 'e8e7')).toBe(-1)
    expect(materialAfterBestReply('4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1', 'd1d5', null)).toBe(-1)
  })

  it('works from Black’s side', () => {
    expect(materialAfterBestReply('3qk3/8/8/8/8/8/8/3RK3 b - - 0 1', 'd8d1', 'e1d1')).toBe(4)
  })

  it('returns 0 for an illegal move', () => {
    expect(materialAfterBestReply('3rk3/8/8/8/8/8/8/3QK3 w - - 0 1', 'a1a2', null)).toBe(0)
  })
})

describe('moverCp', () => {
  it('flips the sign for Black and caps', () => {
    expect(moverCp(cp(120), 'w')).toBe(120)
    expect(moverCp(cp(120), 'b')).toBe(-120)
    expect(moverCp(cp(5000), 'w')).toBe(1000)
    expect(moverCp(mate(2), 'b')).toBe(-1000)
  })
})

describe('moveAccuracy', () => {
  it('is 100 when nothing is lost or the position improves', () => {
    expect(moveAccuracy(30, 30)).toBeCloseTo(100, 6)
    expect(moveAccuracy(30, 300)).toBeCloseTo(100, 6)
  })

  it('falls as more win probability is lost', () => {
    const small = moveAccuracy(0, -50)
    const medium = moveAccuracy(0, -200)
    const large = moveAccuracy(0, -800)
    expect(small).toBeGreaterThan(medium)
    expect(medium).toBeGreaterThan(large)
    expect(large).toBeGreaterThanOrEqual(0)
    expect(small).toBeLessThanOrEqual(100)
  })

  it('matches the documented formula', () => {
    const win = (centipawns: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368 * centipawns)) - 1)
    const drop = win(0) - win(-200)
    expect(moveAccuracy(0, -200)).toBeCloseTo(103.17 * Math.exp(-0.0435 * drop) - 3.17, 6)
  })
})

describe('summarize', () => {
  it('counts classes and averages accuracy per side', () => {
    const summary = summarize([
      { color: 'w', classification: 'best', accuracy: 100 },
      { color: 'b', classification: 'blunder', accuracy: 20 },
      { color: 'w', classification: 'mistake', accuracy: 60 },
      undefined,
      { color: 'b', classification: 'blunder', accuracy: 40 },
    ])
    expect(summary.w.moves).toBe(2)
    expect(summary.w.accuracy).toBeCloseTo(80, 6)
    expect(summary.w.counts.best).toBe(1)
    expect(summary.w.counts.mistake).toBe(1)
    expect(summary.b.moves).toBe(2)
    expect(summary.b.accuracy).toBeCloseTo(30, 6)
    expect(summary.b.counts.blunder).toBe(2)
    expect(summary.b.counts.best).toBe(0)
  })

  it('has no accuracy for a side without reviewed moves', () => {
    const summary = summarize([{ color: 'w', classification: 'good', accuracy: 90 }])
    expect(summary.b.accuracy).toBeNull()
    expect(summary.b.moves).toBe(0)
  })
})
