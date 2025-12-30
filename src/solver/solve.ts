import type { UiPlacement } from '../data/pieces'

export type SolveResult = {
  placements: UiPlacement[]
  iterations: number
  elapsedMs?: number
}

