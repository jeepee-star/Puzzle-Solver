import { useMemo } from 'react'

const weekdayLabels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const monthLabels = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec']

type Props = {
  value: Date
  onChange: (date: Date) => void
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export function CalendarPicker({ value, onChange }: Props) {
  const monthStart = useMemo(() => new Date(value.getFullYear(), value.getMonth(), 1), [value])
  const daysInMonth = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate()
  const startWeekday = monthStart.getDay() // 0 = Dim

  const days: Array<{ date: Date; label: number }> = []
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ date: new Date(value.getFullYear(), value.getMonth(), d), label: d })
  }

  const cells: Array<Date | null> = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  days.forEach((d) => cells.push(d.date))

  const rows: Array<Array<Date | null>> = []
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7))
  }

  const gotoMonth = (delta: number) => {
    const next = new Date(value)
    next.setMonth(value.getMonth() + delta)
    onChange(next)
  }

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
}

