import type { PartyMessage } from './protocol'

export interface PartyLinkHandlers {
  open: () => void
  message: (payload: unknown) => void
  close: () => void
  error: (error: Error) => void
}

export interface PartyLink {
  readonly open: boolean
  send: (message: PartyMessage) => void
  close: () => void
  subscribe: (handlers: PartyLinkHandlers) => () => void
}

// PeerJS's JSON serializer and native data channels both limit individual packets.
const FRAME_LENGTH = 4096
const MAX_MESSAGE_LENGTH = 2_000_000
type Segment = ['party-segment', number, string, boolean]

export function sendPartyMessage(message: PartyMessage, send: (frame: PartyMessage | Segment) => void) {
  const serialized = JSON.stringify(message)
  if (serialized.length <= FRAME_LENGTH) {
    send(message)
    return
  }
  if (serialized.length > MAX_MESSAGE_LENGTH) throw new Error('The party snapshot exceeds the transmission limit.')
  for (let offset = 0; offset < serialized.length; offset += FRAME_LENGTH) {
    const end = offset + FRAME_LENGTH
    send(['party-segment', offset, serialized.slice(offset, end), end >= serialized.length])
  }
}

export function receivePartyMessage(complete: (message: unknown) => void) {
  let partial = ''
  return (frame: unknown) => {
    if (!Array.isArray(frame)) {
      partial = ''
      complete(frame)
      return
    }

    const [type, offset, text, last] = frame as unknown[]
    if (offset === 0) partial = ''
    if (type !== 'party-segment' || offset !== partial.length || typeof text !== 'string' ||
        !text.length || text.length > FRAME_LENGTH || partial.length + text.length > MAX_MESSAGE_LENGTH ||
        typeof last !== 'boolean' || (!last && text.length !== FRAME_LENGTH)) {
      partial = ''
      return
    }
    partial += text
    if (!last) return
    const packet = partial
    partial = ''
    let message: unknown
    try { message = JSON.parse(packet) } catch { return }
    complete(message)
  }
}
