import type { CSSProperties } from 'react'

export type MarkColor = 'green' | 'red' | 'blue' | 'yellow'

export interface Modifiers {
  altKey: boolean
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}

export const NO_MODIFIERS: Modifiers = {
  altKey: false,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
}

const ARROW_HEX: Record<MarkColor, string> = {
  green: '#2e9d38',
  red: '#d33b3b',
  blue: '#2f7fd8',
  yellow: '#e6b800',
}

const HIGHLIGHT_RGBA: Record<MarkColor, string> = {
  green: 'rgba(46, 157, 56, 0.6)',
  red: 'rgba(211, 59, 59, 0.6)',
  blue: 'rgba(47, 127, 216, 0.6)',
  yellow: 'rgba(230, 184, 0, 0.65)',
}

/** Passed to react-chessboard's `arrowOptions.colors`; Ctrl and Cmd both draw yellow. */
export const ARROW_COLORS = {
  default: ARROW_HEX.green,
  alt: ARROW_HEX.red,
  shift: ARROW_HEX.blue,
  ctrl: ARROW_HEX.yellow,
  meta: ARROW_HEX.yellow,
}

/** Same precedence as react-chessboard: Alt, then Shift, then Ctrl, then Cmd/Meta. */
export function markColorFor(mods: Partial<Modifiers>): MarkColor {
  if (mods.altKey) return 'red'
  if (mods.shiftKey) return 'blue'
  if (mods.ctrlKey || mods.metaKey) return 'yellow'
  return 'green'
}

export type Highlights = Readonly<Record<string, MarkColor>>

/** The same colour removes the highlight; a different colour replaces it. */
export function toggleHighlight(map: Highlights, square: string, color: MarkColor): Highlights {
  if (map[square] === color) {
    const next = { ...map }
    delete next[square]
    return next
  }
  return { ...map, [square]: color }
}

export function highlightStyle(color: MarkColor): CSSProperties {
  return { backgroundColor: HIGHLIGHT_RGBA[color] }
}
