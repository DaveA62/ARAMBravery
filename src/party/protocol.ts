import { DATA_VERSION, items } from '../data'
import { GENERATOR_VERSION, type ChallengeConfig, type Mode } from '../domain'
import { isChallengeInput } from '../domain/challenge'
import { ITEM_SLOT_COUNT } from '../domain/itemLegality'

export const PARTY_VERSION = `5/${DATA_VERSION}/${GENERATOR_VERSION}`
export const MAX_PLAYERS = 5
export const RECONNECT_GRACE = 45_000
export const COUNTDOWN = 1_100
export const ROLL_LOCK = 5_200
export const PARTY_DRAFT_DURATION = 60_000
export const PAGES_URL = 'https://davea62.github.io/ARAMBravery/'
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const itemIds = new Set(items.map(item => item.id))
const codePattern = new RegExp(`^[${alphabet}]{6}$`)

export const normalizeCode = (value: string) => value.trim().toUpperCase()
export const validCode = (value: string) => codePattern.test(normalizeCode(value))

export function generateCode(randomBytes = crypto.getRandomValues(new Uint8Array(6))) {
  return Array.from(randomBytes.slice(0, 6), number => alphabet[number & 31]).join('')
}

export function partyPeerId(code: string) {
  if (!validCode(code)) throw new Error('Enter a valid six-character party code.')
  return `arambravery-mayhem-party-v1-${normalizeCode(code).toLowerCase()}`
}

export function partyInvite(code: string, base = import.meta.env.PROD ? PAGES_URL : location.href) {
  const url = new URL(base)
  url.search = ''
  url.hash = ''
  url.searchParams.set('party', normalizeCode(code))
  return url.toString()
}

export function normalizeNickname(value: string) {
  return value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}<>]/gu, '').replace(/\s+/g, ' ').trim()
}

export function validNickname(value: string) {
  const count = Array.from(normalizeNickname(value)).length
  return count >= 2 && count <= 20
}

export type Allowance = 0 | 1 | 2 | 3 | 5 | null
export type PartyRules = { mode: Mode; allowance: Allowance; friendlyFire?: boolean; uniqueMayhem?: boolean }
export type PartyPlayer = {
  id: string
  nickname: string
  championId?: string
  ready: boolean
  connected: boolean
}
export type PartyBuild = {
  nickname: string
  config: ChallengeConfig
  remaining: number | null
  used: number
  itemIds?: string[]
  lockedItemSlots?: number[]
  lastReroll?: { index: number; requestId: string; vetoBy?: string }
}
export type PartyRound = {
  id: string
  startsAt: number
  unlockAt: number
  draftEndsAt: number
  builds: Record<string, PartyBuild>
  vetoedBy?: string[]
}
export type PartySnapshot = {
  code: string
  revision: number
  hostId: string
  rules: PartyRules
  players: PartyPlayer[]
  round: PartyRound | null
  activity: { id: number; text: string }[]
}
export type PartyAction =
  | { type: 'nickname'; nickname: string }
  | { type: 'champion'; championId?: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'settings'; rules: PartyRules }
  | { type: 'roll' }
  | { type: 'reroll'; index: number; roundId: string; requestId: string }
  | { type: 'veto'; targetId: string; index: number; itemId: string; roundId: string; requestId: string }
  | { type: 'next'; roundId: string }

export type ClientMessage =
  | { type: 'hello'; version: string; nickname: string; token: string; expectedHost?: string }
  | { type: 'action'; id: string; action: PartyAction }
  | { type: 'ping'; sentAt: number }
  | { type: 'leave' }

export type HostMessage =
  | { type: 'welcome'; version: string; playerId: string; snapshot: PartySnapshot; now: number }
  | { type: 'snapshot'; snapshot: PartySnapshot; now: number }
  | { type: 'pong'; sentAt: number; now: number }
  | { type: 'error'; message: string; requestId?: string; fatal?: boolean }
  | { type: 'ended'; message: string }

export function acceptSnapshot(current: PartySnapshot | null, incoming: PartySnapshot) {
  if (current && (incoming.code !== current.code || incoming.hostId !== current.hostId || incoming.revision <= current.revision)) return current
  return incoming
}

export type PartyMessage = ClientMessage | HostMessage

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, limit = 128): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= limit
}

function timestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function allowance(value: unknown): value is Allowance {
  return value === null || value === 0 || value === 1 || value === 2 || value === 3 || value === 5
}

export function isPartyRules(value: unknown): value is PartyRules {
  return object(value) && (value.mode === 'little' || value.mode === 'straight') && allowance(value.allowance) &&
    (value.friendlyFire === undefined || typeof value.friendlyFire === 'boolean') &&
    (value.uniqueMayhem === undefined || typeof value.uniqueMayhem === 'boolean')
}

function slotIndex(value: unknown): value is number {
  return integer(value) && value < ITEM_SLOT_COUNT
}

