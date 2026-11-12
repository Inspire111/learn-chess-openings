import { useEffect, useState } from 'react'
import { Home } from './pages/Home'
import { OpeningPage } from './pages/Opening'

// Hash routes keep the app a plain static site:
//   #/                      all openings
//   #/o/<slug>              train an opening
//   #/o/<slug>/progress     its progress tree
function useRoute(): string[] {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const update = () => setHash(location.hash)
    addEventListener('hashchange', update)
    return () => removeEventListener('hashchange', update)
  }, [])
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
}

export function App() {
  const [page, slug, tab] = useRoute()
  const onOpening = page === 'o' && !!slug

  useEffect(() => {
    scrollTo(0, 0)
  }, [onOpening, slug])

  return (
    <div className="app">
      <header className="top">
        <a className="wordmark" href="#/">
          Mainline
        </a>
        <span className="muted">Learn chess openings by playing them</span>
      </header>
      <main>
        {onOpening ? (
          <OpeningPage key={slug} slug={slug} tab={tab === 'progress' ? 'progress' : 'train'} />
        ) : (
          <Home />
        )}
      </main>
      <footer className="foot muted">
        <p>
          Your progress is saved in this browser only. Opening names and moves come from the{' '}
          <a href="https://github.com/lichess-org/chess-openings">Lichess openings dataset</a>; the
          engine is <a href="https://stockfishchess.org">Stockfish</a>; the board is{' '}
          <a href="https://github.com/lichess-org/chessground">Chessground</a>.
        </p>
      </footer>
    </div>
  )
}
