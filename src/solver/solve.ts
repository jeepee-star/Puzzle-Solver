import type { UiPlacement } from '../data/pieces'

// ─────────────────────────────────────────────────────────────────────────────
// Shared Types for Worker Communication
// ─────────────────────────────────────────────────────────────────────────────

/** Messages sent TO the worker */
export type WorkerInMsg =
  | { type: 'solve'; dateMs: number; pieces: import('../data/pieces').PieceDef[] }
  | { type: 'count_solutions'; dateMs: number; pieces: import('../data/pieces').PieceDef[]; maxSolutions?: number; storeLimit?: number }
  | { type: 'stop' }

/** Messages sent FROM the worker */
export type WorkerOutMsg =
  | { type: 'log'; line: string }
  | { type: 'result'; placements: UiPlacement[]; iterations: number; elapsedMs: number }
  | {
    type: 'count_result'
    solutions: number
    rawSolutions?: number
    iterations: number
    elapsedMs: number
    storedSolutions?: UiPlacement[][]
  }
  | { type: 'no_solution'; iterations: number; elapsedMs: number }
  | { type: 'error'; message: string }

// ─────────────────────────────────────────────────────────────────────────────
// Result Types
// ─────────────────────────────────────────────────────────────────────────────

export type SolveResult = {
  placements: UiPlacement[]
  iterations: number
  elapsedMs?: number
}

export type CountResult = {
  solutions: number
  rawSolutions?: number
  iterations: number
  elapsedMs: number
}

