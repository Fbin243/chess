import type { Chess, Square } from 'chess.js'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { Chessboard, defaultArrowOptions } from 'react-chessboard'
import { kingInCheckSquare, type Color, type PromotionPiece } from '../game/gameState'
import { PromotionDialog } from './PromotionDialog'
import {
  ARROW_COLORS,
  NO_MODIFIERS,
  highlightStyle,
  markColorFor,
  toggleHighlight,
  type Highlights,
  type Modifiers,
} from './marks'
import { cburnettPieces } from './pieces'

const ARROW_OPTIONS = { ...defaultArrowOptions, colors: ARROW_COLORS }
const NO_HIGHLIGHTS: Highlights = {}

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
  /** Changes when a new game starts, so arrows and highlights reset even if the position did not. */
  marksResetKey?: number
  /** Changes when the "Clear marks" button is pressed. */
  clearMarksSignal?: number
  onMarksChange?: (hasMarks: boolean) => void
}

export function Board({
  game,
  orientation,
  playerColor,
  canMove,
  lastMove,
  needsPromotion,
  onMove,
  marksResetKey = 0,
  clearMarksSignal = 0,
  onMarksChange,
}: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null)
  const [escapeCount, setEscapeCount] = useState(0)
  const [arrowCount, setArrowCount] = useState(0)
  const [drawn, setDrawn] = useState<{ owner: string; highlights: Highlights }>({
    owner: '',
    highlights: NO_HIGHLIGHTS,
  })
  const mods = useRef<Modifiers>(NO_MODIFIERS)

  // Marks belong to one position and one reset: any change of either empties them.
  const fen = game.fen()
  const marksKey = `${marksResetKey}:${clearMarksSignal}:${escapeCount}`
  const owner = `${fen}|${marksKey}`
  const highlights = drawn.owner === owner ? drawn.highlights : NO_HIGHLIGHTS
  const highlightCount = Object.keys(highlights).length
  const hasMarks = arrowCount > 0 || highlightCount > 0

  useEffect(() => {
    onMarksChange?.(hasMarks)
  }, [hasMarks, onMarksChange])

  useEffect(() => {
    if (!hasMarks || pending) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEscapeCount((count) => count + 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hasMarks, pending])

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
    for (const [square, color] of Object.entries(highlights)) add(square, highlightStyle(color))
    const check = kingInCheckSquare(game)
    if (check) add(check, { backgroundImage: CHECK_GLOW })
    if (active) add(active, { backgroundColor: SELECTED_BG })
    for (const [square, isCapture] of targets) {
      add(square, { backgroundImage: isCapture ? TARGET_RING : TARGET_DOT })
    }
    return styles
  }, [game, lastMove, active, targets, highlights])

  const attempt = (from: string, to: string): boolean => {
    setSelected(null)
    if (needsPromotion(from, to)) {
      setPending({ from, to })
      return false
    }
    return onMove(from, to)
  }

  const handleSquareMouseDown = (_: unknown, event: ReactMouseEvent) => {
    if (event.button === 2) {
      mods.current = {
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      }
    } else if (event.button === 0) {
      setDrawn({ owner, highlights: NO_HIGHLIGHTS })
    }
  }

  const handleSquareRightClick = ({ square }: { square: string }) => {
    const color = markColorFor(mods.current)
    setDrawn({ owner, highlights: toggleHighlight(highlights, square, color) })
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
    <div className="board-frame" data-testid="board-frame">
      <Chessboard
        key={marksKey}
        options={{
          id: 'board',
          position: fen,
          boardOrientation: orientation === 'w' ? 'white' : 'black',
          allowDragging: canMove,
          allowDrawingArrows: true,
          arrowOptions: ARROW_OPTIONS,
          clearArrowsOnClick: true,
          clearArrowsOnPositionChange: true,
          onArrowsChange: ({ arrows }) => setArrowCount(arrows.length),
          animationDurationInMs: 150,
          lightSquareStyle: { backgroundColor: LIGHT_SQUARE },
          darkSquareStyle: { backgroundColor: DARK_SQUARE },
          pieces: cburnettPieces,
          squareStyles,
          canDragPiece: ({ piece }) =>
            canMove && piece.pieceType.startsWith(playerColor),
          onPieceDrag: ({ square }) => setSelected(square),
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!targetSquare || targetSquare === sourceSquare) return false
            return attempt(sourceSquare, targetSquare)
          },
          onSquareClick: handleSquareClick,
          onSquareMouseDown: handleSquareMouseDown,
          onSquareRightClick: handleSquareRightClick,
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
