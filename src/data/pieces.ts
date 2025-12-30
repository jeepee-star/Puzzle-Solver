export type Vec = { row: number; col: number }

export type PieceDef = {
  id: string
  color: string
  cells: Vec[] // relative, normalized (top-left origin)
}

export type Orientation = {
  key: string
  cells: Vec[]
  width: number
  height: number
}

export type UiPlacement = {
  pieceId: string
  cellIndexes: number[]
}

export type Placement = UiPlacement & {
  mask: bigint
  orientationKey: string
  offset: Vec
}

export const normalizeCells = (cells: Vec[]): Vec[] => {
  const minRow = Math.min(...cells.map((c) => c.row))
  const minCol = Math.min(...cells.map((c) => c.col))
  const normalized = cells.map((c) => ({ row: c.row - minRow, col: c.col - minCol }))
  normalized.sort((a, b) => (a.row - b.row) || (a.col - b.col))
  return normalized
}

const serialize = (cells: Vec[]) => cells.map((c) => `${c.row},${c.col}`).join(';')

const rotate90 = (cells: Vec[]): Vec[] => cells.map((c) => ({ row: c.col, col: -c.row }))
const flipX = (cells: Vec[]): Vec[] => cells.map((c) => ({ row: c.row, col: -c.col }))

const toOrientation = (cells: Vec[]): Orientation => {
  const normalized = normalizeCells(cells)
  const width = Math.max(...normalized.map((c) => c.col)) + 1
  const height = Math.max(...normalized.map((c) => c.row)) + 1
  return { key: serialize(normalized), cells: normalized, width, height }
}

export const generateOrientations = (cells: Vec[]): Orientation[] => {
  const variants = new Map<string, Orientation>()
  const base = cells
  const flips = [false, true]
  flips.forEach((doFlip) => {
    let current = doFlip ? flipX(base) : base
    for (let i = 0; i < 4; i++) {
      const orientation = toOrientation(current)
      variants.set(orientation.key, orientation)
      current = rotate90(current)
    }
  })
  return Array.from(variants.values())
}

export const totalPiecesArea = (pieces: PieceDef[]) => pieces.reduce((sum, p) => sum + p.cells.length, 0)

// Définitions des pièces du puzzle (extraites de pieces.png)
export const PUZZLE_PIECES: PieceDef[] = [
  {
    id: 'A',
    color: '#2e7d32',
    cells: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 0 },
      { row: 1, col: 2 },
    ],
  },
  {
    id: 'B',
    color: '#1565c0',
    cells: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 1 },
      { row: 2, col: 1 },
    ],
  },
  {
    id: 'C',
    color: '#c62828',
    cells: [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 2, col: 2 },
    ],
  },
  {
    id: 'D',
    color: '#4a148c',
    cells: [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
    ],
  },
  {
    id: 'E',
    color: '#ef6c00',
    cells: [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
    ],
  },
  {
    id: 'F',
    color: '#00838f',
    cells: [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 3, col: 1 },
    ],
  },
  {
    id: 'G',
    color: '#ad1457',
    cells: [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 3, col: 0 },
      { row: 3, col: 1 },
    ],
  },
  {
    id: 'H',
    color: '#283593',
    cells: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ],
  },
  {
    id: 'I',
    color: '#5d4037',
    cells: [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
    ],
  },
  {
    id: 'J',
    color: '#d81b60',
    cells: [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 3, col: 0 },
    ],
  },
]

export type BuildPlacementsInput = {
  pieces: PieceDef[]
  boardCols: number
  boardRows: number
  blockedIndexes: Set<number>
  cellIndexByCoord: Map<string, number> // key "row,col" -> index into boardCells
}

const coordKey = (row: number, col: number) => `${row},${col}`

export type PlacementIndex = {
  placementsByCellIndex: Record<number, Placement[]>
  pieceIds: string[]
}

export function buildPlacementIndex(input: BuildPlacementsInput): PlacementIndex {
  const { pieces, boardCols, boardRows, blockedIndexes, cellIndexByCoord } = input

  const placementsByCellIndex: Record<number, Placement[]> = {}
  for (let i = 0; i < boardCols * boardRows; i++) placementsByCellIndex[i] = []

  pieces.forEach((piece) => {
    const orientations = generateOrientations(piece.cells)
    orientations.forEach((orientation) => {
      const maxRowOffset = boardRows - orientation.height
      const maxColOffset = boardCols - orientation.width
      for (let rowOffset = 0; rowOffset <= maxRowOffset; rowOffset++) {
        for (let colOffset = 0; colOffset <= maxColOffset; colOffset++) {
          const cellIndexes: number[] = []
          let valid = true
          for (const cell of orientation.cells) {
            const absRow = cell.row + rowOffset
            const absCol = cell.col + colOffset
            const idx = cellIndexByCoord.get(coordKey(absRow, absCol))
            if (idx === undefined || blockedIndexes.has(idx)) {
              valid = false
              break
            }
            cellIndexes.push(idx)
          }
          if (!valid) continue
          let mask = 0n
          cellIndexes.forEach((idx) => {
            mask |= 1n << BigInt(idx)
          })
          const placement: Placement = {
            pieceId: piece.id,
            cellIndexes,
            mask,
            orientationKey: orientation.key,
            offset: { row: rowOffset, col: colOffset },
          }
          cellIndexes.forEach((idx) => {
            placementsByCellIndex[idx].push(placement)
          })
        }
      }
    })
  })

  return { placementsByCellIndex, pieceIds: pieces.map((p) => p.id) }
}

