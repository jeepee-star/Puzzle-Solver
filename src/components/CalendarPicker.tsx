import { memo, useCallback, useMemo } from 'react'

const weekdayLabels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const monthLabels = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec']

type Props = {
  value: Date
  onChange: (date: Date) => void
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export const CalendarPicker = memo(function CalendarPicker({ value, onChange }: Props) {
  const rows = useMemo(() => {
    const monthStart = new Date(value.getFullYear(), value.getMonth(), 1)
    const daysCount = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate()
    const startWd = monthStart.getDay()

    const days: Array<{ date: Date; label: number }> = []
    for (let d = 1; d <= daysCount; d++) {
      days.push({ date: new Date(value.getFullYear(), value.getMonth(), d), label: d })
    }

    const cells: Array<Date | null> = []
    for (let i = 0; i < startWd; i++) cells.push(null)
    days.forEach((d) => cells.push(d.date))

    const rowsArr: Array<Array<Date | null>> = []
    for (let i = 0; i < cells.length; i += 7) {
      rowsArr.push(cells.slice(i, i + 7))
    }

    return rowsArr
  }, [value])


  const gotoMonth = useCallback(
    (delta: number) => {
      const next = new Date(value)
      next.setMonth(value.getMonth() + delta)
      onChange(next)
    },
    [value, onChange],
  )

  return (
    <div className="calendar">
      <div className="calendar__header">
        <button onClick={() => gotoMonth(-1)} aria-label="Mois précédent">
          ‹
        </button>
        <div className="calendar__title">
          {monthLabels[value.getMonth()]} {value.getFullYear()}
        </div>
        <button onClick={() => gotoMonth(1)} aria-label="Mois suivant">
          ›
        </button>
      </div>
      <div className="calendar__grid">
        {weekdayLabels.map((w) => (
          <div key={w} className="calendar__weekday">
            {w}
          </div>
        ))}
        {rows.map((row, ri) =>
          row.map((cell, ci) => {
            const key = `${ri}-${ci}`
            if (!cell) return <div key={key} className="calendar__cell empty" />
            const selected = sameDay(cell, value)
            return (
              <button
                key={key}
                className={`calendar__cell day${selected ? ' selected' : ''}`}
                onClick={() => onChange(cell)}
              >
                {cell.getDate()}
              </button>
            )
          }),
        )}
      </div>
    </div>
  )
})

