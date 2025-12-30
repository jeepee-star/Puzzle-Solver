import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarPicker } from './components/CalendarPicker'
import { Board } from './components/Board'
import type { SolveResult } from './solver/solve'
import { getVisibleCellsForDate } from './data/board'
import './App.css'
import { LogsPanel } from './components/LogsPanel'
import { PiecesModal } from './components/PiecesModal'
import { SolutionsModal } from './components/SolutionsModal'
import { LargeBoardModal } from './components/LargeBoardModal'
import { PUZZLE_PIECES } from './data/pieces'

type WorkerOutMsg =
  | { type: 'log'; line: string }
  | { type: 'result'; placements: { pieceId: string; cellIndexes: number[] }[]; iterations: number; elapsedMs: number }
  | {
    type: 'count_result'
    solutions: number
    rawSolutions?: number
    iterations: number
    elapsedMs: number
    storedSolutions?: { pieceId: string; cellIndexes: number[] }[][]
  }
  | { type: 'no_solution'; iterations: number; elapsedMs: number }
  | { type: 'error'; message: string }

type CountResult = { solutions: number; rawSolutions?: number; iterations: number; elapsedMs: number }

function App() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [solution, setSolution] = useState<SolveResult | null>(null)
  const [isCounting, setIsCounting] = useState(false)
  const [countResult, setCountResult] = useState<CountResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [piecesOpen, setPiecesOpen] = useState(false)
  const [storedSolutions, setStoredSolutions] = useState<{ pieceId: string; cellIndexes: number[] }[][]>([])
  const [solutionsOpen, setSolutionsOpen] = useState(false)
  const [selectedSolutionIndex, setSelectedSolutionIndex] = useState<number | null>(null)
  const [largeBoardOpen, setLargeBoardOpen] = useState(false)

  const workerRef = useRef<Worker | null>(null)

  const visibleCells = useMemo(() => {
    try {
      return getVisibleCellsForDate(selectedDate)
    } catch (e) {
      return null
    }
  }, [selectedDate])

  const appendLog = (line: string) => {
    const ts = new Date().toLocaleTimeString('fr-CA')
    setLogs((prev) => [...prev, `[${ts}] ${line}`])
  }

  useEffect(() => {
    // Cancel browser scroll restoration immediately on mount
    window.scrollTo(0, 0)
    appendLog(`${PUZZLE_PIECES.length} pièces chargées`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const stopSolving = () => {
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
      appendLog('Stop: tâche interrompue')
    }
    setIsCounting(false)
  }

  const handleSolve = () => {
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

    appendLog(
      `Résolution démarrée pour ${selectedDate.toLocaleDateString('fr-CA', { weekday: 'short', month: 'short', day: 'numeric' })}`,
    )

    worker.onmessage = (ev: MessageEvent<WorkerOutMsg>) => {
      const msg = ev.data
      if (msg.type === 'log') {
        appendLog(msg.line)
        return
      }
      if (msg.type === 'error') {
        setError(msg.message)
        appendLog(`Erreur: ${msg.message}`)
        setIsCounting(false)
        return
      }
      if (msg.type === 'no_solution') {
        // Comptage: 0 solution
        setCountResult({ solutions: 0, iterations: msg.iterations, elapsedMs: msg.elapsedMs })
        appendLog(`Comptage terminé: 0 solution (itérations: ${msg.iterations.toLocaleString('fr-CA')})`)
        setIsCounting(false)
        return
      }
      if (msg.type === 'count_result') {
        setCountResult({ solutions: msg.solutions, rawSolutions: msg.rawSolutions, iterations: msg.iterations, elapsedMs: msg.elapsedMs })
        if (msg.storedSolutions && msg.storedSolutions.length > 0) {
          setStoredSolutions(msg.storedSolutions)
          // Afficher automatiquement la solution #1
          setSolution({ placements: msg.storedSolutions[0], iterations: 0 })
          setSelectedSolutionIndex(0)
        }
        appendLog(
          `Comptage terminé: ${msg.solutions.toLocaleString('fr-CA')} solution(s) unique(s)` +
          `${typeof msg.rawSolutions === 'number' ? ` (brutes: ${msg.rawSolutions.toLocaleString('fr-CA')})` : ''}` +
          ` (${msg.iterations.toLocaleString('fr-CA')} itérations, ${msg.elapsedMs.toFixed(0)} ms)`,
        )
        setIsCounting(false)
        return
      }
      if (msg.type === 'result') {
        // Ignoré en mode "count"
        return
      }
    }

    worker.postMessage({ type: 'count_solutions', dateMs: selectedDate.getTime(), pieces: PUZZLE_PIECES, storeLimit: 500 })
  }

  const handleSelectSolution = (index: number, solution: { pieceId: string; cellIndexes: number[] }[]) => {
    setSolution({ placements: solution, iterations: 0 })
    setSelectedSolutionIndex(index)
  }

  return (
    <div className="app">
      <header className="app__header">
        <img src="/images/logo-header.png" alt="Une à la fois - Calendrier 365" className="app__logo" />
      </header>

      <div className="app__content">
        <div className="app__calendar-section">
          <CalendarPicker value={selectedDate} onChange={setSelectedDate} />
          <div className="app__buttons">
            <button className="app__solve-button" onClick={handleSolve} disabled={isCounting || !visibleCells}>
              {!isCounting && <img src="/images/puzzle-icon.png" alt="" className="app__button-icon" />}
              {isCounting ? 'Calcul...' : countResult ? 'Recalculer' : 'Résoudre'}
            </button>
            <button className="app__stop-button" onClick={stopSolving} disabled={!isCounting}>
              Stop
            </button>
            <button className="app__pieces-button" onClick={() => setPiecesOpen(true)}>
              Voir les pièces
            </button>
          </div>
        </div>

        <div className="app__board-section">
          {error && <div className="app__error">{error}</div>}

          <div className={`app__solution-info ${solution ? 'visible' : 'placeholder'}`}>
            {solution ? (
              <>
                {storedSolutions.length > 0
                  ? `Solution #${(selectedSolutionIndex ?? 0) + 1} sur ${storedSolutions.length.toLocaleString('fr-CA')} stockée(s)`
                  : solution.iterations > 0
                    ? `Solution trouvée en ${solution.iterations.toLocaleString('fr-CA')} itérations`
                    : 'Solution affichée'}
                {typeof solution.elapsedMs === 'number' && solution.elapsedMs > 0
                  ? ` (${solution.elapsedMs.toFixed(0)} ms)`
                  : null}
              </>
            ) : (
              <span className="app__board-title">Calendrier 365</span>
            )}
          </div>

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

          {/* Zone sous le plateau: infos de comptage */}
          <div className="app__count-panel" aria-live="polite">
            <div className="app__count-result">
              <div className="app__count-value">
                {countResult
                  ? `${countResult.solutions.toLocaleString('fr-CA')} solution(s) unique(s)`
                  : '— solution(s) unique(s)'}
              </div>
              <div className="app__count-meta">
                {countResult ? (
                  <>
                    {typeof countResult.rawSolutions === 'number'
                      ? `${countResult.rawSolutions.toLocaleString('fr-CA')} brutes • `
                      : ''}
                    {countResult.iterations.toLocaleString('fr-CA')} itérations • {countResult.elapsedMs.toFixed(0)} ms
                  </>
                ) : (
                  <span>—</span>
                )}
              </div>

              <div className="app__count-actions">
                {storedSolutions.length > 0 ? (
                  <button className="app__count-button" onClick={() => setSolutionsOpen(true)}>
                    Voir les solutions ({storedSolutions.length.toLocaleString('fr-CA')})
                  </button>
                ) : (
                  <span className="app__count-actionsPlaceholder">&nbsp;</span>
                )}
              </div>

              <div className="app__count-hint">
                {countResult ? <span>&nbsp;</span> : 'Cliquez sur Résoudre pour calculer toutes les solutions.'}
              </div>
            </div>
          </div>
        </div>

        <div className="app__logs-section">
          <LogsPanel lines={logs} onClear={() => setLogs([])} />
        </div>
      </div>

      <PiecesModal isOpen={piecesOpen} onClose={() => setPiecesOpen(false)} pieces={PUZZLE_PIECES} />
      <SolutionsModal
        isOpen={solutionsOpen}
        onClose={() => setSolutionsOpen(false)}
        solutions={storedSolutions}
        onSelectSolution={handleSelectSolution}
      />
      {visibleCells && (
        <LargeBoardModal
          isOpen={largeBoardOpen}
          onClose={() => setLargeBoardOpen(false)}
          visible={visibleCells}
          solution={solution}
          pieces={PUZZLE_PIECES}
        />
      )}
    </div>
  )
}

export default App
