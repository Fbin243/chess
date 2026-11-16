import type { Chess, Square } from 'chess.js'
import { useMemo, useState, type CSSProperties } from 'react'
import { Chessboard } from 'react-chessboard'
import { kingInCheckSquare, type Color, type PromotionPiece } from '../game/gameState'
import { PromotionDialog } from './PromotionDialog'

export const LIGHT_SQUARE = '#eeeed2'
export const DARK_SQUARE = '#769656'

const LAST_MOVE_BG = 'rgba(255, 221, 51, 0.5)'
const SELECTED_BG = 'rgba(255, 221, 51, 0.8)'
const TARGET_DOT = 'radial-gradient(circle, rgba(20, 85, 30, 0.5) 22%, transparent 24%)'
const TARGET_RING = 'radial-gradient(circle, transparent 60%, rgba(20, 85, 30, 0.5) 62%)'
const CHECK_GLOW =
  'radial-gradient(circle, rgba(255, 0, 0, 0.9) 0%, rgba(231, 0, 0, 0.6) 40%, transparent 75%)'

interface BoardProps {
  game: Chess
  orientation: Color
  playerColor: Color
  canMove: boolean
  lastMove: { from: string; to: string } | null
  needsPromotion: (from: string, to: string) => boolean
  onMove: (from: string, to: string, promotion?: string) => boolean
}

export function Board({
  game,
  orientation,
  playerColor,
  canMove,
  lastMove,
  needsPromotion,
  onMove,
}: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null)

  const active =
    selected && canMove && game.get(selected as Square)?.color === playerColor ? selected : null

  const targets = useMemo(() => {
    if (!active) return new Map<string, boolean>()
    const moves = game.moves({ square: active as Square, verbose: true })
    return new Map(moves.map((move) => [move.to, move.isCapture() || move.isEnPassant()]))
  }, [game, active])

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {}
    const add = (square: string, style: CSSProperties) => {
      styles[square] = { ...styles[square], ...style }
    }
    if (lastMove) {
      add(lastMove.from, { backgroundColor: LAST_MOVE_BG })
      add(lastMove.to, { backgroundColor: LAST_MOVE_BG })
    }
    const check = kingInCheckSquare(game)
    if (check) add(check, { backgroundImage: CHECK_GLOW })
    if (active) add(active, { backgroundColor: SELECTED_BG })
    for (const [square, isCapture] of targets) {
      add(square, { backgroundImage: isCapture ? TARGET_RING : TARGET_DOT })
    }
    return styles
  }, [game, lastMove, active, targets])

  const attempt = (from: string, to: string): boolean => {
    setSelected(null)
    if (needsPromotion(from, to)) {
      setPending({ from, to })
      return false
    }
    return onMove(from, to)
  }

  const handleSquareClick = ({ square }: { square: string }) => {
    if (!canMove) return
    if (active && targets.has(square)) {
      attempt(active, square)
      return
    }
    const piece = game.get(square as Square)
    setSelected(piece && piece.color === playerColor && square !== active ? square : null)
  }

  const choosePromotion = (piece: PromotionPiece) => {
    if (pending) onMove(pending.from, pending.to, piece)
    setPending(null)
  }

  return (
    <div className="board-frame">
      <Chessboard
        options={{
          id: 'board',
          position: game.fen(),
          boardOrientation: orientation === 'w' ? 'white' : 'black',
          allowDragging: canMove,
          allowDrawingArrows: false,
          animationDurationInMs: 150,
          lightSquareStyle: { backgroundColor: LIGHT_SQUARE },
          darkSquareStyle: { backgroundColor: DARK_SQUARE },
          squareStyles,
          canDragPiece: ({ piece }) =>
            canMove && piece.pieceType.startsWith(playerColor),
          onPieceDrag: ({ square }) => setSelected(square),
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!targetSquare || targetSquare === sourceSquare) return false
            return attempt(sourceSquare, targetSquare)
          },
          onSquareClick: handleSquareClick,
        }}
      />
      {pending && (
        <PromotionDialog
          color={playerColor}
          onSelect={choosePromotion}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}
