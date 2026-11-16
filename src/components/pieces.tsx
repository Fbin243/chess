import type { CSSProperties } from 'react'
import type { PieceRenderObject } from 'react-chessboard'
import wK from '../assets/pieces/wK.svg'
import wQ from '../assets/pieces/wQ.svg'
import wR from '../assets/pieces/wR.svg'
import wB from '../assets/pieces/wB.svg'
import wN from '../assets/pieces/wN.svg'
import wP from '../assets/pieces/wP.svg'
import bK from '../assets/pieces/bK.svg'
import bQ from '../assets/pieces/bQ.svg'
import bR from '../assets/pieces/bR.svg'
import bB from '../assets/pieces/bB.svg'
import bN from '../assets/pieces/bN.svg'
import bP from '../assets/pieces/bP.svg'

/**
 * Classic "cburnett" piece set (Colin M.L. Burnett, Wikimedia Commons,
 * BSD/CC-BY-SA/GFDL). chess.com's own "Neo" pieces are proprietary and
 * cannot be redistributed, so this open set is used as a close, licensable
 * substitute. See README's License section for attribution.
 */
const PIECE_SRC: Record<string, string> = { wK, wQ, wR, wB, wN, wP, bK, bQ, bR, bB, bN, bP }

function renderPiece(src: string) {
  return (props?: { svgStyle?: CSSProperties }) => (
    <img
      src={src}
      alt=""
      draggable={false}
      style={{ width: '100%', height: '100%', pointerEvents: 'none', ...props?.svgStyle }}
    />
  )
}

export const cburnettPieces: PieceRenderObject = Object.fromEntries(
  Object.entries(PIECE_SRC).map(([code, src]) => [code, renderPiece(src)]),
) as PieceRenderObject
