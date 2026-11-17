import type { CSSProperties } from 'react'
import { evalToBarFraction, formatEval, mateSign, type Score } from '../engine/uci'
import type { Color } from '../game/gameState'

interface EvalBarProps {
  /** Engine score from White's side, or null before the first result. */
  score: Score | null
  /** Side shown at the bottom (vertical bar) or the left (stacked layout). */
  orientation: Color
  /** Replaces the number when the game is over: "1-0", "0-1" or "½-½". */
  resultLabel?: string | null
}

function whiteIsAhead(score: Score | null): boolean {
  if (!score) return true
  return score.kind === 'mate' ? mateSign(score) >= 0 : score.value >= 0
}

function describe(score: Score | null, resultLabel: string | null): string {
  if (resultLabel) return `Game over, result ${resultLabel}`
  if (!score) return 'Evaluation pending'
  const text = formatEval(score)
  if (score.kind === 'mate') {
    return `Evaluation ${text.replace('−', '')}, ${mateSign(score) >= 0 ? 'White' : 'Black'} mates`
  }
  const side = score.value === 0 ? 'both sides' : score.value > 0 ? 'White' : 'Black'
  return `Evaluation ${text} for ${side}`
}

export function EvalBar({ score, orientation, resultLabel = null }: EvalBarProps) {
  const fraction = score ? evalToBarFraction(score) : 0.5
  const label = resultLabel ?? (score ? formatEval(score) : '')
  const text = describe(score, resultLabel)

  return (
    <div
      className="eval-bar"
      role="meter"
      aria-label={text}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      aria-valuetext={text}
      data-testid="eval-bar"
      data-eval={score || resultLabel ? label : undefined}
      data-white-first={orientation === 'w'}
      data-label-side={whiteIsAhead(score) ? 'white' : 'black'}
      style={{ '--f': fraction } as CSSProperties}
    >
      <div className="eval-fill" />
      {label && (
        <span className="eval-label" data-long={label.length > 4} aria-hidden="true">
          {label}
        </span>
      )}
    </div>
  )
}
