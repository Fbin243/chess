export interface EngineLevel {
  skill: number
  depth: number
  movetimeMs: number
}

export const MIN_LEVEL = 1
export const MAX_LEVEL = 10
export const DEFAULT_LEVEL = 4

export const LEVELS: Readonly<Record<number, EngineLevel>> = {
  1: { skill: 0, depth: 1, movetimeMs: 50 },
  2: { skill: 3, depth: 2, movetimeMs: 100 },
  3: { skill: 5, depth: 3, movetimeMs: 150 },
  4: { skill: 8, depth: 5, movetimeMs: 250 },
  5: { skill: 10, depth: 7, movetimeMs: 400 },
  6: { skill: 13, depth: 9, movetimeMs: 600 },
  7: { skill: 15, depth: 11, movetimeMs: 800 },
  8: { skill: 17, depth: 13, movetimeMs: 1000 },
  9: { skill: 19, depth: 15, movetimeMs: 1250 },
  10: { skill: 20, depth: 18, movetimeMs: 1500 },
}

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return DEFAULT_LEVEL
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)))
}

export function getLevel(level: number): EngineLevel {
  return LEVELS[clampLevel(level)]
}
