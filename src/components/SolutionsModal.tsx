import type { UiPlacement } from '../data/pieces'

type Props = {
  isOpen: boolean
  onClose: () => void
  solutions: UiPlacement[][]
  onSelectSolution: (index: number, solution: UiPlacement[]) => void
}

export function SolutionsModal({ isOpen, onClose, solutions, onSelectSolution }: Props) {
  if (!isOpen) return null

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__panel">
        <div className="modal__header">
          <div className="modal__title">Solutions disponibles ({solutions.length.toLocaleString('fr-CA')})</div>
          <button className="modal__close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="modal__content">
          <div className="solutionsList">
            {solutions.map((solution, index) => (
              <div
                key={index}
                className="solutionRow"
                onClick={() => {
                  onSelectSolution(index, solution)
                  onClose()
                }}
              >
                <div className="solutionRow__number">Solution #{index + 1}</div>
                <div className="solutionRow__meta">
                  {solution.length} pièce{solution.length > 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

