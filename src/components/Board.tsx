import { memo, useMemo } from 'react'
import { boardCells, BOARD_COLS } from '../data/board'
import type { VisibleCells } from '../data/board'
import type { PieceDef } from '../data/pieces'
import type { SolveResult } from '../solver/solve'

type Props = {
  visible: VisibleCells
  solution: SolveResult | null
  pieces: PieceDef[]
}

export const Board = memo(function Board({ visible, solution, pieces }: Props) {
  const pieceColors = useMemo(
    () =>
      pieces.reduce<Record<string, string>>((acc, p) => {
        acc[p.id] = p.color
        return acc
      }, {}),
    [pieces],
  )

  const visibleSet = useMemo(
    () => new Set([visible.monthId, visible.dayId, visible.weekdayId]),
    [visible],
  )

  const cellToPiece = useMemo(() => {
    const map: Record<number, string> = {}
    solution?.placements.forEach((p) => {
      p.cellIndexes.forEach((idx) => {
        map[idx] = p.pieceId
      })
    })
    return map
  }, [solution])

  return (
    <div className="board" style={{ gridTemplateColumns: `repeat(${BOARD_COLS}, minmax(0, 1fr))` }}>
      {boardCells.map((cell, idx) => {
        const isVisible = visibleSet.has(cell.id)
        const pieceId = cellToPiece[idx]
        const color = pieceId ? pieceColors[pieceId] : undefined
        const classes = ['board__cell']
        if (cell.blocked) classes.push('blocked')
        if (isVisible) classes.push('visible')
        if (pieceId) classes.push('covered')
        return (
          <div key={cell.id} className={classes.join(' ')} style={{ backgroundColor: color }}>
            <span className="label">{cell.label}</span>
          </div>
        )
      })}
    </div>
  )
})

