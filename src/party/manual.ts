import type { PartyMessage } from './protocol'
import { receivePartyMessage, sendPartyMessage, type PartyLink } from './transport'

type PartyHandlers = Parameters<PartyLink['subscribe']>[0]
type DescriptionType = 'offer' | 'answer'

const CHANNEL = 'mayhem-party'
const CODE_PREFIX = 'MB1'
const MAX_CODE_LENGTH = 24_000
const MAX_MESSAGE_LENGTH = 65_536
const GATHER_TIMEOUT = 12_000
const STUN_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

export type ManualOptions = { signal?: AbortSignal; iceServers?: RTCIceServer[] }
export type ManualAnswer = { code: string; link: PartyLink }
export type ManualOffer = ManualAnswer & { acceptAnswer(code: string): Promise<void> }

function encodeDescription(type: DescriptionType, sdp: string) {
  const bytes = new TextEncoder().encode(sdp)
  const data = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  return `${CODE_PREFIX}-${type === 'offer' ? 'O' : 'A'}.${data}`
}

function decodeDescription(code: string, type: DescriptionType): RTCSessionDescriptionInit {
  const prefix = `${CODE_PREFIX}-${type === 'offer' ? 'O' : 'A'}.`
  const value = code.replace(/\s/g, '')
  const data = value.slice(prefix.length)
  const invalid = () => new Error(`Paste the complete ${type} code.`)
  if (!value.startsWith(prefix) || value.length > MAX_CODE_LENGTH || !/^[A-Za-z0-9_-]+$/.test(data)) throw invalid()

  let sdp: string
  try {
    const bytes = Uint8Array.from(atob(data.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))
    sdp = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw invalid()
  }
  if (!/^v=0\r?\n/.test(sdp) || !/^m=application .+webrtc-datachannel\r?$/m.test(sdp) ||
      /^m=(audio|video) /m.test(sdp) || !hasCandidate(sdp)) throw invalid()
  return { type, sdp }
}

function hasCandidate(sdp: string) {
  return /^a=candidate:/m.test(sdp)
}

function gatheredDescription(peer: RTCPeerConnection, type: DescriptionType, signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(finish, GATHER_TIMEOUT)

    function cleanup() {
      window.clearTimeout(timeout)
      peer.removeEventListener('icegatheringstatechange', onGatheringChange)
      signal?.removeEventListener('abort', abort)
    }

    function finish() {
      cleanup()
      const { localDescription } = peer
      if (localDescription?.type !== type || !hasCandidate(localDescription.sdp)) {
        reject(new Error('This browser could not gather a direct connection route. Try again or use the same network.'))
        return
      }
      resolve(encodeDescription(type, localDescription.sdp))
    }

    function abort() {
      cleanup()
      reject(new DOMException('Manual connection canceled.', 'AbortError'))
    }

    function onGatheringChange() {
      if (peer.iceGatheringState === 'complete') finish()
    }

    if (signal?.aborted) {
      abort()
      return
    }
    signal?.addEventListener('abort', abort, { once: true })
    peer.addEventListener('icegatheringstatechange', onGatheringChange)
    onGatheringChange()
  })
}

function createPeer(options?: ManualOptions) {
  options?.signal?.throwIfAborted()
  if (typeof RTCPeerConnection === 'undefined') throw new Error('This browser does not support direct party connections.')
  return new RTCPeerConnection({ iceServers: options?.iceServers ?? STUN_SERVERS })
}

class NativePartyLink implements PartyLink {
  private channel?: RTCDataChannel
  private closed = false
  private readonly listeners = new Set<PartyHandlers>()
  private readonly pending: unknown[] = []
  private readonly peer: RTCPeerConnection

  constructor(peer: RTCPeerConnection) {
    this.peer = peer
    peer.addEventListener('connectionstatechange', this.onConnectionState)
    peer.addEventListener('datachannel', this.onRemoteChannel)
  }

  get open() {
    return !this.closed && this.channel?.readyState === 'open'
  }

