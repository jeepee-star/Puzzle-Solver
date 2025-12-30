import { memo, useEffect } from 'react'
import { Board } from './Board'
import type { VisibleCells } from '../data/board'
import type { PieceDef } from '../data/pieces'
import type { SolveResult } from '../solver/solve'

type Props = {
  isOpen: boolean
  onClose: () => void
  visible: VisibleCells
  solution: SolveResult | null
  pieces: PieceDef[]
}

export const LargeBoardModal = memo(function LargeBoardModal({ isOpen, onClose, visible, solution, pieces }: Props) {
  // Close on Escape key - only add listener when modal is open
  useEffect(() => {
    if (!isOpen) return

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__large-panel">
        <button className="modal__close-float" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
        <div className="modal__large-content">
          <Board visible={visible} solution={solution} pieces={pieces} />
        </div>
      </div>
    </div>
  )
})

