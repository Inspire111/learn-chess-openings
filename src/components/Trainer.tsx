import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Move } from 'chess.js'
import { Board, type Square } from './Board'
import { analyse, playable, type EngineMove } from '../lib/engine'
import {
  type Color,
  type Family,
  type Node,
  type Tree,
  isUnder,
  leavesUnder,
  lineName,
  nextLine,
  numbered,
  pathTo,
} from '../lib/openings'
import { markDone } from '../lib/progress'

/** free: any book move of the opening is accepted. strict: only the chosen line's moves. */
export type Mode = 'free' | 'strict'

interface Props {
  family: Family
  tree: Tree
  color: Color
  done: ReadonlySet<string>
  mode: Mode
  first: Node
  onExit: () => void
}

// book: following the opening. done: reached the end of a line.
// engine: playing on against Stockfish. over: that game ended.
type Phase = 'book' | 'done' | 'engine' | 'over'

const NONE: Square[] = []
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The top-right corner of `square`, in squares from the board's top-left (see .verdict). */
function corner(square: Square, orientation: Color) {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1
  const col = orientation === 'white' ? file : 7 - file
  const row = orientation === 'white' ? 7 - rank : rank
  return { '--x': col + 1, '--y': row } as CSSProperties
}

export function Trainer({ family, tree, color, done, mode, first, onExit }: Props) {
  const [chess] = useState(() => new Chess())
  const [target, setTarget] = useState(first)
  const [node, setNode] = useState(tree.root)
  const [phase, setPhase] = useState<Phase>('book')
  const [fen, setFen] = useState(() => chess.fen())
  const [lastMove, setLastMove] = useState<[Square, Square]>()
  const [played, setPlayed] = useState<string[]>([])
  const [mistakes, setMistakes] = useState(0)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintLevel, setHintLevel] = useState(0)
  const [engineHints, setEngineHints] = useState<Square[]>(NONE)
  const [verdict, setVerdict] = useState<{ ok: boolean; n: number; square: Square } | null>(null)
  const [syncKey, setSyncKey] = useState(0)
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null)
  const [busy, setBusy] = useState(false)
  const [engineError, setEngineError] = useState(false)
  const [clean, setClean] = useState(false)
  // True from a rejected move until the next accepted move or hint.
  const [wrong, setWrong] = useState(false)

  // Bumped whenever a line is (re)started so late engine answers are ignored.
  const run = useRef(0)
  const analysis = useRef<{ fen: string; moves: Promise<EngineMove[]> } | null>(null)

  const path = useMemo(() => pathTo(target), [target])
  const view = useMemo(() => new Chess(fen), [fen])
  const turn: Color = view.turn() === 'w' ? 'white' : 'black'
  const expected = path[node.ply] as Node | undefined

  const dests = useMemo(() => {
    const map = new Map<Square, Square[]>()
    for (const m of view.moves({ verbose: true })) {
      const list = map.get(m.from)
      if (list) list.push(m.to)
      else map.set(m.from, [m.to])
    }
    return map
  }, [view])

  const expectedMove = useMemo(
    () =>
      phase === 'book' && expected
        ? view.moves({ verbose: true }).find((m) => m.san === expected.san)
        : undefined,
    [phase, expected, view],
  )
  const hintSquares = useMemo<Square[]>(
    () =>
      phase === 'engine' ? engineHints : hintLevel >= 1 && expectedMove ? [expectedMove.from] : NONE,
    [phase, engineHints, hintLevel, expectedMove],
  )
  const arrow = useMemo<[Square, Square] | undefined>(
    () => (hintLevel >= 2 && expectedMove ? [expectedMove.from, expectedMove.to] : undefined),
    [hintLevel, expectedMove],
  )

  const show = (mv: Move) => {
    setFen(chess.fen())
    setLastMove([mv.from, mv.to])
    setPlayed(chess.history())
  }
  // The badge goes on the square the player's piece landed on.
  const flash = (ok: boolean, mv: Move) =>
    setVerdict((v) => ({ ok, square: mv.to as Square, n: (v?.n ?? 0) + 1 }))

  function begin(line: Node) {
    run.current++
    chess.reset()
    analysis.current = null
    setTarget(line)
    setNode(tree.root)
    setPhase('book')
    setFen(chess.fen())
    setLastMove(undefined)
    setPlayed([])
    setMistakes(0)
    setHintsUsed(0)
    setHintLevel(0)
    setEngineHints(NONE)
    setVerdict(null)
    setPromo(null)
    setBusy(false)
    setEngineError(false)
    setWrong(false)
    setSyncKey((k) => k + 1)
  }

  // Following the book: finish the line, or play the other side's reply.
  useEffect(() => {
    if (phase !== 'book') return
    if (!node.children.length) {
      const ok = mistakes === 0 && hintsUsed === 0
      setClean(ok)
      if (ok) markDone(family.slug, color, node.id)
      setPhase('done')
      return
    }
    if (turn === color || !expected) return
    const timer = setTimeout(
      () => {
        show(chess.move(expected.san))
        setNode(expected)
      },
      node.ply === 0 ? 600 : 420,
    )
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, node, target])

  function accept(mv: Move) {
    show(mv)
    flash(true, mv)
    setWrong(false)
    setHintLevel(0)
    setEngineHints(NONE)
  }

  function reject(mv: Move) {
    chess.undo()
    setMistakes((m) => m + 1)
    flash(false, mv)
    setWrong(true)
    // Leave the wrong move on the board for a beat, then take it back.
    setTimeout(() => setSyncKey((k) => k + 1), 260)
  }

  function onMove(from: Square, to: Square, promotion?: string) {
    const piece = chess.get(from as Parameters<typeof chess.get>[0])
    if (!promotion && piece?.type === 'p' && (to[1] === '8' || to[1] === '1')) {
      setPromo({ from, to })
      return
    }
    setPromo(null)
    let mv: Move
    try {
      mv = chess.move({ from, to, promotion })
    } catch {
      setSyncKey((k) => k + 1)
      return
    }
    if (phase === 'book') {
      const child =
        mode === 'strict'
          ? expected?.san === mv.san
            ? expected
            : undefined
          : node.children.find((c) => c.san === mv.san)
      if (!child) return reject(mv)
      accept(mv)
      // A different book move than the planned one: follow the player there.
      if (!isUnder(target, child)) {
        const options = leavesUnder(child)
        setTarget(options.find((l) => !done.has(l.id)) ?? options[0])
      }
      setNode(child)
    } else if (phase === 'engine') {
      void judge(mv)
    }
  }

  // --- Playing on against Stockfish -------------------------------------

  /** Start working out which moves are good for the player in this position. */
  function think(id: number) {
    const moves = analyse(chess.fen())
    analysis.current = { fen: chess.fen(), moves }
    moves.catch(() => run.current === id && setEngineError(true))
  }

  async function engineReply(id: number) {
    setBusy(true)
    try {
      const options = playable(await analyse(chess.fen()))
      if (run.current !== id) return
      const pick = options[Math.floor(Math.random() * options.length)]
      if (!pick) {
        setPhase('over')
        return
      }
      show(chess.move({ from: pick.uci.slice(0, 2), to: pick.uci.slice(2, 4), promotion: pick.uci[4] }))
      if (chess.isGameOver()) setPhase('over')
      else think(id)
    } catch {
      if (run.current === id) setEngineError(true)
    } finally {
      if (run.current === id) setBusy(false)
    }
  }

  async function judge(mv: Move) {
    const id = run.current
    const uci = mv.from + mv.to + (mv.promotion ?? '')
    setBusy(true)
    try {
      const known = analysis.current
      const options = playable(await (known?.fen === mv.before ? known.moves : analyse(mv.before)))
      if (run.current !== id) return
      if (options.some((m) => m.uci === uci) || chess.isCheckmate()) {
        accept(mv)
        if (chess.isGameOver()) {
          setPhase('over')
          setBusy(false)
        } else {
          void engineReply(id)
        }
      } else {
        setBusy(false)
        reject(mv)
      }
    } catch {
      if (run.current !== id) return
      chess.undo()
      setSyncKey((k) => k + 1)
      setBusy(false)
      setEngineError(true)
    }
  }

  function playOn() {
    const id = run.current
    setVerdict(null)
    setWrong(false)
    setEngineError(false)
    if (chess.isGameOver()) {
      setPhase('over')
      return
    }
    setPhase('engine')
    if ((chess.turn() === 'w' ? 'white' : 'black') === color) think(id)
    else void engineReply(id)
  }

  async function hint() {
    setWrong(false)
    if (phase === 'book') {
      if (hintLevel === 0) setHintsUsed((h) => h + 1)
      setHintLevel((l) => Math.min(2, l + 1))
    } else if (phase === 'engine' && analysis.current) {
      const asked = analysis.current
      try {
        const options = playable(await asked.moves)
        if (asked !== analysis.current) return
        setEngineHints([...new Set(options.map((m) => m.uci.slice(0, 2) as Square))])
      } catch {
        setEngineError(true)
      }
    }
  }

  // --- What to say ----------------------------------------------------------

  const yourTurn = turn === color
  const canMove = yourTurn && !busy && !promo && (phase === 'book' || phase === 'engine')
  const name = lineName(family, target)
  const total = tree.leaves.length
  const other = color === 'white' ? 'Black' : 'White'

  let status: string
  if (phase === 'book') {
    if (!yourTurn) status = `${other} replies…`
    else if (wrong)
      status =
        mode === 'strict'
          ? 'That is not this line’s move. Try again.'
          : 'That is not a book move here. Try again.'
    else if (hintLevel === 1) status = 'The ringed piece is the one to move.'
    else if (hintLevel === 2) status = 'Play the move shown by the arrow.'
    else status = 'Your move.'
  } else if (phase === 'engine') {
    if (engineError) status = 'Stockfish could not be loaded. Check that the app was started with npm run dev.'
    else if (busy) status = yourTurn ? 'Checking your move…' : 'Stockfish is thinking…'
    else if (wrong) status = 'Stockfish has clearly better moves. Try again.'
    else if (engineHints.length) status = 'Any ringed piece has a good move.'
    else status = 'Out of book. Play any of Stockfish’s top three moves.'
  } else if (phase === 'over') {
    status = chess.isCheckmate()
      ? chess.turn() === (color === 'white' ? 'w' : 'b')
        ? 'Checkmate. Stockfish wins this one.'
        : 'Checkmate. You win.'
      : 'Draw.'
  } else {
    status = ''
  }

  const penalties = [
    mistakes ? plural(mistakes, 'mistake') : '',
    hintsUsed ? plural(hintsUsed, 'hint') : '',
  ].filter(Boolean)

  return (
    <div className="trainer">
      <div className="board-wrap">
        <Board
          fen={fen}
          orientation={color}
          turn={turn}
          canMove={canMove}
          dests={dests}
          lastMove={lastMove}
          inCheck={view.inCheck()}
          onMove={onMove}
          hints={hintSquares}
          arrow={arrow}
          syncKey={syncKey}
        />
        {verdict && (
          <div
            key={verdict.n}
            className={`verdict ${verdict.ok ? 'ok' : 'bad'}`}
            style={corner(verdict.square, color)}
            role="img"
            aria-label={verdict.ok ? 'Correct' : 'Wrong'}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {verdict.ok ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M7 7l10 10M17 7L7 17" />}
            </svg>
          </div>
        )}
        {promo && (
          <div className="promo" role="dialog" aria-label="Promote to">
            {(
              [
                ['q', 'Queen'],
                ['r', 'Rook'],
                ['b', 'Bishop'],
                ['n', 'Knight'],
              ] as const
            ).map(([p, label]) => (
              <button key={p} onClick={() => onMove(promo.from, promo.to, p)}>
                {label}
              </button>
            ))}
            <button
              className="quiet"
              onClick={() => {
                setPromo(null)
                setSyncKey((k) => k + 1)
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="panel">
        <header className="line-head">
          <h2>{name}</h2>
          <p className="muted">
            {name === family.name ? target.eco : `${family.name}, ${target.eco}`}
            {mode === 'strict' ? '. Drill: only this line’s moves count.' : ''}
          </p>
        </header>

        <div
          className="line-bar"
          role="progressbar"
          aria-label="Moves played in this line"
          aria-valuemin={0}
          aria-valuemax={target.ply}
          aria-valuenow={Math.min(played.length, target.ply)}
        >
          <span style={{ width: `${(Math.min(played.length, target.ply) / target.ply) * 100}%` }} />
        </div>

        <p className="moves">{played.length ? numbered(played) : 'No moves yet.'}</p>

        {phase !== 'done' && (
          <p className={`status${wrong && !busy && phase !== 'over' ? ' is-bad' : ''}`} role="status">
            {status}
          </p>
        )}

        {phase === 'book' && penalties.length > 0 && (
          <p className="muted small">
            {penalties.join(' and ')} so far, so this run will not count as completed.
          </p>
        )}

        {phase === 'done' && (
          <div className={`result ${clean ? 'is-clean' : ''}`} role="status">
            <h3>{clean ? 'Line completed' : 'End of the line, not counted yet'}</h3>
            <p>
              {clean
                ? `Played from memory, start to finish. ${done.size} of ${total} lines completed.`
                : `You needed ${penalties.join(' and ')}. Play it again without help to complete it.`}
            </p>
          </div>
        )}

        <div className="actions">
          {phase === 'done' && !clean && (
            <button className="primary" onClick={() => begin(target)}>
              Play it again
            </button>
          )}
          {(phase === 'done' || phase === 'over' || phase === 'engine') && (
            <button
              className={phase === 'done' && clean ? 'primary' : ''}
              onClick={() => begin(nextLine(tree, done, target))}
            >
              Next line
            </button>
          )}
          {phase === 'done' && (
            <button onClick={playOn}>Keep playing against Stockfish</button>
          )}
          {(phase === 'book' || phase === 'engine') && (
            <button className={phase === 'book' ? 'primary' : ''} onClick={hint} disabled={!canMove}>
              {phase === 'book' && hintLevel === 1 ? 'Show the move' : 'Hint'}
            </button>
          )}
          {(phase === 'book' || phase === 'over') && played.length > 0 && (
            <button onClick={() => begin(target)}>Start over</button>
          )}
          <button className="quiet" onClick={onExit}>
            Leave
          </button>
        </div>
      </div>
    </div>
  )
}
