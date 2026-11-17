import { describe, expect, it } from 'vitest'
import { ARROW_COLORS, highlightStyle, markColorFor, toggleHighlight } from './marks'

describe('markColorFor', () => {
  it('defaults to green', () => {
    expect(markColorFor({})).toBe('green')
  })

  it('maps each modifier to its colour', () => {
    expect(markColorFor({ altKey: true })).toBe('red')
    expect(markColorFor({ shiftKey: true })).toBe('blue')
    expect(markColorFor({ ctrlKey: true })).toBe('yellow')
    expect(markColorFor({ metaKey: true })).toBe('yellow')
  })

  it('follows the library precedence: alt, then shift, then ctrl, then meta', () => {
    expect(markColorFor({ altKey: true, shiftKey: true, ctrlKey: true, metaKey: true })).toBe('red')
    expect(markColorFor({ shiftKey: true, ctrlKey: true })).toBe('blue')
    expect(markColorFor({ ctrlKey: true, metaKey: true })).toBe('yellow')
  })
})

describe('ARROW_COLORS', () => {
  it('uses yellow for both Ctrl and Cmd', () => {
    expect(ARROW_COLORS.ctrl).toBe(ARROW_COLORS.meta)
    expect(new Set([ARROW_COLORS.default, ARROW_COLORS.alt, ARROW_COLORS.shift, ARROW_COLORS.ctrl]).size).toBe(4)
  })
})

describe('toggleHighlight', () => {
  it('adds a highlight', () => {
    expect(toggleHighlight({}, 'e4', 'green')).toEqual({ e4: 'green' })
  })

  it('removes a highlight of the same colour', () => {
    expect(toggleHighlight({ e4: 'green', d4: 'red' }, 'e4', 'green')).toEqual({ d4: 'red' })
  })

  it('replaces a highlight of a different colour', () => {
    expect(toggleHighlight({ e4: 'green' }, 'e4', 'blue')).toEqual({ e4: 'blue' })
  })

  it('does not mutate its input', () => {
    const before = { e4: 'green' } as const
    toggleHighlight(before, 'e4', 'green')
    expect(before).toEqual({ e4: 'green' })
  })
})

describe('highlightStyle', () => {
  it('returns a translucent background', () => {
    expect(highlightStyle('red').backgroundColor).toMatch(/^rgba\(.*0\.\d+\)$/)
  })
})