  attachChannel(channel: RTCDataChannel) {
    if (this.closed || this.channel || channel.label !== CHANNEL) {
      channel.close()
      return
    }
    this.channel = channel
    channel.addEventListener('open', this.onOpen)
    channel.addEventListener('close', this.onChannelClose)
    channel.addEventListener('message', this.onMessage)
    channel.addEventListener('error', this.onChannelError)
  }

  send(message: PartyMessage) {
    if (this.open) sendPartyMessage(message, frame => this.channel?.send(JSON.stringify(frame)))
  }

  subscribe(handlers: PartyHandlers) {
    this.listeners.add(handlers)
    if (this.open || this.closed || this.pending.length) {
      queueMicrotask(() => {
        if (!this.listeners.has(handlers)) return
        if (this.open) handlers.open()
        if (this.closed) {
          handlers.close()
          return
        }
        for (const message of this.pending.splice(0)) handlers.message(message)
      })
    }
    return () => { this.listeners.delete(handlers) }
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.peer.removeEventListener('connectionstatechange', this.onConnectionState)
    this.peer.removeEventListener('datachannel', this.onRemoteChannel)
    const { channel } = this
    if (channel) {
      channel.removeEventListener('open', this.onOpen)
      channel.removeEventListener('close', this.onChannelClose)
      channel.removeEventListener('message', this.onMessage)
      channel.removeEventListener('error', this.onChannelError)
      channel.close()
    }
    this.peer.close()
    this.pending.length = 0
    const listeners = [...this.listeners]
    this.listeners.clear()
    for (const handlers of listeners) handlers.close()
  }

  private readonly onConnectionState = () => {
    if (this.peer.connectionState === 'failed') {
      for (const handlers of this.listeners) {
        handlers.error(new Error('A direct connection could not be made. Try the same network.'))
      }
      this.close()
    }
  }

  private readonly onRemoteChannel = (event: RTCDataChannelEvent) => {
    this.attachChannel(event.channel)
  }

  private readonly onOpen = () => {
    for (const handlers of this.listeners) handlers.open()
  }

  private readonly onChannelClose = () => {
    this.close()
  }

  private readonly onChannelError = () => {
    for (const handlers of this.listeners) handlers.error(new Error('The manual data channel failed.'))
    this.close()
  }

  private readonly onMessage = (event: MessageEvent) => {
    if (typeof event.data !== 'string' || event.data.length > MAX_MESSAGE_LENGTH) return
    let message: unknown
    try { message = JSON.parse(event.data) } catch { return }
    this.receive(message)
  }

  private readonly receive = receivePartyMessage(message => {
    // A LAN peer can greet us while the pasted answer is being handed to the lobby.
    if (!this.listeners.size && this.pending.length < 8) this.pending.push(message)
    for (const handlers of this.listeners) handlers.message(message)
  })
}

export async function createManualOffer(options?: ManualOptions): Promise<ManualOffer> {
  const peer = createPeer(options)
  const link = new NativePartyLink(peer)
  try {
    link.attachChannel(peer.createDataChannel(CHANNEL, { ordered: true }))
    await peer.setLocalDescription(await peer.createOffer())
    const code = await gatheredDescription(peer, 'offer', options?.signal)
    return {
      code,
      link,
      async acceptAnswer(answer) {
        await peer.setRemoteDescription(decodeDescription(answer, 'answer'))
      },
    }
  } catch (error) {
    link.close()
    throw error
  }
}

export async function createManualAnswer(offer: string, options?: ManualOptions): Promise<ManualAnswer> {
  const description = decodeDescription(offer, 'offer')
  const peer = createPeer(options)
  const link = new NativePartyLink(peer)
  try {
    await peer.setRemoteDescription(description)
    await peer.setLocalDescription(await peer.createAnswer())
    const code = await gatheredDescription(peer, 'answer', options?.signal)
    return { code, link }
  } catch (error) {
    link.close()
    throw error
  }
}
