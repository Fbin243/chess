import { useEffect, useRef, useState } from 'react'
import { formatEval } from '../engine/uci'
import { MAX_LEVEL, MIN_LEVEL } from '../engine/levels'
import { describeStatus, type Color, type GameStatus, type MoveRow } from '../game/gameState'
import type { ReviewState } from '../hooks/useAnalysis'
import type { NewGameColor } from '../hooks/useChessGame'
import { CLASS_GLYPHS, CLASS_LABELS, type MoveReview } from '../review/classify'
import { ReviewSummary } from './ReviewSummary'

interface SidePanelProps {
  rows: MoveRow[]
  plyCount: number
  status: GameStatus
  over: boolean
  playerColor: Color
  level: number
  thinking: boolean
  canUndo: boolean
  engineError: string | null
  review: ReviewState
  analysisError: string | null
  showEval: boolean
  hasMarks: boolean
  onShowEval: (show: boolean) => void
  onClearMarks: () => void
  onStartReview: () => void
  onCancelReview: () => void
  onNewGame: (color: NewGameColor) => void
  onUndo: () => void
  onFlip: () => void
  onLevel: (level: number) => void
  onRetryEngine: () => void
}

function tooltipFor(move: MoveReview): string {
  const label = CLASS_LABELS[move.classification]
  const alternative = move.classification !== 'brilliant' && move.classification !== 'best'
  if (move.bestSan && move.bestUci !== move.uci && alternative) {
    return `${label} — best was ${move.bestSan} (${formatEval(move.evalBefore)})`
  }
  return label
}

interface PlyProps {
  san: string
  review: MoveReview | undefined
  anyReviewed: boolean
}

function Ply({ san, review, anyReviewed }: PlyProps) {
  const tooltip = review ? tooltipFor(review) : anyReviewed ? 'Not reviewed' : undefined
  return (
    <span className="ply-cell" title={tooltip}>
      <span
        className={review ? `ply cls-${review.classification}` : 'ply'}
        data-testid="ply"
        data-class={review?.classification}
      >
        {san}
      </span>
      {review && (
        <span
          className={`ply-icon cls-${review.classification}`}
          data-testid="ply-icon"
          role="img"
          aria-label={tooltip}
        >
          {CLASS_GLYPHS[review.classification]}
        </span>
      )}
    </span>
  )
}

const COLOR_CHOICES: ReadonlyArray<{ value: NewGameColor; label: string }> = [
  { value: 'w', label: 'White' },
  { value: 'b', label: 'Black' },
  { value: 'random', label: 'Random' },
]

export function SidePanel({
  rows,
  plyCount,
  status,
  over,
  playerColor,
  level,
  thinking,
  canUndo,
  engineError,
  review,
  analysisError,
  showEval,
  hasMarks,
  onShowEval,
  onClearMarks,
  onStartReview,
  onCancelReview,
  onNewGame,
  onUndo,
  onFlip,
  onLevel,
  onRetryEngine,
}: SidePanelProps) {
  const [choice, setChoice] = useState<NewGameColor>('w')
  const listRef = useRef<HTMLOListElement>(null)
  const anyReviewed = review.byPly.some((entry) => entry !== undefined)

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [plyCount])

  const statusText = over
    ? describeStatus(status, playerColor)
    : thinking
      ? 'Bot is thinking…'
      : status.kind === 'check'
        ? 'Check! Your move.'
        : 'Your move.'

  return (
    <aside className="side-panel" aria-label="Game controls">
      <section aria-label="Game status">
        <p className="status" role="status" aria-live="polite" data-testid="status">
          {statusText}
        </p>
        <p className="muted">
          You play {playerColor === 'w' ? 'White' : 'Black'}
        </p>
        {engineError && (
          <div className="error" role="alert">
            <p>Engine problem: {engineError}</p>
            <button type="button" onClick={onRetryEngine}>
              Retry
            </button>
          </div>
        )}
        {analysisError && (
          <p className="error" role="alert" data-testid="analysis-error">
            Analysis problem: {analysisError}
          </p>
        )}
      </section>

      {over && (
        <div className="game-over" role="alertdialog" aria-label="Game over">
          <p>{describeStatus(status, playerColor)}</p>
          <button type="button" className="primary" onClick={() => onNewGame(choice)}>
            New game
          </button>
        </div>
      )}

      <section aria-label="Moves">
        <h2>Moves</h2>
        <ol className="move-list" ref={listRef} data-testid="move-list" tabIndex={0}>
          {rows.length === 0 && <li className="muted">No moves yet.</li>}
          {rows.map((row, index) => (
            <li key={row.number}>
              <span className="move-number">{row.number}.</span>
              <Ply
                san={row.white ?? '…'}
                review={review.byPly[index * 2]}
                anyReviewed={anyReviewed}
              />
              {row.black !== undefined && (
                <Ply
                  san={row.black}
                  review={review.byPly[index * 2 + 1]}
                  anyReviewed={anyReviewed}
                />
              )}
            </li>
          ))}
        </ol>
      </section>

      <ReviewSummary
        review={review}
        moveCount={plyCount}
        onStart={onStartReview}
        onCancel={onCancelReview}
      />

      <section aria-label="Level">
        <label htmlFor="level">
          Level <output htmlFor="level">{level}</output>
        </label>
        <input
          id="level"
          type="range"
          min={MIN_LEVEL}
          max={MAX_LEVEL}
          step={1}
          value={level}
          onChange={(event) => onLevel(Number(event.target.value))}
          aria-valuetext={`Level ${level} of ${MAX_LEVEL}`}
        />
        <p className="muted small">Takes effect from the bot’s next move.</p>
      </section>

      <section aria-label="Actions" className="actions">
        <button type="button" onClick={onUndo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" onClick={onFlip}>
          Flip board
        </button>
      </section>

      <section aria-label="Board marks" className="marks-controls">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showEval}
            onChange={(event) => onShowEval(event.target.checked)}
          />
          Show eval bar
        </label>
        <button type="button" onClick={onClearMarks} disabled={!hasMarks}>
          Clear marks
        </button>
        <p className="muted small">Right-click or right-drag the board to mark squares and arrows.</p>
      </section>

      <section aria-label="New game">
        <fieldset className="color-choice">
          <legend>Play as</legend>
          {COLOR_CHOICES.map(({ value, label }) => (
            <label key={value}>
              <input
                type="radio"
                name="new-game-color"
                value={value}
                checked={choice === value}
                onChange={() => setChoice(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <button type="button" className="primary" onClick={() => onNewGame(choice)}>
          New game
        </button>
      </section>
    </aside>
  )
}
