import { useEffect, useMemo, useState } from 'react'
import { PUZZLE_PIECES } from '../data/pieces'

type Props = {
    isOpen: boolean
    onStop?: () => void
}

export function LoadingModal({ isOpen, onStop }: Props) {
    const [pieceIndex, setPieceIndex] = useState(0)

    // Cycle through pieces
    useEffect(() => {
        if (!isOpen) return
        const interval = setInterval(() => {
            setPieceIndex((prev) => (prev + 1) % PUZZLE_PIECES.length)
        }, 600)
        return () => clearInterval(interval)
    }, [isOpen])

    // Memoize piece calculations to avoid recalculating on every render
    const { piece, dims, cellSet } = useMemo(() => {
        const p = PUZZLE_PIECES[pieceIndex]
        return {
            piece: p,
            dims: {
                w: Math.max(...p.cells.map((c) => c.col)) + 1,
                h: Math.max(...p.cells.map((c) => c.row)) + 1,
            },
            cellSet: new Set(p.cells.map((c) => `${c.row},${c.col}`)),
        }
    }, [pieceIndex])

    if (!isOpen) return null

    return (
        <div className="modal" role="dialog" aria-modal="true">
            <div className="modal__backdrop" />
            <div className="modal__panel loading-modal__panel">
                <div className="loading-modal__content">
                    <div className="loading-piece-container">
                        <div
                            key={pieceIndex}
                            className="loading-piece"
                            style={{
                                gridTemplateColumns: `repeat(${dims.w}, 24px)`,
                                gridTemplateRows: `repeat(${dims.h}, 24px)`,
                            }}
                        >
                            {Array.from({ length: dims.w * dims.h }).map((_, i) => {
                                const row = Math.floor(i / dims.w)
                                const col = i % dims.w
                                const filled = cellSet.has(`${row},${col}`)
                                return (
                                    <div
                                        key={i}
                                        className={`loading-cell${filled ? ' filled' : ''}`}
                                        style={filled ? { backgroundColor: piece.color } : undefined}
                                    />
                                )
                            })}
                        </div>
                    </div>

                    <div className="loading-text-container">
                        <p className="loading-title">Une solution à la fois...</p>
                        <p className="loading-subtitle">Calcul des possibilités en cours</p>
                    </div>

                    {onStop && (
                        <button className="app__stop-button loading-stop-btn" onClick={onStop}>
                            Arrêter
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
