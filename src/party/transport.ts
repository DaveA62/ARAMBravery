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
