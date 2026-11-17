import { Chess, type PieceSymbol } from 'chess.js'
import { EVAL_CAP, mateSign, scoreToCp, type Score } from '../engine/uci'

export type MoveClass =
  | 'brilliant'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'

export type Side = 'w' | 'b'

export const MOVE_CLASSES: readonly MoveClass[] = [
  'brilliant',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
]

export const CLASS_LABELS: Record<MoveClass, string> = {
  brilliant: 'Brilliant',
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
}

export const CLASS_GLYPHS: Record<MoveClass, string> = {
  brilliant: '!!',
  best: '★',
  excellent: '✓',
  good: '·',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
}

/** Centipawn-loss limits (for the side that moved, evaluations capped at ±EVAL_CAP). */
export const BEST_MAX_LOSS = 10 // Best: the engine's move, or losing at most this much
export const EXCELLENT_MAX_LOSS = 25
export const GOOD_MAX_LOSS = 60
export const INACCURACY_MAX_LOSS = 120
export const MISTAKE_MAX_LOSS = 250 // anything above is a Blunder

/** Brilliant: a Best move that leaves the mover at least this many pawns down in material... */
export const BRILLIANT_MIN_SWING = 2
/** ...while the position is still at least this good for the mover (centipawns). */
export const BRILLIANT_MIN_EVAL = -50

export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
}

const SEVERITY: Record<MoveClass, number> = {
  brilliant: 0,
  best: 0,
  excellent: 1,
  good: 2,
  inaccuracy: 3,
  mistake: 4,
  blunder: 5,
}

export interface ClassifyInput {
  /** Evaluation of the position before the move (relative to White). */
  before: Score
  /** Evaluation of the position after the move (relative to White). */
  after: Score
  playedUci: string
  /** The engine's top move before the move was played. */
  bestUci: string | null
  moverColor: Side
  /** Pawns of material the mover has given up after the engine's best reply (see materialAfterBestReply). */
  materialSwing: number
}

/** Evaluation in centipawns from the mover's point of view, capped. */
export function moverCp(score: Score, moverColor: Side): number {
  return (moverColor === 'w' ? 1 : -1) * scoreToCp(score, EVAL_CAP)
}

function moverMateSign(score: Score, moverColor: Side): 1 | -1 | 0 {
  if (score.kind !== 'mate') return 0
  const sign = mateSign(score)
  return (moverColor === 'w' ? sign : -sign) as 1 | -1
}

function atLeast(current: MoveClass, floor: MoveClass): MoveClass {
  return SEVERITY[current] >= SEVERITY[floor] ? current : floor
}

export function classifyMove(input: ClassifyInput): MoveClass {
  const { before, after, playedUci, bestUci, moverColor, materialSwing } = input
  const cpBefore = moverCp(before, moverColor)
  const cpAfter = moverCp(after, moverColor)
  const loss = Math.max(0, cpBefore - cpAfter)

  let result: MoveClass
  if (loss > MISTAKE_MAX_LOSS) result = 'blunder'
  else if (loss > INACCURACY_MAX_LOSS) result = 'mistake'
  else if (loss > GOOD_MAX_LOSS) result = 'inaccuracy'
  else if (loss > EXCELLENT_MAX_LOSS) result = 'good'
  else if (loss > BEST_MAX_LOSS) result = 'excellent'
  else result = 'best'
  const isEngineMove = bestUci !== null && playedUci === bestUci
  if (isEngineMove) result = 'best'

  const mateBefore = moverMateSign(before, moverColor)
  const mateAfter = moverMateSign(after, moverColor)
  if (!isEngineMove) {
    if (mateBefore > 0 && mateAfter <= 0) result = atLeast(result, 'mistake')
    if (mateAfter < 0 && mateBefore >= 0) result = 'blunder'
  }

  if (
    result === 'best' &&
    mateAfter >= 0 &&
    materialSwing >= BRILLIANT_MIN_SWING &&
    cpAfter >= BRILLIANT_MIN_EVAL
  ) {
    result = 'brilliant'
  }
  return result
}

/**
 * Pawns of material the mover has given up once `playedUci` and the opponent's `bestReplyUci`
 * have been played from `fenBefore` (positive = the mover is worse off than before the move).
 */
export function materialAfterBestReply(
  fenBefore: string,
  playedUci: string,
  bestReplyUci: string | null,
): number {
  const game = new Chess(fenBefore)
  const mover = game.turn()
  const balance = () => {
    let total = 0
    for (const row of game.board()) {
      for (const piece of row) {
        if (piece) total += (piece.color === mover ? 1 : -1) * PIECE_VALUES[piece.type]
      }
    }
    return total
  }
  const start = balance()
  if (!playUci(game, playedUci)) return 0
  if (bestReplyUci) playUci(game, bestReplyUci)
  return start - balance()
}

function playUci(game: Chess, uci: string): boolean {
  try {
    game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: (uci.slice(4, 5) || undefined) as PieceSymbol | undefined,
    })
    return true
  } catch {
    return false
  }
}

function winPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368 * cp)) - 1)
}

/**
 * Accuracy (0–100) of one move from the mover's centipawn evaluations before and after it:
 * Win % = 50 + 50·(2/(1+e^(−0.00368·cp)) − 1); accuracy = 103.17·e^(−0.0435·Δwin%) − 3.17.
 */
export function moveAccuracy(cpBefore: number, cpAfter: number): number {
  const drop = Math.max(0, winPercent(cpBefore) - winPercent(cpAfter))
  const accuracy = 103.17 * Math.exp(-0.0435 * drop) - 3.17
  return Math.max(0, Math.min(100, accuracy))
}

export interface MoveReview {
  color: Side
  uci: string
  san: string
  classification: MoveClass
  accuracy: number
  bestUci: string | null
  bestSan: string | null
  /** Evaluation before the move, relative to White: what the best move would have kept. */
  evalBefore: Score
  evalAfter: Score
}

export interface SideSummary {
  counts: Record<MoveClass, number>
  /** Average move accuracy, or null when the side has no reviewed moves. */
  accuracy: number | null
  moves: number
}

export interface ReviewSummaryData {
  w: SideSummary
  b: SideSummary
}

function emptySide(): { counts: Record<MoveClass, number>; total: number; moves: number } {
  return {
    counts: Object.fromEntries(MOVE_CLASSES.map((cls) => [cls, 0])) as Record<MoveClass, number>,
    total: 0,
    moves: 0,
  }
}

export function summarize(
  results: ReadonlyArray<Pick<MoveReview, 'color' | 'classification' | 'accuracy'> | undefined>,
): ReviewSummaryData {
  const sides = { w: emptySide(), b: emptySide() }
  for (const result of results) {
    if (!result) continue
    const side = sides[result.color]
    side.counts[result.classification]++
    side.total += result.accuracy
    side.moves++
  }
  const finish = (side: ReturnType<typeof emptySide>): SideSummary => ({
    counts: side.counts,
    accuracy: side.moves > 0 ? side.total / side.moves : null,
    moves: side.moves,
  })
  return { w: finish(sides.w), b: finish(sides.b) }
}
