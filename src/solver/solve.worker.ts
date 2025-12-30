import { boardCells, boardMask, cellIndexByCoord, cellIndexById, getVisibleCellsForDate } from '../data/board'
import type { PieceDef, Placement, UiPlacement } from '../data/pieces'
import { buildPlacementIndex, totalPiecesArea } from '../data/pieces'

type SolveMsg = { type: 'solve'; dateMs: number; pieces: PieceDef[] }
type CountMsg = { type: 'count_solutions'; dateMs: number; pieces: PieceDef[]; maxSolutions?: number; storeLimit?: number }
type StopMsg = { type: 'stop' }
type InMsg = SolveMsg | CountMsg | StopMsg

type LogMsg = { type: 'log'; line: string }
type ResultMsg = { type: 'result'; placements: UiPlacement[]; iterations: number; elapsedMs: number }
type CountResultMsg = {
  type: 'count_result'
  solutions: number // unique solutions
  rawSolutions?: number // total solutions encountered (may include duplicates)
  iterations: number
  elapsedMs: number
  storedSolutions?: UiPlacement[][]
}
type NoSolutionMsg = { type: 'no_solution'; iterations: number; elapsedMs: number }
type ErrorMsg = { type: 'error'; message: string }
type OutMsg = LogMsg | ResultMsg | CountResultMsg | NoSolutionMsg | ErrorMsg

const post = (msg: OutMsg) => postMessage(msg)

const getLowestBitIndex = (mask: bigint): number => {
  let idx = 0
  let m = mask
  while ((m & 1n) === 0n) {
    m >>= 1n
    idx++
  }
  return idx
}

const toMaskFromIds = (ids: string[]): bigint => {
  let mask = 0n
  ids.forEach((id) => {
    const idx = cellIndexById[id]
    if (idx === undefined) throw new Error(`Unknown cell id ${id}`)
    mask |= 1n << BigInt(idx)
  })
  return mask
}

const labelForId = (id: string): string => {
  const idx = cellIndexById[id]
  const cell = idx === undefined ? undefined : boardCells[idx]
  return cell?.label ?? id
}

const blockedIndexes = (() => {
  const s = new Set<number>()
  boardCells.forEach((c, idx) => {
    if (c.blocked) s.add(idx)
  })
  return s
})()

const coverableCellCount = boardCells.filter((c) => !c.blocked).length

const buildPlacementsForMask = (
  remainingMask: bigint,
  unusedPieces: Set<string>,
  placementsByCellIndex: Record<number, Placement[]>,
) => {
  const pivotIndex = getLowestBitIndex(remainingMask)
  const candidates = placementsByCellIndex[pivotIndex] || []
  const filtered = candidates.filter(
    (p) => unusedPieces.has(p.pieceId) && (p.mask & remainingMask) === p.mask,
  )
  // try larger placements first to prune faster
  filtered.sort((a, b) => b.cellIndexes.length - a.cellIndexes.length)
  return filtered
}

const search = (
  remainingMask: bigint,
  unusedPieces: Set<string>,
  solution: Placement[],
  iterations: { count: number },
  placementsByCellIndex: Record<number, Placement[]>,
  logEvery: number,
): Placement[] | null => {
  if (remainingMask === 0n) return solution
  if (unusedPieces.size === 0) return null

  const options = buildPlacementsForMask(remainingMask, unusedPieces, placementsByCellIndex)
  if (options.length === 0) return null

  for (const placement of options) {
    iterations.count++
    if (iterations.count % logEvery === 0) {
      post({ type: 'log', line: `Itérations: ${iterations.count.toLocaleString('fr-CA')}` })
    }
    const nextUnused = new Set(unusedPieces)
    nextUnused.delete(placement.pieceId)
    const nextMask = remainingMask & ~placement.mask
    const result = search(nextMask, nextUnused, [...solution, placement], iterations, placementsByCellIndex, logEvery)
    if (result) return result
  }
  return null
}

