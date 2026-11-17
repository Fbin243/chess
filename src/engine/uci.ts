export type SideToMove = 'w' | 'b'

/** `cp` is centipawns, `mate` is moves to mate. Positive favours the side the score is relative to. */
export interface Score {
  kind: 'cp' | 'mate'
  value: number
}

export interface UciInfo {
  depth: number
  score: Score
  pv?: string[]
}

/** Largest evaluation (in centipawns) the review and the eval bar work with; a forced mate counts as this. */
export const EVAL_CAP = 1000

/** Mate "in 0" (a position that is already checkmate) has no sign of its own, so `-0` means Black mated. */
export function mateSign(score: Score): 1 | -1 {
  if (score.value === 0) return Object.is(score.value, -0) ? -1 : 1
  return score.value > 0 ? 1 : -1
}

/** Returns null for lines without a depth and exact score (bounds, currmove, strings, …). */
export function parseInfo(line: string): UciInfo | null {
  const tokens = line.trim().split(/\s+/)
  if (tokens[0] !== 'info') return null

  let depth: number | null = null
  let score: Score | null = null
  let bound = false
  let multipv = 1
  let pv: string[] | undefined

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]
    if (token === 'depth') {
      depth = Number(tokens[++i])
    } else if (token === 'multipv') {
      multipv = Number(tokens[++i])
    } else if (token === 'score') {
      const kind = tokens[++i]
      const value = Number(tokens[++i])
      if ((kind === 'cp' || kind === 'mate') && Number.isFinite(value)) score = { kind, value }
    } else if (token === 'lowerbound' || token === 'upperbound') {
      bound = true
    } else if (token === 'pv') {
      pv = tokens.slice(i + 1)
      break
    }
  }

  if (bound || multipv !== 1) return null
  if (depth === null || !Number.isFinite(depth) || !score) return null
  return pv && pv.length > 0 ? { depth, score, pv } : { depth, score }
}

/** UCI scores are relative to the side to move; this makes them relative to White. */
export function toWhitePov(score: Score, sideToMove: SideToMove): Score {
  if (sideToMove === 'w') return score
  return { kind: score.kind, value: -score.value }
}

/** Centipawns clamped to ±cap; a forced mate (in either direction) becomes ±cap. */
export function scoreToCp(score: Score, cap: number = EVAL_CAP): number {
  if (score.kind === 'mate') return mateSign(score) * cap
  return Math.max(-cap, Math.min(cap, score.value))
}

const MINUS = '\u2212'

/** White-relative text such as "+1.3", "−0.4", "M3" or "−M2". */
export function formatEval(score: Score): string {
  if (score.kind === 'mate') {
    const moves = `M${Math.abs(score.value)}`
    return mateSign(score) > 0 ? moves : `${MINUS}${moves}`
  }
  const pawns = Math.abs(score.value) / 100
  const text = pawns.toFixed(1)
  return score.value < 0 && text !== '0.0' ? `${MINUS}${text}` : `+${text}`
}

const BAR_STEEPNESS = Math.log(9) / 4

/** Share of the bar (0–1) that belongs to White: logistic in pawns, ±4 pawns ≈ 90%, mate = 100%. */
export function evalToBarFraction(score: Score): number {
  if (score.kind === 'mate') return mateSign(score) > 0 ? 1 : 0
  return 1 / (1 + Math.exp(-BAR_STEEPNESS * (score.value / 100)))
}
