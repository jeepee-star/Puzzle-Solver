import { useEffect, useRef } from 'react'

type Props = {
  lines: string[]
  onClear: () => void
}

export function LogsPanel({ lines, onClear }: Props) {
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [lines.length])

  return (
    <div className="logs">
      <div className="logs__header">
        <div className="logs__title">Logs</div>
        <button className="logs__clear" onClick={onClear}>
          Effacer
        </button>
      </div>
      <div className="logs__body">
        {lines.length === 0 ? (
          <div className="logs__empty">Aucun log.</div>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="logs__line">
              {l}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}


