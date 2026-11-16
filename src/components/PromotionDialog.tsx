import { useEffect, useRef } from 'react'
import type { Color, PromotionPiece } from '../game/gameState'

const PIECES: ReadonlyArray<{ piece: PromotionPiece; label: string; white: string; black: string }> = [
  { piece: 'q', label: 'Queen', white: '♕', black: '♛' },
  { piece: 'r', label: 'Rook', white: '♖', black: '♜' },
  { piece: 'b', label: 'Bishop', white: '♗', black: '♝' },
  { piece: 'n', label: 'Knight', white: '♘', black: '♞' },
]

interface PromotionDialogProps {
  color: Color
  onSelect: (piece: PromotionPiece) => void
  onCancel: () => void
}

export function PromotionDialog({ color, onSelect, onCancel }: PromotionDialogProps) {
  const firstRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  return (
    <div
      className="promotion-backdrop"
      onClick={onCancel}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel()
      }}
    >
      <div
        className="promotion-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Choose promotion piece"
        onClick={(event) => event.stopPropagation()}
      >
        {PIECES.map(({ piece, label, white, black }, index) => (
          <button
            key={piece}
            ref={index === 0 ? firstRef : undefined}
            type="button"
            className="promotion-option"
            aria-label={label}
            onClick={() => onSelect(piece)}
          >
            <span aria-hidden="true">{color === 'w' ? white : black}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
