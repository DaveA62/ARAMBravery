import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { champions, type Champion } from './data'

export function useReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setReduced(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return reduced
}

export function Art({ src, className, alt = '', lazy = false }: {
  src?: string
  className?: string
  alt?: string
  lazy?: boolean
}) {
  const [failed, setFailed] = useState<string>()
  return src && src !== failed
    ? <img className={className} src={src} alt={alt} decoding="async" loading={lazy ? 'lazy' : undefined} onError={() => setFailed(src)} />
    : <span className={className ? className + ' art-fallback' : 'art-fallback'} aria-label={alt || undefined}>✧</span>
}

export function Modal({ title, children, onClose, wide }: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog ref={ref} className={'modal' + (wide ? ' modal--wide' : '')} aria-labelledby="modal-title"
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal-inner">
        <header className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
        </header>
        {children}
      </div>
    </dialog>
  )
}

export function ChampionPicker({ selected, onSelect }: { selected?: string; onSelect: (champion: Champion) => void }) {
  const [search, setSearch] = useState('')
  const query = search.toLocaleLowerCase().trim()
  const filtered = champions.filter(({ name, roles }) => [name, ...roles].some(value => value.toLowerCase().includes(query)))

  return (
    <>
      <label className="champion-search">
        <Search size={18} />
        <input type="search" autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="Search champions or roles" />
      </label>
      <div className="champion-grid">
        {filtered.map(champion => (
          <button key={champion.id} type="button" className="champion-option" aria-pressed={selected === champion.id} onClick={() => onSelect(champion)}>
            <div><Art src={champion.portrait} lazy /></div>
            <strong>{champion.name}</strong>
            <small>{champion.roles.join(' / ')}</small>
          </button>
        ))}
        {!filtered.length && <p className="quiet">No champions match your search.</p>}
      </div>
    </>
  )
}

export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const input = document.createElement('textarea')
  input.value = text
  input.style.position = 'fixed'
  input.style.opacity = '0'
  const container = document.querySelector('dialog[open]') ?? document.body
  const previous = document.activeElement
  container.append(input)
  input.select()
  try {
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable')
  } finally {
    input.remove()
    if (previous instanceof HTMLElement) previous.focus()
  }
}
