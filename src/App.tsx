import { useCallback, useMemo, useState } from 'react'
import type { AnalysisEngineFactory } from './engine/analysisEngine'
import { Board } from './components/Board'
import { EvalBar } from './components/EvalBar'
import { SidePanel } from './components/SidePanel'
import { moveRows, type GameStatus } from './game/gameState'
import { useAnalysis } from './hooks/useAnalysis'
import { useChessGame, type EngineFactory } from './hooks/useChessGame'

interface AppProps {
  createEngine?: EngineFactory
  createAnalysisEngine?: AnalysisEngineFactory
}

function resultLabel(status: GameStatus): string {
  if (status.kind !== 'checkmate') return '½-½'
  return status.winner === 'w' ? '1-0' : '0-1'
}

export default function App({ createEngine, createAnalysisEngine }: AppProps) {
  const chess = useChessGame(createEngine)
  const { game } = chess
  const analysis = useAnalysis(game, chess.over, createAnalysisEngine)
  const [clearMarksSignal, setClearMarksSignal] = useState(0)
  const [hasMarks, setHasMarks] = useState(false)
  const clearMarks = useCallback(() => setClearMarksSignal((value) => value + 1), [])

  const history = useMemo(() => game.history({ verbose: true }), [game])
  const rows = useMemo(() => moveRows(game), [game])
  const last = history.at(-1)
  const lastMove = last ? { from: last.from, to: last.to } : null

  return (
    <div className="app">
      <header className="app-header">
        <h1>Chess vs Stockfish</h1>
      </header>
      <main className="layout">
        <div className="board-area">
          {analysis.showEval && (
            <EvalBar
              score={analysis.liveEval?.score ?? null}
              orientation={chess.orientation}
              resultLabel={chess.over ? resultLabel(chess.status) : null}
            />
          )}
          <Board
            game={game}
            orientation={chess.orientation}
            playerColor={chess.playerColor}
            canMove={chess.canMove}
            lastMove={lastMove}
            needsPromotion={chess.needsPromotion}
            onMove={chess.makeMove}
            marksResetKey={chess.marksResetKey}
            clearMarksSignal={clearMarksSignal}
            onMarksChange={setHasMarks}
          />
        </div>
        <SidePanel
          rows={rows}
          plyCount={history.length}
          status={chess.status}
          over={chess.over}
          playerColor={chess.playerColor}
          level={chess.level}
          thinking={chess.thinking}
          canUndo={chess.canUndo}
          engineError={chess.engineError}
          review={analysis.review}
          analysisError={analysis.analysisError}
          showEval={analysis.showEval}
          hasMarks={hasMarks}
          onShowEval={analysis.setShowEval}
          onClearMarks={clearMarks}
          onStartReview={analysis.startReview}
          onCancelReview={analysis.cancelReview}
          onNewGame={chess.newGame}
          onUndo={chess.undo}
          onFlip={chess.flip}
          onLevel={chess.setLevel}
          onRetryEngine={chess.retryEngine}
        />
      </main>
      <footer className="app-footer">
        <details>
          <summary>About</summary>
          <p>
            Rules by <a href="https://github.com/jhlywa/chess.js">chess.js</a>, board by{' '}
            <a href="https://github.com/Clariity/react-chessboard">react-chessboard</a>. The
            engine is <a href="https://stockfishchess.org/">Stockfish</a> (WebAssembly build via
            the <a href="https://github.com/nmrugg/stockfish.js">stockfish</a> npm package),
            licensed under the{' '}
            <a href="https://www.gnu.org/licenses/gpl-3.0.html">GNU GPL v3</a>. Source code:{' '}
            <a href="https://github.com/official-stockfish/Stockfish">Stockfish</a>.
          </p>
        </details>
      </footer>
    </div>
  )
}
