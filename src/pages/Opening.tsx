import { useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { MiniBoard } from '../components/MiniBoard'
import { ProgressTree } from '../components/ProgressTree'
import { Trainer, type Mode } from '../components/Trainer'
import { type Color, type Node, findFamily, nextLine, numbered, treeOf } from '../lib/openings'
import { chosenColor, doneLines, resetOpening, setColor, useProgress } from '../lib/progress'

interface Session {
  id: number
  mode: Mode
  first: Node
}

export function OpeningPage({ slug, tab }: { slug: string; tab: 'train' | 'progress' }) {
  const family = findFamily(slug)
  const store = useProgress()
  const [session, setSession] = useState<Session | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const tree = useMemo(() => (family ? treeOf(family) : null), [family])
  const color = family ? chosenColor(store, slug, family.color) : 'white'
  const doneList = doneLines(store, slug, color)
  const done = useMemo(() => new Set(doneList), [doneList])
  const rootFen = useMemo(() => {
    const chess = new Chess()
    family?.root.forEach((san) => chess.move(san))
    return chess.fen()
  }, [family])

  if (!family || !tree) {
    return (
      <p className="empty">
        There is no opening at this address. <a href="#/">See all openings</a>.
      </p>
    )
  }

  const total = tree.leaves.length
  const start = (mode: Mode, first: Node) => {
    setSession({ id: Date.now(), mode, first })
    location.hash = `#/o/${slug}`
  }
  const pickColor = (c: Color) => {
    if (c === color) return
    setColor(slug, c)
    setSession(null)
    setConfirmReset(false)
  }

  return (
    <>
      <div className="opening-head">
        <a className="back" href="#/">
          All openings
        </a>
        <h1>{family.name}</h1>
        <p className="muted">
          ECO {family.eco}. {total} {total === 1 ? 'line' : 'lines'}, {done.size} completed as{' '}
          {color === 'white' ? 'White' : 'Black'}.
        </p>
        <div className="opening-controls">
          <nav className="tabs" aria-label="Views">
            <a href={`#/o/${slug}`} aria-current={tab === 'train' ? 'page' : undefined}>
              Train
            </a>
            <a href={`#/o/${slug}/progress`} aria-current={tab === 'progress' ? 'page' : undefined}>
              Progress
            </a>
          </nav>
          <div className="segmented" role="group" aria-label="Play as">
            {(['white', 'black'] as const).map((c) => (
              <button key={c} aria-pressed={color === c} onClick={() => pickColor(c)}>
                Play as {c === 'white' ? 'White' : 'Black'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div hidden={tab !== 'train'}>
        {session ? (
          <Trainer
            key={`${session.id}-${color}`}
            family={family}
            tree={tree}
            color={color}
            done={done}
            mode={session.mode}
            first={session.first}
            onExit={() => setSession(null)}
          />
        ) : (
          <div className="trainer">
            <div className="board-wrap">
              <MiniBoard fen={rootFen} orientation={color} />
            </div>
            <div className="panel">
              <header className="line-head">
                <h2>{numbered(family.root)}</h2>
                <p className="muted">The position that defines the {family.name}.</p>
              </header>
              <ul className="rules">
                <li>You play {color === 'white' ? 'White' : 'Black'}; the other side answers by itself.</li>
                <li>Any book move of this opening is accepted. Anything else is taken back.</li>
                <li>Stuck? Hint rings the piece to move.</li>
                <li>A line is completed once you play it through with no mistakes and no hints.</li>
              </ul>
              <div className="actions">
                <button className="primary" onClick={() => start('free', nextLine(tree, done))}>
                  {done.size === 0
                    ? 'Start training'
                    : done.size < total
                      ? 'Continue training'
                      : 'Train again'}
                </button>
                <a className="button" href={`#/o/${slug}/progress`}>
                  Choose a line
                </a>
              </div>
              {done.size > 0 &&
                (confirmReset ? (
                  <p className="small">
                    Forget all {done.size} completed lines as {color === 'white' ? 'White' : 'Black'}?{' '}
                    <button
                      className="link danger"
                      onClick={() => {
                        resetOpening(slug, color)
                        setConfirmReset(false)
                      }}
                    >
                      Reset progress
                    </button>{' '}
                    <button className="link" onClick={() => setConfirmReset(false)}>
                      Keep it
                    </button>
                  </p>
                ) : (
                  <p className="small">
                    <button className="link" onClick={() => setConfirmReset(true)}>
                      Reset progress
                    </button>
                  </p>
                ))}
            </div>
          </div>
        )}
      </div>

      <div hidden={tab !== 'progress'}>
        <ProgressTree
          key={color}
          family={family}
          tree={tree}
          done={done}
          onPick={(line) => start('strict', line)}
        />
      </div>
    </>
  )
}
