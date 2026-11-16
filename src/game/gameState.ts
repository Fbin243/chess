import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js'

export type Color = 'w' | 'b'
export type PromotionPiece = 'q' | 'r' | 'b' | 'n'

export type GameStatus =
  | { kind: 'playing' }
  | { kind: 'check' }
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'stalemate' }
  | { kind: 'threefold' }
  | { kind: 'insufficient' }
  | { kind: 'fiftyMove' }

export interface MoveRow {
  number: number
  white?: string
  black?: string
}

export interface MoveAttempt {
  from: string
  to: string
  promotion?: string
}

export function oppositeColor(color: Color): Color {
  return color === 'w' ? 'b' : 'w'
}

export function createGame(source: { fen?: string; pgn?: string } = {}): Chess {
  try {
    if (source.pgn) {
      const game = new Chess()
      game.loadPgn(source.pgn)
      return game
    }
    if (source.fen) return new Chess(source.fen)
  } catch {
    // Saved data may be corrupted; fall back to a fresh game below.
  }
  return new Chess()
}

export function cloneGame(game: Chess): Chess {
  const next = createGame({ pgn: game.pgn() })
  if (next.history().length === game.history().length) return next
  return new Chess(game.fen())
}

export function isPromotionMove(game: Chess, from: string, to: string): boolean {
  return game
    .moves({ square: from as Square, verbose: true })
    .some((move) => move.to === to && move.isPromotion())
}

export function tryMove(
  game: Chess,
  attempt: MoveAttempt,
): { game: Chess; move: Move } | null {
  const next = cloneGame(game)
  try {
    const move = next.move({
      from: attempt.from,
      to: attempt.to,
      promotion: (attempt.promotion as PieceSymbol | undefined) ?? undefined,
    })
    return { game: next, move }
  } catch {
    return null
  }
}

export function canUndo(game: Chess, playerColor: Color): boolean {
  return game.history({ verbose: true }).some((move) => move.color === playerColor)
}

/** Takes back the player's last move together with any bot reply after it. */
export function undoTurn(game: Chess, playerColor: Color): Chess {
  if (!canUndo(game, playerColor)) return game
  const next = cloneGame(game)
  for (;;) {
    const undone = next.undo()
    if (!undone || undone.color === playerColor) break
  }
  return next
}

export function getStatus(game: Chess): GameStatus {
  if (game.isCheckmate()) return { kind: 'checkmate', winner: oppositeColor(game.turn()) }
  if (game.isStalemate()) return { kind: 'stalemate' }
  if (game.isThreefoldRepetition()) return { kind: 'threefold' }
  if (game.isInsufficientMaterial()) return { kind: 'insufficient' }
  if (game.isDrawByFiftyMoves()) return { kind: 'fiftyMove' }
  if (game.isCheck()) return { kind: 'check' }
  return { kind: 'playing' }
}

export function isGameOver(status: GameStatus): boolean {
  return status.kind !== 'playing' && status.kind !== 'check'
}

export function kingInCheckSquare(game: Chess): string | null {
  if (!game.isCheck()) return null
  const turn = game.turn()
  for (const row of game.board()) {
    for (const piece of row) {
      if (piece && piece.type === 'k' && piece.color === turn) return piece.square
    }
  }
  return null
}

export function moveRows(game: Chess): MoveRow[] {
  const rows: MoveRow[] = []
  for (const move of game.history({ verbose: true })) {
    const last = rows.at(-1)
    if (move.color === 'w') {
      rows.push({ number: rows.length + 1, white: move.san })
    } else if (last && last.black === undefined && last.white !== undefined) {
      last.black = move.san
    } else {
      rows.push({ number: rows.length + 1, black: move.san })
    }
  }
  return rows
}

export function describeStatus(status: GameStatus, playerColor: Color): string {
  switch (status.kind) {
    case 'playing':
      return ''
    case 'check':
      return 'Check!'
    case 'checkmate':
      return status.winner === playerColor ? 'Checkmate — you win!' : 'Checkmate — the bot wins.'
    case 'stalemate':
      return 'Draw by stalemate.'
    case 'threefold':
      return 'Draw by threefold repetition.'
    case 'insufficient':
      return 'Draw by insufficient material.'
    case 'fiftyMove':
      return 'Draw by the 50-move rule.'
  }
}
