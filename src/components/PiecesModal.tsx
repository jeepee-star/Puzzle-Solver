import type { PieceDef } from '../data/pieces'

type Props = {
  isOpen: boolean
  onClose: () => void
  pieces: PieceDef[]
}

const dims = (cells: { row: number; col: number }[]) => {
  const h = Math.max(...cells.map((c) => c.row)) + 1
  const w = Math.max(...cells.map((c) => c.col)) + 1
  return { w, h }
}

export function PiecesModal({ isOpen, onClose, pieces }: Props) {
  if (!isOpen) return null

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__panel">
        <div className="modal__header">
          <div className="modal__title">Pièces générées</div>
          <button className="modal__close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="modal__content">
          {pieces.length === 0 ? (
            <div>Chargement...</div>
          ) : (
            <div className="piecesGrid">
              {pieces.map((p) => {
                const { w, h } = dims(p.cells)
                const set = new Set(p.cells.map((c) => `${c.row},${c.col}`))
                return (
                  <div key={p.id} className="pieceCard">
                    <div className="pieceCard__meta">
                      <div className="pieceCard__id">Pièce {p.id}</div>
                      <div className="pieceCard__size">{p.cells.length} cases</div>
                    </div>
                    <div
                      className="pieceCard__shape"
                      style={{
                        gridTemplateColumns: `repeat(${w}, 18px)`,
                        gridTemplateRows: `repeat(${h}, 18px)`,
                      }}
                    >
                      {Array.from({ length: w * h }).map((_, i) => {
                        const row = Math.floor(i / w)
                        const col = i % w
                        const filled = set.has(`${row},${col}`)
                        return (
                          <div
                            key={i}
                            className={`pieceCell${filled ? ' filled' : ''}`}
                            style={filled ? { backgroundColor: p.color } : undefined}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


