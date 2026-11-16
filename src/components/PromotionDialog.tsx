import { useEffect, useRef } from 'react'
import type { Color, PromotionPiece } from '../game/gameState'
import wQ from '../assets/pieces/wQ.svg'
import wR from '../assets/pieces/wR.svg'
import wB from '../assets/pieces/wB.svg'
import wN from '../assets/pieces/wN.svg'
import bQ from '../assets/pieces/bQ.svg'
import bR from '../assets/pieces/bR.svg'
import bB from '../assets/pieces/bB.svg'
import bN from '../assets/pieces/bN.svg'

const PIECES: ReadonlyArray<{ piece: PromotionPiece; label: string; white: string; black: string }> = [
  { piece: 'q', label: 'Queen', white: wQ, black: bQ },
  { piece: 'r', label: 'Rook', white: wR, black: bR },
  { piece: 'b', label: 'Bishop', white: wB, black: bB },
  { piece: 'n', label: 'Knight', white: wN, black: bN },
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
        <p className="promotion-title">Promote to</p>
        <div className="promotion-options">
          {PIECES.map(({ piece, label, white, black }, index) => (
            <button
              key={piece}
              ref={index === 0 ? firstRef : undefined}
              type="button"
              className="promotion-option"
              aria-label={label}
              onClick={() => onSelect(piece)}
            >
              <img src={color === 'w' ? white : black} alt="" draggable={false} />
              <span className="promotion-label">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
