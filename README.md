# Chess

Play chess against a Stockfish bot in the browser. Everything runs client-side: the engine is Stockfish compiled to WebAssembly, running in a Web Worker and driven over UCI. There is no backend, account system, or clock.

## Features

- Play as White, Black, or a random side; start a new game at any time
- Bot strength slider (levels 1–10)
- Click-to-move and drag-and-drop with legal-move hints, promotion picker, castling, en passant
- Undo (takes back your move and the bot's reply), flip board, last-move and check highlights
- Draw/checkmate/stalemate detection, move list
- Game and settings are saved in `localStorage` (`chess:v1`)
- Live evaluation bar and a post-game (or mid-game) **Review** that classifies every move
- Right-click arrows and square highlights in four colors
- Light/dark theme follows `prefers-color-scheme`; centered layout where the board grows with the window (up to 920px) and everything stacks below 900px

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

## Arrows and highlights

Moves still work with left-click and drag. The right mouse button draws on the board:

- **Right-drag** from one square to another draws an arrow; **right-click** a square toggles a highlight.
- The color depends on the modifier key held when you press the button:

  | Modifier | Color |
  | --- | --- |
  | none | green |
  | Alt / Option | red |
  | Shift | blue |
  | Ctrl or Cmd | yellow |

  On macOS, Ctrl+click is reported by the browser as a left click, so use **Cmd** (or Ctrl with a real right button) for yellow.
- Right-clicking a square that already has the same color removes it; a different color replaces it.
- **Esc** or the **Clear marks** button removes every arrow and highlight. A left-click, any move (yours or the bot's), Undo and New game also clear them. Esc keeps closing the promotion dialog first when it is open.

## Evaluation bar

- The bar sits left of the board (above it on narrow screens). Your side is at the bottom (left on narrow screens).
- The number is always from White's point of view: `+1.3` means White is ahead by about 1.3 pawns, `−0.4` means Black is slightly ahead, `M3` / `−M2` mean White / Black mates in 3 / 2. When the game is over it shows `1-0`, `0-1` or `½-½`.
- It updates as Stockfish reports each new depth, up to depth 16 with a limit of about 1.5 s per position. A new position stops the old search and starts again.
- The bar is shown by default. The **Show eval bar** checkbox turns it off (and stops the live search); the choice is saved in `localStorage` under `chess:ui:v1`.

## Review

- Click **Review game** at any time to review the moves played so far; a review also starts automatically when the game ends. Both sides are analysed at depth 14, with a progress bar and a **Cancel** button. Any change to the game (a move, Undo, New game) cancels a running review.
- Each reviewed move gets an icon and a tooltip in the move list (for example "Mistake — best was Nf3 (−1.4)", where the number is the engine's evaluation, from White's side, of the position before the move). The summary shows each side's accuracy and the count per class.
- Classification uses the centipawn loss for the side that moved. Each evaluation is capped at ±1000 cp and a forced mate counts as ±1000.

  | Class | Icon | Rule |
  | --- | :---: | --- |
  | Brilliant | !! | A Best move that gives up at least 2 pawns of material after the engine's best reply, while the position is still at least −0.5 for the mover |
  | Best | ★ | The engine's top move, or loses ≤ 10 cp |
  | Excellent | ✓ | Loses ≤ 25 cp |
  | Good | · | Loses ≤ 60 cp |
  | Inaccuracy | ?! | Loses ≤ 120 cp |
  | Mistake | ? | Loses ≤ 250 cp |
  | Blunder | ?? | Loses > 250 cp |

  Missing a forced mate is at least a Mistake; a move that allows a forced mate is a Blunder. Material uses P1 N3 B3 R5 Q9 and is checked with `chess.js`. The thresholds are constants in `src/review/classify.ts`.
- Accuracy per move: `win% = 50 + 50·(2 / (1 + e^(−0.00368·cp)) − 1)` and `accuracy = 103.17·e^(−0.0435·Δwin%) − 3.17`, clamped to 0–100, where Δwin% is the drop in the mover's win percentage. A side's accuracy is the average over its moves.
- Results live in memory only, matched to the move sequence: after Undo the moves still in the game keep their results, new moves show as not reviewed, and a reload clears everything.

## Engine workers

The app runs two Stockfish workers. The bot keeps its own worker (`StockfishClient`, strength set by the level slider). A second full-strength worker (`AnalysisEngine`, Skill Level 20) serves the eval bar and the Review through a small priority queue: Review goes first, a newer live request replaces an older one, and a running live search is stopped when a review job arrives.

## Deployment

Static site: `npm run build` produces `dist/`. Set `VITE_BASE` (for example `/chess/`) when serving from a sub-path. No deployment is configured yet.

## License and Stockfish notice

This app bundles and runs [Stockfish](https://stockfishchess.org/), which is licensed under the **GNU General Public License v3.0**. The WASM build comes from the [`stockfish` npm package](https://github.com/nmrugg/stockfish.js) (a port of the official engine). Stockfish source code: <https://github.com/official-stockfish/Stockfish>. Because the engine is GPLv3, distributing this app means distributing it under GPLv3-compatible terms and making the corresponding source available. The in-app "About" section repeats this notice.

## Chess piece artwork

The board pieces (`src/assets/pieces/*.svg`) are the classic "cburnett" set by **Colin M.L. Burnett**, sourced from Wikimedia Commons (`Chess_*t45.svg`), licensed under **CC BY-SA 3.0 / GFDL / BSD** (multi-licensed by the author). chess.com's own piece sets (e.g. "Neo") are proprietary and are not used or copied here. See <https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces> for the originals and full license terms.
