import { useEffect, useRef } from 'react'
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { Key } from 'chessground/types'
import type { Color } from '../lib/openings'

export type Square = Key

interface Props {
  fen: string
  orientation: Color
  turn: Color
  /** Whether the side to move may be moved by the player right now. */
  canMove: boolean
  dests: Map<Square, Square[]>
  lastMove?: [Square, Square]
  inCheck: boolean
  onMove: (from: Square, to: Square) => void
  /** Squares to ring as a hint. */
  hints: Square[]
  arrow?: [Square, Square]
  /** Bump to snap the board back to `fen` after a rejected move. */
  syncKey: number
}

export function Board(p: Props) {
  const el = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)
  const onMove = useRef(p.onMove)
  onMove.current = p.onMove

  useEffect(() => {
    api.current = Chessground(el.current!, {
      // Chessground rounds the board down to whole pixels inside its wrapper and
      // publishes the real size as ---cg-width / ---cg-height. Putting them on the
      // parent lets overlays next to the board (the ✓/✕ badge) line up with squares.
      addDimensionsCssVarsTo: el.current!.parentElement ?? undefined,
      animation: { duration: 180 },
      premovable: { enabled: false },
      drawable: { enabled: false, visible: true },
      movable: { free: false, rookCastle: false, showDests: true },
      highlight: { lastMove: true, check: true },
    })
    return () => {
      api.current?.destroy()
      api.current = null
    }
  }, [])

  useEffect(() => {
    const cg = api.current
    if (!cg) return
    cg.set({
      fen: p.fen,
      orientation: p.orientation,
      turnColor: p.turn,
      check: p.inCheck ? p.turn : false,
      lastMove: p.lastMove,
      movable: {
        color: p.canMove ? p.turn : undefined,
        dests: p.canMove ? p.dests : new Map(),
        events: { after: (from, to) => onMove.current(from, to) },
      },
      highlight: { custom: new Map(p.hints.map((s) => [s, 'hint'])) },
    })
    cg.setAutoShapes(p.arrow ? [{ orig: p.arrow[0], dest: p.arrow[1], brush: 'blue' }] : [])
  }, [p.fen, p.orientation, p.turn, p.canMove, p.dests, p.lastMove, p.inCheck, p.hints, p.arrow, p.syncKey])

  return <div className="board" ref={el} />
}
