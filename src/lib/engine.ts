// A thin wrapper around Stockfish running in a Web Worker.
// It answers one question: "what are the three best moves here, and how good are they?"

export interface EngineMove {
  /** Move in UCI form, e.g. "e2e4" or "e7e8q". */
  uci: string
  /** Evaluation in pawns, from the point of view of the side to move. */
  score: number
}

const DEPTH = 14
const MAX_MS = 2500
/** A move stays playable while it is at most this many pawns worse than the best one. */
export const MAX_DROP = 0.99

let worker: Worker | null = null
let ready: Promise<void> | null = null
let listener: ((line: string) => void) | null = null
let queue: Promise<unknown> = Promise.resolve()
let running = false

function boot(): Promise<void> {
  if (ready) return ready
  ready = new Promise<void>((resolve, reject) => {
    try {
      worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish.js`)
    } catch (err) {
      reject(err)
      return
    }
    worker.onerror = () => reject(new Error('Stockfish failed to load'))
    worker.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return // download progress objects
      for (const line of ev.data.split('\n')) {
        if (line === 'readyok') resolve()
        listener?.(line)
      }
    }
    worker.postMessage('uci')
    worker.postMessage('setoption name MultiPV value 3')
    worker.postMessage('isready')
  })
  ready.catch(() => {
    ready = null
    worker = null
  })
  return ready
}

function search(fen: string): Promise<EngineMove[]> {
  return new Promise((resolve) => {
    const found = new Map<number, EngineMove>()
    running = true
    listener = (line) => {
      if (line.startsWith('info') && line.includes(' multipv ') && !line.includes('bound')) {
        const m = line.match(/ multipv (\d+) score (cp|mate) (-?\d+).* pv (\S+)/)
        if (!m) return
        const n = Number(m[3])
        // Any forced mate counts as roughly equal to any other forced mate.
        const score = m[2] === 'cp' ? n / 100 : Math.sign(n) * (200 - Math.abs(n) * 0.01)
        found.set(Number(m[1]), { uci: m[4], score })
      } else if (line.startsWith('bestmove')) {
        listener = null
        running = false
        // If the search was cut short, a lower slot can still hold an older copy
        // of a move that has since moved up. Keep the first (freshest) one.
        const moves = [...found.entries()]
          .sort((a, b) => a[0] - b[0])
          .map((e) => e[1])
          .filter((mv, i, all) => all.findIndex((o) => o.uci === mv.uci) === i)
        const best = line.split(' ')[1]
        if (!moves.length && best && best !== '(none)') moves.push({ uci: best, score: 0 })
        resolve(moves)
      }
    }
    worker!.postMessage(`position fen ${fen}`)
    worker!.postMessage(`go depth ${DEPTH} movetime ${MAX_MS}`)
  })
}

/** Top three moves for a position, best first. Calls are answered in order. */
export function analyse(fen: string): Promise<EngineMove[]> {
  // Whatever is being searched is no longer the position we care about.
  if (running) worker?.postMessage('stop')
  const result = queue.then(() => boot()).then(() => search(fen))
  queue = result.catch(() => undefined)
  return result
}

/** The moves worth playing: the top three, minus any that give up too much. */
export function playable(moves: EngineMove[]): EngineMove[] {
  if (!moves.length) return []
  const best = moves[0].score
  return moves.slice(0, 3).filter((m) => best - m.score <= MAX_DROP)
}
