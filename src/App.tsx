import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarPicker } from './components/CalendarPicker'
import { Board } from './components/Board'
import type { CountResult, SolveResult, WorkerOutMsg } from './solver/solve'
import { getVisibleCellsForDate } from './data/board'
import './App.css'
import { LoadingModal } from './components/LoadingModal'
import { PiecesModal } from './components/PiecesModal'
import { SolutionsModal } from './components/SolutionsModal'
import { LargeBoardModal } from './components/LargeBoardModal'
import { PUZZLE_PIECES } from './data/pieces'

function App() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [solution, setSolution] = useState<SolveResult | null>(null)
  const [isCounting, setIsCounting] = useState(false)
  const [countResult, setCountResult] = useState<CountResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [piecesOpen, setPiecesOpen] = useState(false)
  const [storedSolutions, setStoredSolutions] = useState<{ pieceId: string; cellIndexes: number[] }[][]>([])
  const [solutionsOpen, setSolutionsOpen] = useState(false)
  const [selectedSolutionIndex, setSelectedSolutionIndex] = useState<number | null>(null)
  const [largeBoardOpen, setLargeBoardOpen] = useState(false)

  const workerRef = useRef<Worker | null>(null)
  const boardSectionRef = useRef<HTMLDivElement>(null)

  const visibleCells = useMemo(() => {
    try {
      return getVisibleCellsForDate(selectedDate)
    } catch {
      return null
    }
  }, [selectedDate])

  // Initial mount: scroll to top
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Cleanup worker on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [])

  // Reset solutions when date changes
  useEffect(() => {
    setSolution(null)
    setCountResult(null)
    setStoredSolutions([])
    setSolutionsOpen(false)
    setSelectedSolutionIndex(null)
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
    setIsCounting(false)
  }, [selectedDate])

  // Auto-scroll to board section when calculation completes (mobile)
  useEffect(() => {
    // Scroll when countResult is set (calculation finished) and we have a solution
    if (countResult && solution && boardSectionRef.current) {
      // Only scroll on mobile/tablet viewports
      if (window.innerWidth <= 1150) {
        // Use requestAnimationFrame for better timing with DOM updates
        requestAnimationFrame(() => {
          setTimeout(() => {
            boardSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }, 100)
        })
      }
    }
  }, [countResult, solution])

  const stopSolving = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
    setIsCounting(false)
  }, [])

  const handleSolve = useCallback(() => {
    if (!visibleCells) {
      setError('Date invalide pour ce plateau')
      return
    }

    setIsCounting(true)
    setError(null)
    setSolution(null)
    setCountResult(null)
    setStoredSolutions([])

    // (Re)start worker
    if (workerRef.current) workerRef.current.terminate()
    const worker = new Worker(new URL('./solver/solve.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = (ev: MessageEvent<WorkerOutMsg>) => {
      const msg = ev.data
      if (msg.type === 'log') {
        return
      }
      if (msg.type === 'error') {
        setError(msg.message)
        setIsCounting(false)
        return
      }
      if (msg.type === 'no_solution') {
        setCountResult({ solutions: 0, iterations: msg.iterations, elapsedMs: msg.elapsedMs })
        setIsCounting(false)
        return
      }
      if (msg.type === 'count_result') {
        setCountResult({ solutions: msg.solutions, rawSolutions: msg.rawSolutions, iterations: msg.iterations, elapsedMs: msg.elapsedMs })
        if (msg.storedSolutions && msg.storedSolutions.length > 0) {
          setStoredSolutions(msg.storedSolutions)
          setSolution({ placements: msg.storedSolutions[0], iterations: 0 })
          setSelectedSolutionIndex(0)
        }
        setIsCounting(false)
        return
      }
      // msg.type === 'result' is ignored in count mode
    }
    worker.onerror = (err) => {
      setError(`Erreur du worker: ${err.message || 'Erreur inconnue'}`)
      setIsCounting(false)
    }

    worker.postMessage({ type: 'count_solutions', dateMs: selectedDate.getTime(), pieces: PUZZLE_PIECES, storeLimit: 100 })
  }, [visibleCells, selectedDate])

  const handleSelectSolution = useCallback((index: number, sol: { pieceId: string; cellIndexes: number[] }[]) => {
    setSolution({ placements: sol, iterations: 0 })
    setSelectedSolutionIndex(index)
  }, [])

  return (
    <div className="app">
      <header className="app__header">
        <img src="/images/logo-header.png" alt="Une à la fois - Calendrier 365" className="app__logo" />
      </header>

      <div className="app__content">
        <div className="app__calendar-section">
          <CalendarPicker value={selectedDate} onChange={setSelectedDate} />
        </div>

        <div className="app__board-section" ref={boardSectionRef}>
          {error && <div className="app__error">{error}</div>}

          {visibleCells && (
            <div style={{ position: 'relative' }}>
              <Board visible={visibleCells} solution={solution} pieces={PUZZLE_PIECES} />
              <button
                className="board__maximize-btn"
                onClick={() => setLargeBoardOpen(true)}
                title="Agrandir"
              >
                ⤢
              </button>
            </div>
          )}

          {/* Compact Solution Stats */}
          <div className="solution-stats">
            {countResult ? (
              <div className="solution-stats__content">
                <div className="solution-stats__main">
                  <span className="solution-stats__count">{countResult.solutions.toLocaleString('fr-CA')} solution(s)</span>
                  {storedSolutions.length > 0 && (
                    <button className="solution-stats__link" onClick={() => setSolutionsOpen(true)}>
                      Voir ({storedSolutions.length})
                    </button>
                  )}
                </div>

                <div className="solution-stats__meta">
                  {solution && (
                    <span className="solution-stats__current">
                      {storedSolutions.length > 0
                        ? `Solution #${(selectedSolutionIndex ?? 0) + 1}`
                        : 'Solution affichée'} •
                    </span>
                  )}
                  {countResult.elapsedMs.toFixed(0)}ms • {countResult.iterations.toLocaleString('fr-CA')} itérations
                </div>
              </div>
            ) : (
              isCounting ? (
                <div className="solution-stats__placeholder">
                  Calcul en cours...
                </div>
              ) : null
            )}
          </div>
        </div>

        <div className="app__actions">
          <button className="app__solve-button" onClick={handleSolve} disabled={isCounting || !visibleCells}>
            {!isCounting && <img src="/images/puzzle-icon.png" alt="" className="app__button-icon" />}
            {isCounting ? 'Calcul...' : countResult ? 'Recalculer' : 'Résoudre'}
          </button>

          <button className="app__pieces-button" onClick={() => setPiecesOpen(true)}>
            Voir les pièces
          </button>
        </div>
      </div>

      <div className="app__footer">
        © {new Date().getFullYear()}, Conçu par MG et JPG pour Une à la fois
      </div>

      <PiecesModal isOpen={piecesOpen} onClose={() => setPiecesOpen(false)} pieces={PUZZLE_PIECES} />
      <LoadingModal isOpen={isCounting} onStop={stopSolving} />
      <SolutionsModal
        isOpen={solutionsOpen}
        onClose={() => setSolutionsOpen(false)}
        solutions={storedSolutions}
        onSelectSolution={handleSelectSolution}
      />
      {
        visibleCells && (
          <LargeBoardModal
            isOpen={largeBoardOpen}
            onClose={() => setLargeBoardOpen(false)}
            visible={visibleCells}
            solution={solution}
            pieces={PUZZLE_PIECES}
          />
        )
      }
    </div>
  )
}

export default App
