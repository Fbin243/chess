import type { Chess } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_LEVEL, clampLevel } from '../engine/levels'
import { StockfishClient, type ChessEngine } from '../engine/stockfishClient'
import {
  canUndo,
  createGame,
  getStatus,
  isGameOver,
  isPromotionMove,
  oppositeColor,
  tryMove,
  undoTurn,
  type Color,
  type GameStatus,
} from '../game/gameState'

export const STORAGE_KEY = 'chess:v1'

export type NewGameColor = Color | 'random'

interface SavedGame {
  pgn: string
  playerColor: Color
  level: number
}

interface GameState {
  game: Chess
  playerColor: Color
  level: number
  flipped: boolean
  /** Incremented on every New game so board marks reset even when the position is identical. */
  marksResetKey: number
}

export type EngineFactory = () => ChessEngine

function readSaved(): SavedGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return null
    const { pgn, playerColor, level } = data as Partial<SavedGame>
    return {
      pgn: typeof pgn === 'string' ? pgn : '',
      playerColor: playerColor === 'b' ? 'b' : 'w',
      level: clampLevel(typeof level === 'number' ? level : DEFAULT_LEVEL),
    }
  } catch {
    return null
  }
}

function initialState(): GameState {
  const saved = readSaved()
  return {
    game: createGame({ pgn: saved?.pgn }),
    playerColor: saved?.playerColor ?? 'w',
    level: saved?.level ?? DEFAULT_LEVEL,
    flipped: false,
    marksResetKey: 0,
  }
}

const defaultEngineFactory: EngineFactory = () => new StockfishClient()

export function useChessGame(createEngine: EngineFactory = defaultEngineFactory) {
  const [state, setState] = useState<GameState>(initialState)
  const [engineError, setEngineError] = useState<string | null>(null)
  const { game, playerColor, level, flipped, marksResetKey } = state

  const engineRef = useRef<ChessEngine | null>(null)
  const levelRef = useRef(level)
  const factoryRef = useRef(createEngine)

  useEffect(() => {
    levelRef.current = level
  }, [level])

  useEffect(() => {
    try {
      const saved: SavedGame = { pgn: game.pgn(), playerColor, level }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    } catch {
      // Storage may be unavailable (private mode / quota); the game still works.
    }
  }, [game, playerColor, level])

  useEffect(
    () => () => {
      engineRef.current?.dispose()
      engineRef.current = null
    },
    [],
  )

  const status: GameStatus = useMemo(() => getStatus(game), [game])
  const over = isGameOver(status)
  const botTurn = !over && game.turn() !== playerColor
  const thinking = botTurn && engineError === null

  useEffect(() => {
    if (!botTurn || engineError !== null) return
    const engine = (engineRef.current ??= factoryRef.current())
    const fen = game.fen()
    let cancelled = false

    engine
      .bestMove(fen, levelRef.current)
      .then((uci) => {
        if (cancelled || !uci) return
        const result = tryMove(game, {
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.slice(4, 5) || undefined,
        })
        if (!result) throw new Error(`Engine returned an illegal move: ${uci}`)
        setState((prev) => (prev.game === game ? { ...prev, game: result.game } : prev))
      })
      .catch((error: unknown) => {
        if (cancelled) return
        engineRef.current?.dispose()
        engineRef.current = null
        setEngineError(error instanceof Error ? error.message : 'The engine failed to start.')
      })

    return () => {
      cancelled = true
      engine.stop()
    }
  }, [game, botTurn, engineError])

  const makeMove = useCallback(
    (from: string, to: string, promotion?: string): boolean => {
      if (over || game.turn() !== playerColor) return false
      const result = tryMove(game, { from, to, promotion })
      if (!result) return false
      setState((prev) => ({ ...prev, game: result.game }))
      return true
    },
    [game, over, playerColor],
  )

  const needsPromotion = useCallback(
    (from: string, to: string) => isPromotionMove(game, from, to),
    [game],
  )

  const newGame = useCallback((choice: NewGameColor) => {
    const color: Color = choice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : choice
    engineRef.current?.newGame()
    setEngineError(null)
    setState((prev) => ({
      ...prev,
      game: createGame(),
      playerColor: color,
      flipped: false,
      marksResetKey: prev.marksResetKey + 1,
    }))
  }, [])

  const undo = useCallback(() => {
    setState((prev) => {
      const next = undoTurn(prev.game, prev.playerColor)
      return next === prev.game ? prev : { ...prev, game: next }
    })
  }, [])

  const setLevel = useCallback((value: number) => {
    setState((prev) => ({ ...prev, level: clampLevel(value) }))
  }, [])

  const flip = useCallback(() => {
    setState((prev) => ({ ...prev, flipped: !prev.flipped }))
  }, [])

  const retryEngine = useCallback(() => setEngineError(null), [])

  const orientation: Color = flipped ? oppositeColor(playerColor) : playerColor

  return {
    game,
    playerColor,
    level,
    orientation,
    marksResetKey,
    status,
    over,
    thinking,
    engineError,
    canUndo: canUndo(game, playerColor),
    canMove: !over && !botTurn,
    makeMove,
    needsPromotion,
    newGame,
    undo,
    setLevel,
    flip,
    retryEngine,
  }
}
