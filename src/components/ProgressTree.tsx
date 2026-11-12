import { useMemo, useState } from 'react'
import { type Family, type Node, type Tree, leavesUnder, numbered } from '../lib/openings'

// The full move tree has one node per half-move, which is far too tall to
// read. Here it is squeezed down to the positions that matter: named
// variations, places where lines split, and line endings.
interface Knot {
  node: Node
  /** The moves that lead here from the previous knot. */
  seg: Node[]
  children: Knot[]
  label: string
  total: number
}

const COL = 272
const ROW = 60
const W = 232
const H = 50

function squeeze(family: Family, node: Node, seg: Node[], above: string): Knot {
  let label = ''
  if (node.name !== undefined) {
    const full = node.name || family.name
    // Drop what the branch above already says.
    if (full === above && node.children.length) label = ''
    else label = above && full.startsWith(above + ', ') ? full.slice(above.length + 2) : full
  }
  const nameBelow = node.name || above
  const children = node.children.map((child) => {
    const run = [child]
    let end = child
    while (end.name === undefined && end.children.length === 1) {
      end = end.children[0]
      run.push(end)
    }
    return squeeze(family, end, run, nameBelow)
  })
  return { node, seg, children, label, total: node.leafCount }
}

/** Open branches breadth-first until the tree is about a screen tall. */
function firstOpen(top: Knot): Set<string> {
  const open = new Set<string>()
  let rows = 1
  const queue = [top]
  while (queue.length) {
    const k = queue.shift()!
    if (!k.children.length) continue
    if (open.size > 0 && rows - 1 + k.children.length > 14) continue
    open.add(k.node.id)
    rows += k.children.length - 1
    queue.push(...k.children)
  }
  return open
}

interface Props {
  family: Family
  tree: Tree
  done: ReadonlySet<string>
  onPick: (line: Node) => void
}

export function ProgressTree({ family, tree, done, onPick }: Props) {
  const top = useMemo(() => {
    const root = squeeze(family, tree.root, [], '')
    return root.children.length === 1 ? root.children[0] : root
  }, [family, tree])
  const [open, setOpen] = useState(() => firstOpen(top))

  const doneUnder = useMemo(() => {
    const counts = new Map<string, number>()
    const walk = (k: Knot): number => {
      const n = k.children.length
        ? k.children.reduce((sum, c) => sum + walk(c), 0)
        : done.has(k.node.id)
          ? 1
          : 0
      counts.set(k.node.id, n)
      return n
    }
    walk(top)
    return counts
  }, [top, done])

  const layout = useMemo(() => {
    const boxes: { k: Knot; x: number; y: number }[] = []
    const links: { x1: number; y1: number; x2: number; y2: number; done: boolean }[] = []
    let row = 0
    let depthMax = 0
    const place = (k: Knot, depth: number): number => {
      depthMax = Math.max(depthMax, depth)
      const x = depth * COL
      let y: number
      if (open.has(k.node.id) && k.children.length) {
        const ys = k.children.map((c) => place(c, depth + 1))
        y = (ys[0] + ys[ys.length - 1]) / 2
        k.children.forEach((c, i) =>
          links.push({
            x1: x + W,
            y1: y + H / 2,
            x2: x + COL,
            y2: ys[i] + H / 2,
            done: doneUnder.get(c.node.id) === c.total,
          }),
        )
      } else {
        y = row++ * ROW
      }
      boxes.push({ k, x, y })
      return y
    }
    place(top, 0)
    return { boxes, links, width: depthMax * COL + W, height: (row - 1) * ROW + H }
  }, [top, open, doneUnder])

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const openAll = () => {
    const all = new Set<string>()
    const walk = (k: Knot) => {
      if (k.children.length) all.add(k.node.id)
      k.children.forEach(walk)
    }
    walk(top)
    setOpen(all)
  }

  const total = tree.leaves.length
  const finished = doneUnder.get(top.node.id) ?? 0

  return (
    <section className="tree-section">
      <div className="tree-bar">
        <p>
          <strong>
            {finished} of {total}
          </strong>{' '}
          lines completed. Pick a line to drill it: in a drill, only that line’s moves count.
        </p>
        <div className="tree-tools">
          <button onClick={openAll}>Expand all</button>
          <button onClick={() => setOpen(firstOpen(top))}>Collapse</button>
        </div>
      </div>

      <div className="tree-scroll">
        <div className="tree" style={{ width: layout.width, height: layout.height }}>
          <svg width={layout.width} height={layout.height} aria-hidden="true">
            {layout.links.map((l, i) => (
              <path
                key={i}
                className={l.done ? 'is-done' : ''}
                d={`M${l.x1} ${l.y1} C${l.x1 + 22} ${l.y1}, ${l.x2 - 22} ${l.y2}, ${l.x2} ${l.y2}`}
              />
            ))}
          </svg>
          {layout.boxes.map(({ k, x, y }) => {
            const isLeaf = !k.children.length
            const n = doneUnder.get(k.node.id) ?? 0
            const complete = n === k.total
            const moves = k.seg.length ? numbered(k.seg.map((s) => s.san), k.seg[0].ply - 1) : ''
            const title = k.label || (k.seg.length ? '' : 'Start position')
            return (
              <button
                key={k.node.id || 'root'}
                className={`knot ${isLeaf ? 'is-leaf' : 'is-branch'} ${complete ? 'is-done' : ''}`}
                style={{ left: x, top: y, width: W, height: H }}
                title={[title, moves].filter(Boolean).join(' — ')}
                aria-expanded={isLeaf ? undefined : open.has(k.node.id)}
                aria-label={
                  isLeaf
                    ? `Drill ${title || moves}${complete ? ', completed' : ''}`
                    : `${title || moves}, ${n} of ${k.total} completed`
                }
                onClick={() => (isLeaf ? onPick(k.node) : toggle(k.node.id))}
              >
                {isLeaf && <span className="tick">{complete ? '✓' : ''}</span>}
                <span className="knot-text">
                  {title && <span className="knot-name">{title}</span>}
                  {moves && <span className="knot-moves">{moves}</span>}
                </span>
                {!isLeaf && (
                  <span className="knot-count">
                    {n}/{k.total}
                    <span className="chev">{open.has(k.node.id) ? '−' : '+'}</span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      {leavesUnder(tree.root).length > 40 && (
        <p className="muted small">Branches with a + hold more lines. Scroll sideways for deeper variations.</p>
      )}
    </section>
  )
}
