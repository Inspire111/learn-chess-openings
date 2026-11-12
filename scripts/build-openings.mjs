// Rebuilds src/data/openings.json from the Lichess openings dataset (CC0).
// https://github.com/lichess-org/chess-openings
//
//   npm run data
//
// The generated file is committed, so you only need this to pick up
// upstream changes.
import { writeFile, mkdir } from 'node:fs/promises'
import { Chess } from 'chess.js'

const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/'
const FILES = ['a', 'b', 'c', 'd', 'e']

const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const families = new Map()
let skipped = 0

for (const f of FILES) {
  const res = await fetch(`${BASE}${f}.tsv`)
  if (!res.ok) throw new Error(`Could not download ${f}.tsv: ${res.status}`)
  const rows = (await res.text()).trim().split('\n').slice(1)
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t')
    if (!eco || !name || !pgn) continue
    const sans = pgn
      .replace(/\d+\.(\.\.)?/g, ' ')
      .trim()
      .split(/\s+/)
    // Replay every line so a bad row can never reach the app.
    const chess = new Chess()
    const clean = []
    try {
      for (const san of sans) clean.push(chess.move(san).san)
    } catch {
      skipped++
      continue
    }
    const familyName = name.split(':')[0].trim()
    const rest = name.includes(':') ? name.slice(name.indexOf(':') + 1).trim() : ''
    if (!families.has(familyName)) families.set(familyName, [])
    families.get(familyName).push({ eco, rest, moves: clean })
  }
}

const out = []
for (const [name, lines] of families) {
  // Drop exact duplicate move orders.
  const seen = new Set()
  const unique = lines.filter((l) => {
    const k = l.moves.join(' ')
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const root =
    unique.filter((l) => l.rest === '').sort((a, b) => a.moves.length - b.moves.length)[0] ??
    [...unique].sort((a, b) => a.moves.length - b.moves.length)[0]
  // Names settle most cases ("Defense" is Black's choice, "Attack" is White's);
  // otherwise whoever plays the defining move owns the opening.
  const color = /Defense|Counter/.test(name)
    ? 'b'
    : /Attack|Opening|Game$|System/.test(name)
      ? 'w'
      : root.moves.length % 2 === 1
        ? 'w'
        : 'b'
  // A line that is a prefix of another is a waypoint, not something to finish.
  const keys = unique.map((l) => l.moves.join(' ') + ' ')
  const leafCount = keys.filter((k) => !keys.some((o) => o !== k && o.startsWith(k))).length
  const ecos = unique.map((l) => l.eco).sort()
  out.push({
    n: name,
    s: slugify(name),
    c: color,
    r: root.moves.join(' '),
    e: ecos[0] === ecos.at(-1) ? ecos[0] : `${ecos[0]}–${ecos.at(-1)}`,
    k: leafCount,
    l: unique.map((l) => [l.eco, l.rest, l.moves.join(' ')]),
  })
}

out.sort((a, b) => b.k - a.k || a.n.localeCompare(b.n))

const slugs = new Set()
for (const f of out) {
  if (slugs.has(f.s)) throw new Error(`Duplicate slug ${f.s}`)
  slugs.add(f.s)
}

await mkdir(new URL('../src/data/', import.meta.url), { recursive: true })
await writeFile(new URL('../src/data/openings.json', import.meta.url), JSON.stringify(out))
const total = out.reduce((n, f) => n + f.l.length, 0)
console.log(`${out.length} openings, ${total} lines (${skipped} rows skipped)`)
