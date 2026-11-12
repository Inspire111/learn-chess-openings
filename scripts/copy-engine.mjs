// Copies the single-threaded "lite" Stockfish build out of node_modules into
// public/engine so the browser can load it as a Web Worker. Runs automatically
// before `npm run dev` and `npm run build`.
import { readdir, mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const src = join(root, 'node_modules', 'stockfish', 'bin')
const dest = join(root, 'public', 'engine')

function fail(message) {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}

const files = await readdir(src).catch(() =>
  fail('Stockfish is not installed. Run `npm install` first, then try again.'),
)
const js = files.find((f) => /lite-single.*\.js$/.test(f))
const wasm = files.find((f) => /lite-single.*\.wasm$/.test(f))
if (!js || !wasm) fail(`No Stockfish "lite-single" build found in ${src}. Try reinstalling with \`npm ci\`.`)

await mkdir(dest, { recursive: true })
// The worker looks for a .wasm file with the same base name next to it.
await copyFile(join(src, js), join(dest, 'stockfish.js'))
await copyFile(join(src, wasm), join(dest, 'stockfish.wasm'))
