import { describe, expect, it } from 'vitest'
import { evalToBarFraction, formatEval, mateSign, parseInfo, scoreToCp, toWhitePov } from './uci'

describe('parseInfo', () => {
  it('parses a centipawn score with a principal variation', () => {
    expect(
      parseInfo('info depth 12 seldepth 18 multipv 1 score cp 34 nodes 1000 nps 5000 pv e2e4 e7e5 g1f3'),
    ).toEqual({ depth: 12, score: { kind: 'cp', value: 34 }, pv: ['e2e4', 'e7e5', 'g1f3'] })
  })

  it('parses a negative centipawn score without a pv', () => {
    expect(parseInfo('info depth 3 score cp -120')).toEqual({
      depth: 3,
      score: { kind: 'cp', value: -120 },
    })
  })

  it('parses mate scores, including negative ones', () => {
    expect(parseInfo('info depth 9 score mate 3 pv h5f7')?.score).toEqual({ kind: 'mate', value: 3 })
    expect(parseInfo('info depth 9 score mate -2 pv a1a2')?.score).toEqual({
      kind: 'mate',
      value: -2,
    })
  })

  it('skips lowerbound and upperbound lines', () => {
    expect(parseInfo('info depth 10 score cp 50 lowerbound nodes 10 pv e2e4')).toBeNull()
    expect(parseInfo('info depth 10 score cp 50 upperbound nodes 10 pv e2e4')).toBeNull()
  })

  it('skips lines without a depth or score, and secondary lines', () => {
    expect(parseInfo('info string NNUE evaluation enabled')).toBeNull()
    expect(parseInfo('info currmove e2e4 currmovenumber 1')).toBeNull()
    expect(parseInfo('info depth 5 nodes 10')).toBeNull()
    expect(parseInfo('info depth 8 multipv 2 score cp 10 pv d2d4')).toBeNull()
    expect(parseInfo('bestmove e2e4')).toBeNull()
  })
})

describe('toWhitePov', () => {
  it('keeps the score when White is to move and flips it for Black', () => {
    expect(toWhitePov({ kind: 'cp', value: 40 }, 'w')).toEqual({ kind: 'cp', value: 40 })
    expect(toWhitePov({ kind: 'cp', value: 40 }, 'b')).toEqual({ kind: 'cp', value: -40 })
    expect(toWhitePov({ kind: 'mate', value: 2 }, 'b')).toEqual({ kind: 'mate', value: -2 })
  })

  it('flips mate in 0 between White and Black', () => {
    expect(mateSign(toWhitePov({ kind: 'mate', value: 0 }, 'w'))).toBe(1)
    expect(mateSign(toWhitePov({ kind: 'mate', value: 0 }, 'b'))).toBe(-1)
  })
})

describe('scoreToCp', () => {
  it('clamps centipawns and turns mates into the cap', () => {
    expect(scoreToCp({ kind: 'cp', value: 35 })).toBe(35)
    expect(scoreToCp({ kind: 'cp', value: 4000 })).toBe(1000)
    expect(scoreToCp({ kind: 'cp', value: -4000 })).toBe(-1000)
    expect(scoreToCp({ kind: 'mate', value: 4 })).toBe(1000)
    expect(scoreToCp({ kind: 'mate', value: -1 })).toBe(-1000)
    expect(scoreToCp({ kind: 'mate', value: 0 })).toBe(1000)
    expect(scoreToCp({ kind: 'mate', value: -0 })).toBe(-1000)
  })

  it('honours a custom cap', () => {
    expect(scoreToCp({ kind: 'cp', value: 700 }, 500)).toBe(500)
  })
})

describe('formatEval', () => {
  it('formats centipawns in pawns with an explicit sign', () => {
    expect(formatEval({ kind: 'cp', value: 130 })).toBe('+1.3')
    expect(formatEval({ kind: 'cp', value: -40 })).toBe('\u22120.4')
    expect(formatEval({ kind: 'cp', value: 0 })).toBe('+0.0')
    expect(formatEval({ kind: 'cp', value: -2 })).toBe('+0.0')
  })

  it('formats mates', () => {
    expect(formatEval({ kind: 'mate', value: 3 })).toBe('M3')
    expect(formatEval({ kind: 'mate', value: -2 })).toBe('\u2212M2')
  })
})

describe('evalToBarFraction', () => {
  it('is balanced at zero and symmetric', () => {
    expect(evalToBarFraction({ kind: 'cp', value: 0 })).toBeCloseTo(0.5, 6)
    const up = evalToBarFraction({ kind: 'cp', value: 150 })
    const down = evalToBarFraction({ kind: 'cp', value: -150 })
    expect(up + down).toBeCloseTo(1, 6)
    expect(up).toBeGreaterThan(0.5)
  })

  it('fills about 90% at four pawns', () => {
    expect(evalToBarFraction({ kind: 'cp', value: 400 })).toBeCloseTo(0.9, 2)
    expect(evalToBarFraction({ kind: 'cp', value: -400 })).toBeCloseTo(0.1, 2)
  })

  it('fills the bar completely for a mate', () => {
    expect(evalToBarFraction({ kind: 'mate', value: 2 })).toBe(1)
    expect(evalToBarFraction({ kind: 'mate', value: -2 })).toBe(0)
    expect(evalToBarFraction({ kind: 'mate', value: 0 })).toBe(1)
    expect(evalToBarFraction({ kind: 'mate', value: -0 })).toBe(0)
  })
})