self.onmessage = (ev: MessageEvent<InMsg>) => {
  if (ev.data.type === 'stop') {
    // App will terminate worker; nothing needed here.
    return
  }

  const start = performance.now()

  try {
    const { dateMs, pieces } = ev.data
    post({ type: 'log', line: `Pièces détectées: ${pieces.length}` })
    post({ type: 'log', line: `Aire totale des pièces: ${totalPiecesArea(pieces)}` })

    const requiredCoverage = coverableCellCount - 3
    post({ type: 'log', line: `Cases à couvrir: ${requiredCoverage}` })

    if (totalPiecesArea(pieces) !== requiredCoverage) {
      post({
        type: 'error',
        message: `Aire des pièces (${totalPiecesArea(pieces)}) != cases à couvrir (${requiredCoverage}). Vérifie pieces.png ou la détection.`,
      })
      return
    }

    post({ type: 'log', line: 'Pré-calcul des placements...' })
    const { placementsByCellIndex, pieceIds } = buildPlacementIndex({
      pieces,
      boardCols: 7,
      boardRows: 8,
      blockedIndexes,
      cellIndexByCoord,
    })

    const date = new Date(dateMs)
    const visible = getVisibleCellsForDate(date)
    post({
      type: 'log',
      line: `Date: ${date.toLocaleDateString('fr-CA', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })} | Visible: ${labelForId(visible.monthId)}, ${labelForId(visible.dayId)}, ${labelForId(visible.weekdayId)}`,
    })
    const visibleMask = toMaskFromIds([visible.monthId, visible.dayId, visible.weekdayId])
    const targetMask = boardMask & ~visibleMask

    if (ev.data.type === 'solve') {
      post({ type: 'log', line: 'Recherche (1ère solution)...' })
      const iterations = { count: 0 }
      const unused = new Set(pieceIds)
      const found = search(targetMask, unused, [], iterations, placementsByCellIndex, 25_000)
      const elapsedMs = performance.now() - start

      if (!found) {
        post({ type: 'no_solution', iterations: iterations.count, elapsedMs })
        return
      }

      const uiPlacements: UiPlacement[] = found.map((p) => ({
        pieceId: p.pieceId,
        cellIndexes: p.cellIndexes,
      }))

      post({ type: 'result', placements: uiPlacements, iterations: iterations.count, elapsedMs })
      return
    }

    // Count all solutions (can be expensive; run only on-demand).
    const maxSolutions = typeof ev.data.maxSolutions === 'number' ? ev.data.maxSolutions : undefined
    const storeLimit = typeof ev.data.storeLimit === 'number' ? ev.data.storeLimit : 500
    post({
      type: 'log',
      line: `Comptage des solutions${maxSolutions ? ` (limite: ${maxSolutions.toLocaleString('fr-CA')})` : ''}...`,
    })

    const iterations = { count: 0 }
    const solutions = { count: 0 } // unique
    const rawSolutions = { count: 0 } // may include duplicates
    const storedSolutions: UiPlacement[][] = []
    const solutionSignatures = new Set<string>()

    // Generate a unique signature for a solution based on piece placements
    const generateSolutionSignature = (solution: Placement[]): string => {
      // Sort by pieceId for consistent ordering, then create signature from sorted cell indexes
      const sorted = [...solution].sort((a, b) => a.pieceId.localeCompare(b.pieceId))
      return sorted
        .map((p) => `${p.pieceId}:${[...p.cellIndexes].sort((a, b) => a - b).join(',')}`)
        .join('|')
    }

    const searchCount = (remainingMask: bigint, unusedPieces: Set<string>, currentSolution: Placement[]) => {
      if (remainingMask === 0n) {
        // Invariant: if we covered exactly all non-visible cells AND areas match, we must have used all pieces.
        if (unusedPieces.size !== 0) {
          post({
            type: 'error',
            message:
              `Invariant violé: solution complète mais pièces restantes (${unusedPieces.size}). ` +
              `Cela indiquerait un comptage invalide pour la date sélectionnée.`,
          })
          return
        }
        rawSolutions.count++

        const signature = generateSolutionSignature(currentSolution)
        if (solutionSignatures.has(signature)) return
        solutionSignatures.add(signature)
        solutions.count++

        // Store solution if under limit (solutions already guaranteed unique here)
        if (storedSolutions.length < storeLimit) {
          const uiPlacements: UiPlacement[] = currentSolution.map((p) => ({
            pieceId: p.pieceId,
            cellIndexes: p.cellIndexes,
          }))
          storedSolutions.push(uiPlacements)
        }
        return
      }
      if (unusedPieces.size === 0) return
      if (maxSolutions !== undefined && solutions.count >= maxSolutions) return

      const options = buildPlacementsForMask(remainingMask, unusedPieces, placementsByCellIndex)
      if (options.length === 0) return

      for (const placement of options) {
        if (maxSolutions !== undefined && solutions.count >= maxSolutions) return
        iterations.count++
        if (iterations.count % 50_000 === 0) {
          post({
            type: 'log',
            line:
              `Itérations: ${iterations.count.toLocaleString('fr-CA')}` +
              ` | Solutions uniques: ${solutions.count.toLocaleString('fr-CA')}` +
              ` | Solutions brutes: ${rawSolutions.count.toLocaleString('fr-CA')}`,
          })
        }
        const nextUnused = new Set(unusedPieces)
        nextUnused.delete(placement.pieceId)
        const nextMask = remainingMask & ~placement.mask
        searchCount(nextMask, nextUnused, [...currentSolution, placement])
      }
    }

    searchCount(targetMask, new Set(pieceIds), [])
    const elapsedMs = performance.now() - start
    post({ 
      type: 'count_result', 
      solutions: solutions.count,
      rawSolutions: rawSolutions.count,
      iterations: iterations.count, 
      elapsedMs,
      storedSolutions: storedSolutions.length > 0 ? storedSolutions : undefined
    })
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : 'Erreur inconnue' })
  }
}

