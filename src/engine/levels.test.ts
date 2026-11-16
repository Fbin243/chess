import { describe, expect, it } from 'vitest'
import { LEVELS, MAX_LEVEL, MIN_LEVEL, clampLevel, getLevel } from './levels'

describe('levels', () => {
  it('defines every level from 1 to 10', () => {
    for (let level = MIN_LEVEL; level <= MAX_LEVEL; level++) {
      expect(LEVELS[level]).toBeDefined()
    }
  })

  it('strictly increases skill, depth and move time', () => {
    for (let level = MIN_LEVEL + 1; level <= MAX_LEVEL; level++) {
      const prev = LEVELS[level - 1]
      const next = LEVELS[level]
      expect(next.skill).toBeGreaterThan(prev.skill)
      expect(next.depth).toBeGreaterThan(prev.depth)
      expect(next.movetimeMs).toBeGreaterThan(prev.movetimeMs)
    }
  })

  it('matches the documented endpoints', () => {
    expect(LEVELS[1]).toEqual({ skill: 0, depth: 1, movetimeMs: 50 })
    expect(LEVELS[10]).toEqual({ skill: 20, depth: 18, movetimeMs: 1500 })
  })

  it('clamps out-of-range levels', () => {
    expect(clampLevel(0)).toBe(1)
    expect(clampLevel(99)).toBe(10)
    expect(clampLevel(Number.NaN)).toBeGreaterThanOrEqual(1)
    expect(getLevel(-5)).toEqual(LEVELS[1])
  })
})