function action(value: unknown): value is PartyAction {
  if (!object(value)) return false
  switch (value.type) {
    case 'nickname': return text(value.nickname)
    case 'champion': return value.championId === undefined || text(value.championId, 40)
    case 'ready': return typeof value.ready === 'boolean'
    case 'settings': return isPartyRules(value.rules)
    case 'roll': return true
    case 'reroll': return slotIndex(value.index) && text(value.roundId) && text(value.requestId)
    case 'veto': return slotIndex(value.index) && text(value.roundId) && text(value.requestId) &&
      text(value.targetId) && text(value.itemId, 40)
    case 'next': return text(value.roundId)
    default: return false
  }
}

export function parseClientMessage(value: unknown): ClientMessage | null {
  if (!object(value)) return null
  switch (value.type) {
    case 'hello':
      return text(value.version) && text(value.nickname) && text(value.token) &&
        (value.expectedHost === undefined || text(value.expectedHost)) ? value as ClientMessage : null
    case 'ping': return timestamp(value.sentAt) ? value as ClientMessage : null
    case 'action': return text(value.id) && action(value.action) ? value as ClientMessage : null
    case 'leave': return value as ClientMessage
    default: return null
  }
}

function player(value: unknown): value is PartyPlayer {
  return object(value) && text(value.id) && typeof value.nickname === 'string' && validNickname(value.nickname) &&
    (value.championId === undefined || text(value.championId, 40)) &&
    typeof value.ready === 'boolean' && typeof value.connected === 'boolean'
}

function build(value: unknown): value is PartyBuild {
  return object(value) && text(value.nickname) && validNickname(value.nickname) && isChallengeInput(value.config) && Array.isArray(value.config.rerolls) &&
    (value.remaining === null || (integer(value.remaining) && value.remaining <= 5)) && integer(value.used) &&
    (value.itemIds === undefined || (Array.isArray(value.itemIds) && value.itemIds.length === ITEM_SLOT_COUNT &&
      value.itemIds.every(id => typeof id === 'string' && itemIds.has(id)) && new Set(value.itemIds).size === ITEM_SLOT_COUNT)) &&
    (value.lockedItemSlots === undefined || (Array.isArray(value.lockedItemSlots) && value.lockedItemSlots.length <= 6 &&
      value.lockedItemSlots.every(slotIndex) && new Set(value.lockedItemSlots).size === value.lockedItemSlots.length)) &&
    (value.lastReroll === undefined || (object(value.lastReroll) && slotIndex(value.lastReroll.index) &&
      text(value.lastReroll.requestId) && (value.lastReroll.vetoBy === undefined ||
        (text(value.lastReroll.vetoBy) && validNickname(value.lastReroll.vetoBy)))))
}

function round(value: unknown, uniqueMayhem: boolean): value is PartyRound {
  if (!object(value) || !text(value.id) || !timestamp(value.startsAt) || !timestamp(value.unlockAt) ||
      value.unlockAt < value.startsAt || !timestamp(value.draftEndsAt) ||
      value.draftEndsAt - value.unlockAt !== PARTY_DRAFT_DURATION || !object(value.builds)) return false

  const builds = Object.values(value.builds)
  if (builds.length > MAX_PLAYERS || !builds.every(build)) return false
  if (uniqueMayhem) {
    const assigned = builds.flatMap(({ itemIds }) => itemIds ?? [])
    if (assigned.length !== builds.length * ITEM_SLOT_COUNT || new Set(assigned).size !== assigned.length) return false
  } else if (builds.some(({ itemIds }) => itemIds !== undefined)) {
    return false
  }
  return value.vetoedBy === undefined || (Array.isArray(value.vetoedBy) && value.vetoedBy.length <= MAX_PLAYERS &&
    value.vetoedBy.every(id => text(id) && Object.hasOwn(value.builds as object, id)) &&
    new Set(value.vetoedBy).size === value.vetoedBy.length)
}

function snapshot(value: unknown): value is PartySnapshot {
  return object(value) && typeof value.code === 'string' && validCode(value.code) &&
    integer(value.revision) && text(value.hostId) && isPartyRules(value.rules) &&
    Array.isArray(value.players) && value.players.length <= MAX_PLAYERS &&
    value.players.every(player) && value.players.some(member => member.id === value.hostId) &&
    (value.round === null || round(value.round, Boolean(value.rules.uniqueMayhem))) &&
    Array.isArray(value.activity) && value.activity.length <= 100 &&
    value.activity.every(entry => object(entry) && integer(entry.id) && text(entry.text, 240))
}

export function parseHostMessage(value: unknown): HostMessage | null {
  if (!object(value)) return null
  switch (value.type) {
    case 'welcome':
      return text(value.version) && text(value.playerId) && snapshot(value.snapshot) && timestamp(value.now)
        ? value as HostMessage : null
    case 'snapshot': return snapshot(value.snapshot) && timestamp(value.now) ? value as HostMessage : null
    case 'pong': return timestamp(value.sentAt) && timestamp(value.now) ? value as HostMessage : null
    case 'error': return text(value.message, 240) && (value.requestId === undefined || text(value.requestId)) &&
      (value.fatal === undefined || typeof value.fatal === 'boolean') ? value as HostMessage : null
    case 'ended': return text(value.message, 240) ? value as HostMessage : null
    default: return null
  }
}
