import { useMemo } from 'react'
import { Board } from './components/Board'
import { SidePanel } from './components/SidePanel'
import { moveRows } from './game/gameState'
import { useChessGame, type EngineFactory } from './hooks/useChessGame'

interface AppProps {
  createEngine?: EngineFactory
}

export default function App({ createEngine }: AppProps) {
  const chess = useChessGame(createEngine)
  const { game } = chess

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
        <Board
          game={game}
          orientation={chess.orientation}
          playerColor={chess.playerColor}
          canMove={chess.canMove}
          lastMove={lastMove}
          needsPromotion={chess.needsPromotion}
          onMove={chess.makeMove}
        />
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
