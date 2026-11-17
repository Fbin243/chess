import { Chess, type Move } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AnalysisEngine,
  terminalResult,
  type AnalysisEngineFactory,
  type AnalysisEngineLike,
  type AnalysisResult,
} from '../engine/analysisEngine'
import type { Score } from '../engine/uci'
import {
  classifyMove,
  materialAfterBestReply,
  moveAccuracy,
  moverCp,
  summarize,
  type MoveReview,
  type ReviewSummaryData,
} from '../review/classify'

export const UI_STORAGE_KEY = 'chess:ui:v1'
export const LIVE_DEPTH = 16
export const LIVE_MOVETIME_MS = 1500
export const REVIEW_DEPTH = 14

export type ReviewStatus = 'idle' | 'running' | 'done'

export interface LiveEval {
  score: Score
  depth: number
}

export interface ReviewState {
  status: ReviewStatus
  /** 0–1 share of the positions analysed so far. */
  progress: number
  /** One entry per move played (index = ply − 1); undefined while that move is not reviewed. */
  byPly: ReadonlyArray<MoveReview | undefined>
  summary: ReviewSummaryData | null
}

interface CachedPosition {
  /** The moves played to reach the position, so the entry only applies to that exact line. */
  key: string
  result: AnalysisResult
}

const defaultFactory: AnalysisEngineFactory = () => new AnalysisEngine()

function readShowEval(): boolean {
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY)
    if (!raw) return true
    const data: unknown = JSON.parse(raw)
    if (typeof data === 'object' && data !== null && 'showEval' in data) {
      return (data as { showEval: unknown }).showEval !== false
    }
  } catch {
    // Storage may be unavailable or corrupted; the default is to show the bar.
  }
  return true
}

function writeShowEval(showEval: boolean): void {
  try {
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ showEval }))
  } catch {
    // Storage may be unavailable (private mode / quota); the toggle still works.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The analysis engine failed.'
}

interface Line {
  keys: string[]
  fens: string[]
  moves: Move[]
}

function replay(game: Chess): Line {
  const history = game.history({ verbose: true })
  const walker = new Chess()
  const keys = ['']
  const fens = [walker.fen()]
  const sans: string[] = []
  for (const move of history) {
    walker.move({ from: move.from, to: move.to, promotion: move.promotion })
    sans.push(move.san)
    keys.push(sans.join(' '))
    fens.push(walker.fen())
  }
  return { keys, fens, moves: history }
}

