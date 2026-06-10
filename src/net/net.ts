import { GameServer } from '@agent8/gameserver'

export type NetStatus = 'offline' | 'connecting' | 'online'

export interface LeaderboardEntry {
  account: string
  nickname: string
  totalMs: number
  bestLapMs: number
  color?: string
  createdAt: number
  __id?: string
}

export interface PosMsg {
  a: string
  x: number
  z: number
  h: number // heading
  s: number // speed
  lap: number
  prog: number
  boost: 0 | 1
  spin: 0 | 1
  drift: number // -1|0|1
}

export interface ItemMsg {
  a: string
  kind: 'trap' | 'missile' | 'boxTaken' | 'trapHit' | 'missileHit' | 'lightning'
  id?: string
  boxId?: number
  x?: number
  z?: number
  trackPos?: number
  lat?: number
}

export interface PlayerInfo {
  nick: string
  color: string // kart id
  char: string // character id
  ready: boolean
  joinedAt: number
}

export interface RoomSnapshot {
  roomId: string
  users: string[]
  host: string | null
  phase: 'lobby' | 'racing'
  raceId: number
  startAt: number
  courseId: string
  raceMode: 'speed' | 'item'
  players: Record<string, PlayerInfo>
  finishes: Record<string, { raceId: number; totalMs: number; bestLapMs: number; at: number }>
}

function parseRoomState(state: any): RoomSnapshot {
  const players: RoomSnapshot['players'] = {}
  const finishes: RoomSnapshot['finishes'] = {}
  for (const k of Object.keys(state ?? {})) {
    if (k.startsWith('p_') && state[k]) players[k.slice(2)] = state[k]
    if (k.startsWith('fin_') && state[k]) finishes[k.slice(4)] = state[k]
  }
  const users: string[] = state?.$users ?? []
  return {
    roomId: state?.roomId ?? '',
    users,
    host: users[0] ?? null,
    phase: state?.phase === 'racing' ? 'racing' : 'lobby',
    raceId: state?.raceId ?? 0,
    startAt: state?.startAt ?? 0,
    courseId: state?.courseId ?? 'sunny',
    raceMode: state?.raceMode === 'speed' ? 'speed' : 'item',
    players,
    finishes,
  }
}

const LS_LB = (course: string) => `v8kart_lb_${course}`
const LS_NICK = 'v8kart_nick'
const LS_COLOR = 'v8kart_color'

class Net {
  server: GameServer | null = null
  status: NetStatus = 'connecting'
  account = ''
  clockOffset = 0 // serverNow ≈ Date.now() + clockOffset
  roomId: string | null = null
  private unsubs: (() => void)[] = []

  get nickname(): string {
    return localStorage.getItem(LS_NICK) || ''
  }
  set nickname(v: string) {
    localStorage.setItem(LS_NICK, v.slice(0, 15))
  }
  get color(): string {
    return localStorage.getItem(LS_COLOR) || 'red'
  }
  set color(v: string) {
    localStorage.setItem(LS_COLOR, v)
  }
  get character(): string {
    return localStorage.getItem('v8kart_char') || 'moka'
  }
  set character(v: string) {
    localStorage.setItem('v8kart_char', v)
  }

  serverNow(): number {
    return Date.now() + this.clockOffset
  }

  private initPromise: Promise<NetStatus> | null = null

  init(): Promise<NetStatus> {
    if (!this.initPromise) this.initPromise = this.doInit()
    return this.initPromise
  }

  private async doInit(): Promise<NetStatus> {
    this.status = 'connecting'
    try {
      const server = GameServer.getInstance()
      const ok = await Promise.race<boolean>([
        server.connect(),
        new Promise<boolean>((r) => setTimeout(() => r(false), 7000)),
      ])
      if (!ok && !server.connected) throw new Error('connect failed')
      // verify our server.js is actually deployed by calling now()
      const t0 = Date.now()
      const serverTime = await Promise.race<number>([
        server.remoteFunction('now', []),
        new Promise<number>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
      ])
      const rtt = Date.now() - t0
      if (typeof serverTime !== 'number') throw new Error('bad now()')
      this.clockOffset = serverTime + rtt / 2 - Date.now()
      this.server = server
      this.account = server.account
      this.status = 'online'
    } catch (e) {
      console.warn('[net] running in OFFLINE mode:', e)
      try {
        await GameServer.getInstance().disconnect()
      } catch {}
      this.server = null
      this.account = 'local'
      this.status = 'offline'
    }
    return this.status
  }

  // ---------- leaderboard ----------

