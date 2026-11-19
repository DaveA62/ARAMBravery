import { useEffect, useRef, useState } from 'react'
import { Copy, Link2 } from 'lucide-react'
import { copyText } from '../ui'
import { createManualAnswer, createManualOffer, type ManualOffer } from './manual'
import type { PartyLink } from './transport'
import './manual.css'

export type ManualRole = 'host' | 'guest'

type ManualConnectProps = {
  disabled?: boolean
  role?: ManualRole
  onLink(link: PartyLink, role: ManualRole): void
}

export function ManualConnect({ disabled = false, role: fixedRole, onLink }: ManualConnectProps) {
  const [choice, setChoice] = useState<ManualRole>('host')
  const role = fixedRole ?? choice
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const operation = useRef<AbortController>(null)
  const offer = useRef<ManualOffer>(null)
  const guestLink = useRef<PartyLink>(null)

  useEffect(() => () => {
    operation.current?.abort()
    offer.current?.link.close()
  }, [])

  function chooseRole(next: ManualRole) {
    if (next === role) return
    reset()
    setChoice(next)
  }

  function reset() {
    offer.current?.link.close()
    offer.current = null
    guestLink.current?.close()
    guestLink.current = null
    setInput('')
    setOutput('')
    setStatus('')
    setError('')
  }

  async function exchange() {
    if (disabled || operation.current) return
    const controller = new AbortController()
    operation.current = controller
    setBusy(true)
    setError('')
    setStatus('')
    try {
      if (role === 'guest') {
        const answer = await createManualAnswer(input, { signal: controller.signal })
        if (controller.signal.aborted) {
          answer.link.close()
          return
        }
        guestLink.current = answer.link
        setOutput(answer.code)
        setStatus('Send the answer back to the host.')
        onLink(answer.link, 'guest')
      } else if (offer.current) {
        await offer.current.acceptAnswer(input)
        const { link } = offer.current
        offer.current = null
        if (controller.signal.aborted) {
          link.close()
          return
        }
        setInput('')
        setOutput('')
        setStatus('Answer accepted. Establishing the direct connection.')
        onLink(link, 'host')
      } else {
        const created = await createManualOffer({ signal: controller.signal })
        if (controller.signal.aborted) {
          created.link.close()
          return
        }
        offer.current = created
        setOutput(created.code)
        setStatus('Send the offer to one player. Paste their answer below.')
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'The direct connection could not be started.')
      }
    } finally {
      if (operation.current === controller) operation.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  async function copyCode() {
    try {
      await copyText(output)
      setStatus(role === 'host' ? 'Offer copied. Send it to one player.' : 'Answer copied. Send it back to the host.')
    } catch {
      setStatus('Select the code and copy it manually.')
    }
  }

  const hasOffer = role === 'host' && !!output
  const needsInput = hasOffer || role === 'guest' && !output
  const readyToExchange = needsInput ? !!input.trim() : role === 'host'
  const outputLabel = role === 'host' ? 'Offer code' : 'Answer code'
  const action = role === 'guest' ? 'Generate answer' : hasOffer ? 'Accept answer' : 'Generate offer'

  return (
    <section className="manual-signaling" aria-label="Manual connection">
      {!fixedRole && (
        <div className="manual-actions" role="group" aria-label="Manual connection role">
          <button type="button" className="small-button" aria-pressed={role === 'host'}
            disabled={disabled || busy} onClick={() => chooseRole('host')}>Host</button>
          <button type="button" className="small-button" aria-pressed={role === 'guest'}
            disabled={disabled || busy} onClick={() => chooseRole('guest')}>Join</button>
        </div>
      )}
      <p>Exchange codes with a friend to connect directly.</p>
      {output && (
        <label className="manual-code">
          <span>{outputLabel}</span>
          <textarea value={output} readOnly spellCheck={false} onFocus={event => event.target.select()} />
        </label>
      )}
      {output && (
        <div className="manual-actions">
          <button type="button" className="small-button" onClick={() => void copyCode()}>
            <Copy size={14} aria-hidden="true" /> Copy {role === 'host' ? 'offer' : 'answer'}
          </button>
          <button type="button" className="small-button" disabled={busy} onClick={reset}>
            Discard {role === 'host' ? 'offer' : 'answer'}
          </button>
        </div>
      )}
      {needsInput && (
        <label className="manual-code">
          <span>{hasOffer ? 'Paste the guest’s answer' : 'Paste the host’s offer'}</span>
          <textarea value={input} maxLength={24_000} onChange={event => setInput(event.target.value)}
            spellCheck={false} autoCorrect="off" autoCapitalize="off" disabled={disabled || busy}
            placeholder={hasOffer ? 'MB1-A.…' : 'MB1-O.…'} />
        </label>
      )}
      {(role === 'host' || !output) && (
        <button type="button" className="small-button share-button manual-exchange"
          disabled={disabled || busy || !readyToExchange} onClick={() => void exchange()}>
          <Link2 size={14} aria-hidden="true" /> {busy ? 'Preparing connection…' : action}
        </button>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p className="manual-error" role="alert">{error}</p>}
    </section>
  )
}
