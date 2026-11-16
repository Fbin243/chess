# Chess

Play chess against a Stockfish bot in the browser. Everything runs client-side: the engine is Stockfish compiled to WebAssembly, running in a Web Worker and driven over UCI. There is no backend, account system, or clock.

## Features

- Play as White, Black, or a random side; start a new game at any time
- Bot strength slider (levels 1–10)
- Click-to-move and drag-and-drop with legal-move hints, promotion picker, castling, en passant
- Undo (takes back your move and the bot's reply), flip board, last-move and check highlights
- Draw/checkmate/stalemate detection, move list
- Game and settings are saved in `localStorage` (`chess:v1`)
- Light/dark theme follows `prefers-color-scheme`; responsive layout (stacked below 800px)

## Stack

Vite, React 19, TypeScript (strict), [`chess.js`](https://github.com/jhlywa/chess.js) (rules), [`react-chessboard`](https://github.com/Clariity/react-chessboard) (board UI), [`stockfish`](https://www.npmjs.com/package/stockfish) (lite, single-threaded WASM build; no `SharedArrayBuffer`, so no COOP/COEP headers are required).

## Run

```bash
npm ci          # installs dependencies and copies the engine into public/engine (postinstall)
npm run dev     # http://localhost:5173
```

Other commands:

```bash
npm run lint
npx tsc -b
npm test                # Vitest unit tests (engine mocked)
npm run build           # type-check + production build into dist/
npm run preview         # serve dist/
npm run test:e2e        # Playwright smoke test against the real engine
```

The `stockfish` package is large (~200 MB unpacked), so the first install can take a while.

## Bot levels

| Level | Skill Level | Depth | Move time (ms) |
| ----: | ----------: | ----: | -------------: |
| 1 | 0 | 1 | 50 |
| 2 | 3 | 2 | 100 |
| 3 | 5 | 3 | 150 |
| 4 (default) | 8 | 5 | 250 |
| 5 | 10 | 7 | 400 |
| 6 | 13 | 9 | 600 |
| 7 | 15 | 11 | 800 |
| 8 | 17 | 13 | 1000 |
| 9 | 19 | 15 | 1250 |
| 10 | 20 | 18 | 1500 |

Each move sends `setoption name Skill Level`, then `go depth <depth> movetime <ms>` (whichever limit is hit first). Defined in `src/engine/levels.ts`.

## Deployment

Static site: `npm run build` produces `dist/`. Set `VITE_BASE` (for example `/chess/`) when serving from a sub-path. No deployment is configured yet.

## License and Stockfish notice

This app bundles and runs [Stockfish](https://stockfishchess.org/), which is licensed under the **GNU General Public License v3.0**. The WASM build comes from the [`stockfish` npm package](https://github.com/nmrugg/stockfish.js) (a port of the official engine). Stockfish source code: <https://github.com/official-stockfish/Stockfish>. Because the engine is GPLv3, distributing this app means distributing it under GPLv3-compatible terms and making the corresponding source available. The in-app "About" section repeats this notice.
