import { useEffect, useRef, useState } from 'react'
import { MAX_LEVEL, MIN_LEVEL } from '../engine/levels'
import { describeStatus, type Color, type GameStatus, type MoveRow } from '../game/gameState'
import type { NewGameColor } from '../hooks/useChessGame'

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
  onNewGame: (color: NewGameColor) => void
  onUndo: () => void
  onFlip: () => void
  onLevel: (level: number) => void
  onRetryEngine: () => void
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
  onNewGame,
  onUndo,
  onFlip,
  onLevel,
  onRetryEngine,
}: SidePanelProps) {
  const [choice, setChoice] = useState<NewGameColor>('w')
  const listRef = useRef<HTMLOListElement>(null)

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
          {rows.map((row) => (
            <li key={row.number}>
              <span className="move-number">{row.number}.</span>
              <span className="ply" data-testid="ply">
                {row.white ?? '…'}
              </span>
              {row.black !== undefined && (
                <span className="ply" data-testid="ply">
                  {row.black}
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

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