  async submitTime(
    courseId: string,
    totalMs: number,
    bestLapMs: number,
  ): Promise<{ updated: boolean; rank: number }> {
    const nickname = this.nickname || 'Racer'
    if (this.server) {
      const res = await this.server.remoteFunction('submitTime', [
        courseId,
        Math.round(totalMs),
        Math.round(bestLapMs),
        nickname,
        this.color,
      ])
      return { updated: !!res?.updated, rank: res?.rank ?? -1 }
    }
    // offline: localStorage
    const list: LeaderboardEntry[] = JSON.parse(localStorage.getItem(LS_LB(courseId)) || '[]')
    const mine = list.find((e) => e.account === 'local')
    let updated = false
    if (!mine || totalMs < mine.totalMs) {
      const next = list.filter((e) => e.account !== 'local')
      next.push({
        account: 'local',
        nickname,
        totalMs: Math.round(totalMs),
        bestLapMs: Math.round(bestLapMs),
        color: this.color,
        createdAt: Date.now(),
      })
      next.sort((a, b) => a.totalMs - b.totalMs)
      localStorage.setItem(LS_LB(courseId), JSON.stringify(next.slice(0, 20)))
      updated = true
    }
    const fresh: LeaderboardEntry[] = JSON.parse(localStorage.getItem(LS_LB(courseId)) || '[]')
    const rank = fresh.findIndex((e) => e.account === 'local') + 1
    return { updated, rank }
  }

  async getTopTimes(courseId: string): Promise<LeaderboardEntry[]> {
    if (this.server) {
      try {
        const items = await this.server.remoteFunction('getTopTimes', [courseId])
        return Array.isArray(items) ? items : []
      } catch (e) {
        console.warn('[net] getTopTimes failed', e)
        return []
      }
    }
    return JSON.parse(localStorage.getItem(LS_LB(courseId)) || '[]')
  }

  // ---------- rooms ----------

  async joinRoom(roomId: string): Promise<RoomSnapshot> {
    if (!this.server) throw new Error('offline')
    await this.server.remoteFunction('joinRace', [roomId])
    this.roomId = roomId
    await this.server.remoteFunction('updatePlayer', [
      {
        nick: this.nickname || 'Racer',
        color: this.color,
        char: this.character,
        ready: false,
        joinedAt: Date.now(),
      },
    ])
    const state = await this.server.remoteFunction('getRoomSnapshot', [])
    return parseRoomState(state)
  }

  async leaveRoom() {
    this.unsubs.forEach((u) => u())
    this.unsubs = []
    if (this.server && this.roomId) {
      try {
        await this.server.remoteFunction('leaveRace', [])
      } catch {}
    }
    this.roomId = null
  }

  onRoomState(cb: (snap: RoomSnapshot) => void): () => void {
    if (!this.server || !this.roomId) return () => {}
    const u = this.server.subscribeRoomState(this.roomId, (state) => cb(parseRoomState(state)))
    this.unsubs.push(u)
    return u
  }

  onPos(cb: (msg: PosMsg) => void): () => void {
    if (!this.server || !this.roomId) return () => {}
    const u = this.server.onRoomMessage(this.roomId, 'pos', cb)
    this.unsubs.push(u)
    return u
  }

  onItem(cb: (msg: ItemMsg) => void): () => void {
    if (!this.server || !this.roomId) return () => {}
    const u = this.server.onRoomMessage(this.roomId, 'item', cb)
    this.unsubs.push(u)
    return u
  }

  setReady(ready: boolean) {
    this.server
      ?.remoteFunction('setReady', [ready], { needResponse: false })
      .catch(() => {})
  }

  startRace(courseId: string, raceMode: 'speed' | 'item') {
    return this.server?.remoteFunction('startRace', [courseId, raceMode])
  }

  finishRace(totalMs: number, bestLapMs: number) {
    this.server
      ?.remoteFunction('finishRace', [Math.round(totalMs), Math.round(bestLapMs)], {
        needResponse: false,
      })
      .catch(() => {})
  }

  backToLobby() {
    return this.server?.remoteFunction('backToLobby', [])
  }

  sendPos(d: Omit<PosMsg, 'a'>) {
    this.server
      ?.remoteFunction('updatePos', [d], { throttle: 100, needResponse: false })
      .catch(() => {})
  }

  sendItem(e: Omit<ItemMsg, 'a'>) {
    this.server?.remoteFunction('itemEvent', [e], { needResponse: false }).catch(() => {})
  }
}

export const net = new Net()