function uciOf(move: { from: string; to: string; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`
}

function sanOfUci(fen: string, uci: string | null): string | null {
  if (!uci) return null
  try {
    return new Chess(fen).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4, 5) || undefined,
    }).san
  } catch {
    return null
  }
}

export function useAnalysis(
  game: Chess,
  over: boolean,
  createEngine: AnalysisEngineFactory = defaultFactory,
) {
  const [showEval, setShowEvalState] = useState(readShowEval)
  const [liveEval, setLiveEval] = useState<LiveEval | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [cache, setCache] = useState<ReadonlyArray<CachedPosition | undefined>>([])
  const [status, setStatus] = useState<ReviewStatus>('idle')
  const [progress, setProgress] = useState(0)

  const engineRef = useRef<AnalysisEngineLike | null>(null)
  const factoryRef = useRef(createEngine)
  const runRef = useRef(0)

  const line = useMemo(() => replay(game), [game])
  const fen = game.fen()
  const moveCount = line.moves.length

  const getEngine = useCallback((): AnalysisEngineLike => {
    return (engineRef.current ??= factoryRef.current())
  }, [])

  const failEngine = useCallback((error: unknown) => {
    engineRef.current?.dispose()
    engineRef.current = null
    setAnalysisError(errorMessage(error))
  }, [])

  useEffect(
    () => () => {
      engineRef.current?.dispose()
      engineRef.current = null
    },
    [],
  )

  const setShowEval = useCallback((value: boolean) => {
    setShowEvalState(value)
    writeShowEval(value)
  }, [])

  // Entries that are no longer part of the game (after Undo or a new game) are dropped.
  const validCache = cache.filter((entry, index) => entry && entry.key === line.keys[index])
  if (validCache.length !== cache.filter(Boolean).length) {
    setCache(cache.map((entry, index) => (entry && entry.key === line.keys[index] ? entry : undefined)))
  }

  const reviewRunning = status === 'running'

  // Live evaluation of the current position.
  useEffect(() => {
    if (over || !showEval || reviewRunning) return
    const engine = getEngine()
    let stale = false
    engine
      .analyze(fen, {
        depth: LIVE_DEPTH,
        movetimeMs: LIVE_MOVETIME_MS,
        priority: 'live',
        onInfo: (info) => {
          if (stale) return
          setAnalysisError(null)
          setLiveEval({ score: info.score, depth: info.depth })
        },
      })
      .then((result) => {
        if (!stale && result) setLiveEval({ score: result.score, depth: result.depth })
      })
      .catch((error: unknown) => {
        if (!stale) failEngine(error)
      })
    return () => {
      stale = true
      engine.cancel('live')
    }
  }, [fen, over, showEval, reviewRunning, getEngine, failEngine])

  const stopReview = useCallback(() => {
    if (runRef.current === 0) return
    runRef.current++
    engineRef.current?.cancel('review')
    setStatus('idle')
    setProgress(0)
  }, [])

  // Any change to the game cancels a running review.
  useEffect(() => stopReview, [game, stopReview])

  const startReview = useCallback(() => {
    if (moveCount === 0) return
    const token = ++runRef.current
    const positions = line.fens
    const keys = line.keys
    const existing = new Map<number, CachedPosition>()
    cache.forEach((entry, index) => {
      if (entry && entry.key === keys[index]) existing.set(index, entry)
    })
    let done = existing.size
    setStatus('running')
    setProgress(done / positions.length)

    const replayGame = new Chess()
    const run = async () => {
      const engine = getEngine()
      for (let index = 0; index < positions.length; index++) {
        if (index > 0) {
          const move = line.moves[index - 1]
          replayGame.move({ from: move.from, to: move.to, promotion: move.promotion })
        }
        if (existing.has(index)) continue
        const result =
          terminalResult(replayGame) ??
          (await engine.analyze(positions[index], { depth: REVIEW_DEPTH, priority: 'review' }))
        if (token !== runRef.current || !result) return
        done++
        const entry: CachedPosition = { key: keys[index], result }
        setCache((prev) => {
          const next = prev.slice()
          next[index] = entry
          return next.map((item, i) => (item && item.key === keys[i] ? item : undefined))
        })
        setProgress(done / positions.length)
      }
      if (token === runRef.current) {
        setStatus('done')
        setProgress(1)
      }
    }
    run().catch((error: unknown) => {
      if (token !== runRef.current) return
      runRef.current++
      setStatus('idle')
      setProgress(0)
      failEngine(error)
    })
  }, [cache, getEngine, failEngine, line, moveCount])

  const cancelReview = stopReview

  // Review automatically when the game ends.
  const prevOver = useRef(over)
  const startRef = useRef(startReview)
  useEffect(() => {
    startRef.current = startReview
  })
  useEffect(() => {
    if (over && !prevOver.current && moveCount > 0) startRef.current()
    prevOver.current = over
  }, [over, game, moveCount])

  const byPly = useMemo(() => {
    const reviews: Array<MoveReview | undefined> = []
    line.moves.forEach((move, index) => {
      const before = cache[index]
      const after = cache[index + 1]
      if (!before || !after || before.key !== line.keys[index] || after.key !== line.keys[index + 1]) {
        reviews.push(undefined)
        return
      }
      const playedUci = uciOf(move)
      const bestUci = before.result.bestMove
      const swing = materialAfterBestReply(line.fens[index], playedUci, after.result.bestMove)
      const classification = classifyMove({
        before: before.result.score,
        after: after.result.score,
        playedUci,
        bestUci,
        moverColor: move.color,
        materialSwing: swing,
      })
      reviews.push({
        color: move.color,
        uci: playedUci,
        san: move.san,
        classification,
        accuracy: moveAccuracy(
          moverCp(before.result.score, move.color),
          moverCp(after.result.score, move.color),
        ),
        bestUci,
        bestSan: bestUci === playedUci ? null : sanOfUci(line.fens[index], bestUci),
        evalBefore: before.result.score,
        evalAfter: after.result.score,
      })
    })
    return reviews
  }, [cache, line])

  const summary = useMemo(
    () => (byPly.some(Boolean) ? summarize(byPly) : null),
    [byPly],
  )

  const terminal = useMemo(() => (over ? terminalResult(game) : null), [over, game])
  const shownEval: LiveEval | null = terminal
    ? { score: terminal.score, depth: 0 }
    : liveEval

  const review: ReviewState = { status, progress, byPly, summary }

  return {
    liveEval: shownEval,
    showEval,
    setShowEval,
    review,
    startReview,
    cancelReview,
    analysisError,
  }
}
