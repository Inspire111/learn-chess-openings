import raw from '../data/openings.json'

export type Color = 'white' | 'black'

type RawLine = [eco: string, rest: string, moves: string]
interface RawFamily {
  n: string
  s: string
  c: string
  r: string
  e: string
  k: number
  l: RawLine[]
}

export interface Family {
  name: string
  slug: string
  /** The side this opening is usually studied from. */
  color: Color
  /** Moves leading to the position that defines the opening. */
  root: string[]
  eco: string
  lineCount: number
  /** Lower-cased, accent-free text to search in. */
  haystack: string
  variations: string[]
  lines: RawLine[]
}

/** One position in an opening's move tree. */
export interface Node {
  /** The moves from the start position, space separated. Stable across builds. */
  id: string
  san: string
  ply: number
  parent: Node | null
  children: Node[]
  /** Set when a named variation ends on this position ('' is the opening itself). */
  name?: string
  eco?: string
  /** Number of complete lines that pass through this position. */
  leafCount: number
}

export interface Tree {
  root: Node
  /** Every complete line, main branches first. */
  leaves: Node[]
}

export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export const families: Family[] = (raw as RawFamily[]).map((f) => {
  const variations = [...new Set(f.l.map((l) => l[1]).filter(Boolean))]
  const ecos = [...new Set(f.l.map((l) => l[0]))]
  return {
    name: f.n,
    slug: f.s,
    color: f.c === 'w' ? 'white' : 'black',
    root: f.r.split(' '),
    eco: f.e,
    lineCount: f.k,
    haystack: fold([f.n, ...variations, ...ecos].join(' | ')),
    variations,
    lines: f.l,
  }
})

const bySlug = new Map(families.map((f) => [f.slug, f]))
export const findFamily = (slug: string) => bySlug.get(slug)

const trees = new Map<string, Tree>()

export function treeOf(family: Family): Tree {
  const cached = trees.get(family.slug)
  if (cached) return cached

  const root: Node = { id: '', san: '', ply: 0, parent: null, children: [], leafCount: 0 }
  for (const [eco, rest, moves] of family.lines) {
    let node = root
    for (const san of moves.split(' ')) {
      let next = node.children.find((c) => c.san === san)
      if (!next) {
        next = {
          id: node.id ? `${node.id} ${san}` : san,
          san,
          ply: node.ply + 1,
          parent: node,
          children: [],
          leafCount: 0,
        }
        node.children.push(next)
      }
      node = next
    }
    node.name = rest
    node.eco = eco
  }

  const leaves: Node[] = []
  const count = (n: Node): number => {
    n.leafCount = n.children.length ? n.children.reduce((sum, c) => sum + count(c), 0) : 1
    // Bigger branches are the main lines; show and teach them first.
    n.children.sort((a, b) => b.leafCount - a.leafCount)
    return n.leafCount
  }
  count(root)
  const collect = (n: Node) => {
    if (!n.children.length) leaves.push(n)
    else n.children.forEach(collect)
  }
  collect(root)

  const tree = { root, leaves }
  trees.set(family.slug, tree)
  return tree
}

/** Nodes from the first move down to `node`. */
export function pathTo(node: Node): Node[] {
  const path: Node[] = []
  for (let n: Node | null = node; n && n.parent; n = n.parent) path.unshift(n)
  return path
}

export const isUnder = (node: Node, ancestor: Node) =>
  node === ancestor || node.id.startsWith(ancestor.id ? ancestor.id + ' ' : '')

export function leavesUnder(node: Node): Node[] {
  if (!node.children.length) return [node]
  return node.children.flatMap(leavesUnder)
}

/** "Najdorf Variation, English Attack", or the opening's own name for its bare line. */
export const lineName = (family: Family, node: Node) => node.name || family.name

/** The deepest named position at or above `node`. */
export function nearestName(node: Node): Node | null {
  for (let n: Node | null = node; n; n = n.parent) if (n.name !== undefined) return n
  return null
}

/** Pick the line to learn next: the first unfinished one after `after`, wrapping around. */
export function nextLine(tree: Tree, done: ReadonlySet<string>, after?: Node): Node {
  const { leaves } = tree
  const start = after ? leaves.indexOf(after) + 1 : 0
  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[(start + i) % leaves.length]
    if (!done.has(leaf.id) && leaf !== after) return leaf
  }
  return leaves[start % leaves.length]
}

/** "1. e4 c5 2. Nf3" — `startPly` is the number of half-moves already played. */
export function numbered(sans: string[], startPly = 0): string {
  const out: string[] = []
  sans.forEach((san, i) => {
    const ply = startPly + i
    const n = Math.floor(ply / 2) + 1
    if (ply % 2 === 0) out.push(`${n}. ${san}`)
    else if (i === 0) out.push(`${n}… ${san}`)
    else out.push(san)
  })
  return out.join(' ')
}
