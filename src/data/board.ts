export const BOARD_COLS = 7
export const BOARD_ROWS = 8

export type CellRole = 'month' | 'day' | 'weekday' | 'empty'

export type BoardCell = {
  id: string
  row: number
  col: number
  label?: string
  role: CellRole
  blocked?: boolean
}

const toId = (row: number, col: number) => `r${row}c${col}`

const monthsRow1 = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun']
const monthsRow2 = ['Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec']
const allMonths = [...monthsRow1, ...monthsRow2]
const weekdays = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] as const

const makeBoard = (): BoardCell[] => {
  const cells: BoardCell[] = []

  // Layout EXACTE selon src/assets/support.png (7 cols x 8 rows)
  // Row 0: Jan..Jun + (0,6) blocked
  monthsRow1.forEach((label, col) => {
    cells.push({ id: toId(0, col), row: 0, col, label, role: 'month' })
  })
  cells.push({ id: toId(0, 6), row: 0, col: 6, blocked: true, role: 'empty' })

  // Row 1: Jul..Dec + (1,6) blocked
  monthsRow2.forEach((label, col) => {
    cells.push({ id: toId(1, col), row: 1, col, label, role: 'month' })
  })
  cells.push({ id: toId(1, 6), row: 1, col: 6, blocked: true, role: 'empty' })

  // Rows 2-5: days 1..28 (7 per row)
  let day = 1
  for (let row = 2; row <= 5; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      cells.push({
        id: toId(row, col),
        row,
        col,
        label: String(day),
        role: 'day',
      })
      day++
    }
  }

  // Row 6: 29,30,31 + Dim,Lun,Mar,Mer
  ;['29', '30', '31', 'Dim', 'Lun', 'Mar', 'Mer'].forEach((label, col) => {
    const role: CellRole =
      label === 'Dim' || label === 'Lun' || label === 'Mar' || label === 'Mer' ? 'weekday' : 'day'
    cells.push({ id: toId(6, col), row: 6, col, label, role })
  })

  // Row 7: (7,0..3) blocked + Jeu,Ven,Sam
  for (let col = 0; col <= 3; col++) {
    cells.push({ id: toId(7, col), row: 7, col, blocked: true, role: 'empty' })
  }
  ;['Jeu', 'Ven', 'Sam'].forEach((label, i) => {
    const col = 4 + i
    cells.push({ id: toId(7, col), row: 7, col, label, role: 'weekday' })
  })

  return cells
}

export const boardCells = makeBoard()

export const cellIndexById = boardCells.reduce<Record<string, number>>((acc, cell, index) => {
  acc[cell.id] = index
  return acc
}, {})

export const cellIndexByCoord = boardCells.reduce<Map<string, number>>((acc, cell, index) => {
  acc.set(`${cell.row},${cell.col}`, index)
  return acc
}, new Map())

export const boardMask: bigint = boardCells.reduce<bigint>((mask, cell, index) => {
  if (cell.blocked) return mask
  return mask | (1n << BigInt(index))
}, 0n)

export const labelToCellId = (() => {
  const months: Record<string, string> = {}
  const days: Record<number, string> = {}
  const weekday: Record<number, string> = {}

  boardCells.forEach((cell) => {
    if (cell.role === 'month' && cell.label) {
      months[cell.label.toLowerCase()] = cell.id
    }
    if (cell.role === 'day' && cell.label) {
      days[Number(cell.label)] = cell.id
    }
    if (cell.role === 'weekday' && cell.label) {
      const idx = weekdays.indexOf(cell.label as (typeof weekdays)[number])
      if (idx >= 0) weekday[idx] = cell.id
    }
  })

  return { months, days, weekday }
})()

export const weekdayLabels = weekdays

export type VisibleCells = {
  monthId: string
  dayId: string
  weekdayId: string
}

export function getVisibleCellsForDate(date: Date): VisibleCells {
  const monthLabel = allMonths[date.getMonth()]
  const monthId = labelToCellId.months[monthLabel.toLowerCase()]
  const dayId = labelToCellId.days[date.getDate()]
  const weekdayId = labelToCellId.weekday[date.getDay()]

  if (!monthId || !dayId || !weekdayId) {
    throw new Error('Date out of supported range for the board')
  }

  return { monthId, dayId, weekdayId }
}

export function bitIndexToCell(index: number): BoardCell | undefined {
  return boardCells[index]
}

