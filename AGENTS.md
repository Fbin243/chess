# Chess — Agent Guide

Independent product repository (`Fbin243/chess`), checked out in the showcase parent at `repos/chess`. Verify the Git root (`git rev-parse --show-toplevel`) before committing. Client-only Vite + React 19 + strict TypeScript app: play against Stockfish (WASM, Web Worker, UCI). Do not import from or into the Next.js showcase.

## Commands

```bash
npm ci               # also runs postinstall: scripts/copy-stockfish.mjs
npm run dev
npm run lint
npx tsc -b
npm test             # Vitest, engine mocked
npm run build        # prebuild re-copies the engine, then tsc -b && vite build
npm run test:e2e     # Playwright, real Stockfish
```

Run the narrowest check first; before reporting, run lint, `npx tsc -b`, `npm test`, `npm run build`, and `npm run test:e2e` as relevant and report real results.

## Structure

- `src/engine/levels.ts` — level 1–10 table (Skill Level, depth, movetime) and clamping.
- `src/engine/stockfishClient.ts` — UCI client over a Worker (injectable `WorkerFactory`; stale-request handling; `ChessEngine` interface).
- `src/engine/uci.ts` — pure UCI helpers: `parseInfo`, `toWhitePov`, `scoreToCp`, `formatEval`, `evalToBarFraction`.
- `src/engine/analysisEngine.ts` — full-strength `AnalysisEngine` on a **second** worker (same injectable `WorkerFactory`). Priority queue: `review` goes before `live`; a newer `live` replaces a queued/running live search; a review job stops a running live search; `cancel(priority)` resolves with `null`; a `bestmove` of a cancelled search is ignored. Finished positions (mate/draw) are scored without the engine. The bot's `StockfishClient` stays separate and unchanged.
- `src/review/classify.ts` — pure move classification (thresholds are exported constants; keep README in sync), material swing, accuracy, summary.
- `src/hooks/useAnalysis.ts` — live eval, Review (depth 14), in-memory per-ply result cache matched to the move sequence, eval-bar toggle (`localStorage` key `chess:ui:v1`). Analysis engine factory is injectable for tests.
- `src/game/gameState.ts` — pure helpers over `chess.js` (moves, promotion, undo, status, move list). `chess.js` is the rules source of truth.
- `src/hooks/useChessGame.ts` — game state, persistence (`localStorage` key `chess:v1`), engine orchestration. Engine factory is injectable for tests.
- `src/components/` — `Board`, `PromotionDialog`, `SidePanel`, `EvalBar`, `ReviewSummary`, `marks.ts` (arrow/highlight colors and helpers). `react-chessboard` v5 uses the `options` prop and has no built-in promotion picker. Internal arrows cannot be cleared from outside, so `Board` remounts `<Chessboard>` through a key to clear marks.
- `e2e/` — Playwright smoke tests. `scripts/copy-stockfish.mjs` — engine asset copy.

## Engine assets

- Source: `node_modules/stockfish/bin/stockfish-*lite-single.{js,wasm}` (the files are in `bin/`, not `src/`).
- `copy-stockfish.mjs` copies them to `public/engine/stockfish.js` and `public/engine/stockfish.wasm` (renamed together; the engine finds its `.wasm` by script name). `public/engine/` is gitignored and regenerated on install/build.
- The Worker is created from `${import.meta.env.BASE_URL}engine/stockfish.js`. Use the single-threaded lite build only; do not add COOP/COEP headers or multithreaded builds without asking.
- Stockfish is GPLv3; keep the About notice and README license section when changing the engine or distribution.

## Testing rules

- Unit tests must mock the engine (fake worker / fake `ChessEngine`); never load real WASM in Vitest.
- Playwright is sequential only: `--workers=1`, one browser suite at a time, no concurrent build or second dev/preview server.
- Default port `4173` (`PLAYWRIGHT_PORT` overrides; use another free port when 4173 is owned by a different checkout's preview). Before running, check the port (`lsof -nP -iTCP:4173 -sTCP:LISTEN`) and request the URL. Reuse only a healthy listener serving a current `dist`; inspect process ownership before stopping a stale one and verify the port is released.
- UI changes: take deterministic screenshots (desktop/mobile, light/dark) and send them in chat; never commit them.
- Do not commit `node_modules`, `dist`, `public/engine`, `test-results`, or credentials.
