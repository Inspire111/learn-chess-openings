import { createElement, memo } from 'react'
import type { Color } from '../lib/openings'

const ROLE: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

/** A static diagram. Reuses the piece images from the main board's stylesheet. */
export const MiniBoard = memo(function MiniBoard({
  fen,
  orientation,
}: {
  fen: string
  orientation: Color
}) {
  const pieces: { cls: string; x: number; y: number }[] = []
  fen
    .split(' ')[0]
    .split('/')
    .forEach((row, rank) => {
      let file = 0
      for (const ch of row) {
        if (ch >= '1' && ch <= '8') {
          file += Number(ch)
          continue
        }
        const lower = ch.toLowerCase()
        const flip = orientation === 'black'
        pieces.push({
          cls: `${ROLE[lower]} ${ch === lower ? 'black' : 'white'}`,
          x: flip ? 7 - file : file,
          y: flip ? 7 - rank : rank,
        })
        file++
      }
    })
  return (
    <div className="cg-wrap mini" aria-hidden="true">
      {pieces.map((p, i) =>
        createElement('piece', {
          key: i,
          className: p.cls,
          style: { left: `${p.x * 12.5}%`, top: `${p.y * 12.5}%` },
        }),
      )}
    </div>
  )
})
