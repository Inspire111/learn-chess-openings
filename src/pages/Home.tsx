import { useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { MiniBoard } from '../components/MiniBoard'
import { type Color, type Family, families, fold } from '../lib/openings'
import { chosenColor, doneLines, useProgress } from '../lib/progress'

const fens = new Map<string, string>()
function rootFen(f: Family): string {
  let fen = fens.get(f.slug)
  if (!fen) {
    const chess = new Chess()
    f.root.forEach((san) => chess.move(san))
    fen = chess.fen()
    fens.set(f.slug, fen)
  }
  return fen
}

const totalLines = families.reduce((n, f) => n + f.lineCount, 0)

export function Home() {
  const store = useProgress()
  const [query, setQuery] = useState('')
  const [side, setSide] = useState<'all' | Color>('all')

  const shown = useMemo(() => {
    const q = fold(query.trim())
    return families
      .filter((f) => (side === 'all' || f.color === side) && (!q || f.haystack.includes(q)))
      .map((f) => {
        const color = chosenColor(store, f.slug, f.color)
        const done = doneLines(store, f.slug, color).length
        // Say why an opening matched when its own name does not contain the query.
        const via =
          q && !fold(f.name).includes(q)
            ? (f.variations
                .filter((v) => fold(v).includes(q))
                .sort((a, b) => a.length - b.length)[0] ?? `ECO ${query.trim().toUpperCase()}`)
            : ''
        return { f, color, done, via }
      })
      .sort((a, b) => Number(b.done > 0) - Number(a.done > 0))
  }, [query, side, store])

  return (
    <>
      <section className="hero">
        <h1>Which opening do you want to learn?</h1>
        <p className="lede">
          Pick one, play its lines on the board, and get corrected the moment you leave the book.{' '}
          {families.length} openings and {totalLines.toLocaleString('en')} lines, free, with no
          account.
        </p>
        <div className="search-row">
          <input
            className="search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, variation or ECO code: Sicilian, Najdorf, B90"
            aria-label="Search openings"
            autoFocus
          />
          <div className="segmented" role="group" aria-label="Show openings for">
            {(
              [
                ['all', 'All'],
                ['white', 'For White'],
                ['black', 'For Black'],
              ] as const
            ).map(([value, label]) => (
              <button key={value} aria-pressed={side === value} onClick={() => setSide(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {shown.length === 0 ? (
        <p className="empty">
          No opening matches “{query}”. Try part of a name, such as Sicilian or Gambit, or an ECO
          code such as C50.
        </p>
      ) : (
        <ul className="grid">
          {shown.map(({ f, color, done, via }) => (
            <li key={f.slug}>
              <a className="tile" href={`#/o/${f.slug}`}>
                <MiniBoard fen={rootFen(f)} orientation={color} />
                <span className="tile-name">{f.name}</span>
                <span className="tile-meta">
                  {done > 0
                    ? `${done} of ${f.lineCount} lines completed`
                    : `${f.lineCount} ${f.lineCount === 1 ? 'line' : 'lines'}, as ${color === 'white' ? 'White' : 'Black'}`}
                </span>
                {via && <span className="tile-via">Includes {via}</span>}
                {done > 0 && (
                  <span className="tile-bar">
                    <span style={{ width: `${(done / f.lineCount) * 100}%` }} />
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
