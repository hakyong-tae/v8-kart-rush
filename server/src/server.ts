// Drift Rush — Verse8(agent8) game server (gameserver-node convention).
//   빌드: gameserver-node build → server/dist/server.js → `bun x @agent8/deploy`.
//   런타임은 isolated-vm(타이머/네트워크/fs 없음). 서버는 릴레이 + 상태저장소일 뿐이고,
//   60Hz 권위 시뮬은 방장 클라이언트가 돌린다(호스트 권위 모델).
//
// ⚠️ gameserver-node의 $global.getCollectionItems는 { limit }만 받는다.
//    filters/orderBy/countCollectionItems가 없으므로, 리더보드/고스트의 필터·정렬·카운트는
//    전부 아래처럼 인메모리(JS)로 처리한다. (검증 출처: soldat-web/server/src/globals.d.ts)

const COURSE_IDS = ['sunny', 'beach', 'canyon', 'ice', 'neon'] as const
const RACE_MODES = ['speed', 'item'] as const
// 제출 기록(3랩 합계)의 상식적 경계 — 조작/오류 방어
const MIN_TOTAL_MS = 30 * 1000
const MAX_TOTAL_MS = 30 * 60 * 1000
// 리더보드/고스트 컬렉션은 코스당 하나 — 상위 랭킹만 의미 있으므로 넉넉히 당겨 JS에서 처리
const COL_FETCH_LIMIT = 1000

// ---- 방 브라우저(JetFall식 방목록) ----
const ROOM_CAP = 8
// 방장 하트비트(클라 5초 주기)가 이 시간 없으면 죽은 방 → 목록에서 숨김+삭제. 90초인 이유:
// 방장 탭이 백그라운드면 Chrome throttling이 타이머를 분당 1회까지 늦춰 20초면 산 방이 증발.
const ROOM_STALE_MS = 90000
const ROOM_COL = 'drift_rooms'

type CourseId = (typeof COURSE_IDS)[number]

export class Server {
  // ---------- misc ----------

  now(): number {
    return Date.now()
  }

  // ---------- rooms / multiplayer ----------

  async joinRace(roomId: string, pass?: string): Promise<void> {
    if (typeof roomId !== 'string' || roomId.length < 1 || roomId.length > 40) {
      throw new Error('invalid room id')
    }
    await $global.joinRoom(roomId)
    // 비번방이면 입장 후 roomState의 pass를 검증 — 틀리면 나가고 에러(pass는 목록에 노출 안 함).
    const state = await $room.getRoomState()
    const m = state.meta || {}
    if (m.locked && String(m.pass || '') !== String(pass || '')) {
      await $global.leaveRoom().catch(() => {})
      throw new Error('wrong password')
    }
    // 목록 인원수 즉시 갱신(기존 메타 보존) — 5초 하트비트 전에도 반영되게.
    const rooms = await $global.getCollectionItems(ROOM_COL, { limit: 100 }).catch(() => [])
    const existing = rooms.find((r: any) => r.key === roomId)
    if (existing) {
      await this._upsertRoom(roomId, {
        count: await this._count(),
        mode: existing.mode,
        variant: existing.variant,
        courseId: existing.courseId,
        hostNick: existing.hostNick,
        locked: existing.locked,
        started: existing.started,
      }).catch(() => {})
    }
  }

  async leaveRace(): Promise<string> {
    try {
      await $room.updateRoomState({ ['p_' + $sender.account]: null })
    } catch (e) {
      // not in a room — ignore
    }
    return await $global.leaveRoom()
  }

  async updatePlayer(info: any): Promise<any> {
    const safe = {
      nick: String(info && info.nick ? info.nick : 'Racer').slice(0, 15),
      color: String(info && info.color ? info.color : 'red').slice(0, 12),
      char: String(info && info.char ? info.char : 'moka').slice(0, 12),
      ready: !!(info && info.ready),
      joinedAt: Number((info && info.joinedAt) || Date.now()),
    }
    await $room.updateRoomState({ ['p_' + $sender.account]: safe })
    return safe
  }

  async setReady(ready: boolean): Promise<boolean> {
    const state = await $room.getRoomState()
    const key = 'p_' + $sender.account
    const prev = state[key] || { nick: 'Racer', color: 'red', joinedAt: Date.now() }
    await $room.updateRoomState({ [key]: { ...prev, ready: !!ready } })
    return true
  }

  async getRoomSnapshot(): Promise<any> {
    return await $room.getRoomState()
  }

  // ---------- room browser (JetFall-style: list + create + quick join) ----------

  // 방 인원 = roomState의 p_* 엔트리 수 (agent8 방 멤버 카운트 대용).
  async _count(): Promise<number> {
    const s = await $room.getRoomState()
    return Object.keys(s).filter((k) => k.indexOf('p_') === 0).length
  }

  // 우리 식별자(key)로 upsert. updateCollectionItem은 2인자(item.__id)만 갱신하므로
  // key로 기존 항목을 찾아 있으면 update(__id 유지), 없으면 add. (3인자 호출은 조용한 no-op 함정)
  async _upsertRoom(key: string, data: Record<string, unknown>): Promise<void> {
    const rooms = await $global.getCollectionItems(ROOM_COL, { limit: 100 }).catch(() => [])
    const existing = rooms.find((r: any) => r.key === key)
    const item = { ...(existing || {}), key, ...data, at: Date.now() }
    if (existing && existing.__id) await $global.updateCollectionItem(ROOM_COL, item)
    else await $global.addCollectionItem(ROOM_COL, item)
  }

  // 살아있는(하트비트 신선한) 방 목록. 유령 방은 best-effort 삭제, 같은 key 중복은 최신만.
  async listRooms(): Promise<any[]> {
    const rooms = await $global.getCollectionItems(ROOM_COL, { limit: 100 }).catch(() => [])
    const cutoff = Date.now() - ROOM_STALE_MS
    const fresh: any[] = []
    for (const r of rooms) {
      if ((r.at || 0) >= cutoff) fresh.push(r)
      else if (r.__id) $global.deleteCollectionItem(ROOM_COL, r.__id).catch(() => {})
    }
    const byKey = new Map<string, any>()
    for (const r of fresh) {
      const prev = byKey.get(r.key)
      if (!prev || (r.at || 0) > (prev.at || 0)) byKey.set(r.key, r)
    }
    return [...byKey.values()].map((r: any) => ({
      key: r.key,
      count: r.count || 0,
      cap: ROOM_CAP,
      mode: r.mode || 'item',
      variant: r.variant || 'ffa',
      courseId: r.courseId || 'sunny',
      hostNick: r.hostNick || 'Racer',
      locked: !!r.locked,
      started: !!r.started,
    }))
  }

  // 새 방 생성 → 고유 key(drN) 발급, agent8 방 입장, roomState.meta 시드 + 목록 등록.
  async createRoom(meta: any): Promise<{ roomId: string }> {
    const rooms = await $global.getCollectionItems(ROOM_COL, { limit: 100 }).catch(() => [])
    const have = new Set(rooms.map((r: any) => r.key))
    let n = 1
    while (have.has('dr' + n)) n++
    const key = 'dr' + n
    await $global.joinRoom(key)
    const mode = (RACE_MODES as readonly string[]).includes(meta?.mode) ? meta.mode : 'item'
    const courseId = (COURSE_IDS as readonly string[]).includes(meta?.courseId) ? meta.courseId : 'sunny'
    const variant = String(meta?.variant || 'ffa').slice(0, 8)
    const hostNick = String(meta?.hostNick || 'Racer').slice(0, 15)
    const locked = !!(meta?.pass && String(meta.pass).length > 0)
    const pass = locked ? String(meta.pass).slice(0, 20) : ''
    // 로비/난입자가 설정을 보도록 roomState.meta에 시드 (key 포함 → startRace/heartbeat가 참조)
    await $room.updateRoomState({
      meta: { key, mode, courseId, variant, host: $sender.account, hostNick, locked, pass },
    })
    await this._upsertRoom(key, {
      count: await this._count(),
      mode,
      variant,
      courseId,
      hostNick,
      locked,
      started: false,
    }).catch(() => {})
    return { roomId: key }
  }

  // 빠른 입장: 열린(안 잠긴·안 찬·시작 전) 방 중 하나, 없으면 새로 생성.
  async quickJoin(prefMode?: string, hostNick?: string): Promise<{ roomId: string }> {
    const rooms = await $global.getCollectionItems(ROOM_COL, { limit: 100 }).catch(() => [])
    const cutoff = Date.now() - ROOM_STALE_MS
    const open = rooms.filter(
      (r: any) => (r.at || 0) >= cutoff && !r.locked && (r.count || 0) < ROOM_CAP && !r.started,
    )
    const pick = open.find((r: any) => !prefMode || r.mode === prefMode) || open[0]
    if (pick) {
      await this.joinRace(pick.key)
      return { roomId: pick.key }
    }
    return await this.createRoom({ mode: prefMode || 'item', courseId: 'sunny', variant: 'ffa', hostNick })
  }

  // 방장 하트비트(5초 주기) — 인원수/started 갱신으로 목록 신선도 유지.
  async touchRoom(key: string, started: boolean): Promise<void> {
    if (typeof key !== 'string' || !key) return
    const s = await $room.getRoomState()
    const m = s.meta || {}
    await this._upsertRoom(key, {
      count: await this._count(),
      mode: m.mode || 'item',
      variant: m.variant || 'ffa',
      courseId: m.courseId || 'sunny',
      hostNick: m.hostNick || 'Racer',
      locked: !!m.locked,
      started: !!started,
    })
  }

  // 방장 = roomState의 플레이어 엔트리(p_*) 중 joinedAt이 가장 이른 사람.
  // ($users 같은 미문서 전역에 의존하지 않는다.)
  _hostAccount(state: any): string | null {
    let host: string | null = null
    let earliest = Infinity
    for (const k of Object.keys(state || {})) {
      if (k.indexOf('p_') !== 0) continue
      const p = state[k]
      if (!p) continue
      const ja = Number(p.joinedAt) || 0
      if (ja < earliest) {
        earliest = ja
        host = k.slice(2)
      }
    }
    return host
  }

  async startRace(courseId: string, raceMode: string): Promise<any> {
    if (!(COURSE_IDS as readonly string[]).includes(courseId)) throw new Error('invalid course')
    if (!(RACE_MODES as readonly string[]).includes(raceMode)) raceMode = 'item'
    const state = await $room.getRoomState()
    // 방장만 시작 가능 (방장을 못 특정하면 허용 — 1인/레이스 초기 상태)
    const host = this._hostAccount(state)
    if (host && host !== $sender.account) {
      throw new Error('only the host can start the race')
    }
    if (state.phase === 'racing') throw new Error('race already running')
    const raceId = (state.raceId || 0) + 1
    const update: Record<string, unknown> = {
      phase: 'racing',
      raceId: raceId,
      courseId: courseId,
      raceMode: raceMode,
      startAt: Date.now() + 4500, // 클라들이 이 서버 타임스탬프까지 카운트다운
    }
    // 이전 완주 기록 초기화
    for (const k of Object.keys(state)) {
      if (k.indexOf('fin_') === 0) update[k] = null
    }
    await $room.updateRoomState(update)
    $room.broadcastToRoom('start', {
      raceId: raceId,
      courseId: courseId,
      raceMode: raceMode,
      startAt: update.startAt,
    })
    return update
  }

  async finishRace(totalMs: number, bestLapMs: number): Promise<boolean> {
    if (typeof totalMs !== 'number' || typeof bestLapMs !== 'number') throw new Error('invalid time')
    const state = await $room.getRoomState()
    if (state.phase !== 'racing') return false
    await $room.updateRoomState({
      ['fin_' + $sender.account]: {
        raceId: state.raceId || 0,
        totalMs: Math.round(totalMs),
        bestLapMs: Math.round(bestLapMs),
        at: Date.now(),
      },
    })
    return true
  }

  async backToLobby(): Promise<boolean> {
    await $room.updateRoomState({ phase: 'lobby' })
    return true
  }

  // 고빈도 릴레이 — 상태 저장 없이 팬아웃만.
  updatePos(d: any): void {
    $room.broadcastToRoom('pos', {
      a: $sender.account,
      x: d.x,
      z: d.z,
      h: d.h,
      s: d.s,
      lap: d.lap,
      prog: d.prog,
      boost: d.boost ? 1 : 0,
      spin: d.spin ? 1 : 0,
      drift: d.drift || 0,
      st: d.st || 0,
    })
  }

  itemEvent(e: any): void {
    $room.broadcastToRoom('item', {
      a: $sender.account,
      kind: e.kind,
      id: e.id,
      boxId: e.boxId,
      x: e.x,
      z: e.z,
      trackPos: e.trackPos,
      lat: e.lat,
    })
  }

  // ---------- per-course leaderboard (Time Attack, lower total = better) ----------

  collectionFor(courseId: string): string {
    if (!(COURSE_IDS as readonly string[]).includes(courseId)) throw new Error('invalid course')
    return 'times_' + courseId
  }

  // 코스 컬렉션 전체를 당겨온다(정렬/필터 API가 없어 JS에서 처리).
  async _all(col: string): Promise<any[]> {
    return await $global.getCollectionItems(col, { limit: COL_FETCH_LIMIT }).catch(() => [])
  }

  // totalMs보다 빠른 기록 수 + 1 = 순위 (countCollectionItems 대체)
  _rankOf(all: any[], totalMs: number): number {
    let faster = 0
    for (const e of all) if (typeof e.totalMs === 'number' && e.totalMs < totalMs) faster++
    return faster + 1
  }

  async submitTime(
    courseId: string,
    totalMs: number,
    bestLapMs: number,
    nickname: string,
    color: string,
    ghost: any,
  ): Promise<any> {
    const col = this.collectionFor(courseId)
    if (
      typeof totalMs !== 'number' ||
      totalMs < MIN_TOTAL_MS ||
      totalMs > MAX_TOTAL_MS ||
      typeof bestLapMs !== 'number' ||
      bestLapMs <= 0 ||
      bestLapMs > totalMs
    ) {
      throw new Error('invalid time')
    }
    if (typeof nickname !== 'string' || nickname.length < 1 || nickname.length > 15) {
      throw new Error('nickname must be 1-15 chars')
    }

    const all = await this._all(col)
    const mine = all.filter((r) => r.account === $sender.account)
    const best = mine.length > 0 ? mine.slice().sort((a, b) => a.totalMs - b.totalMs)[0] : null

    if (best && best.totalMs <= totalMs) {
      return { updated: false, rank: this._rankOf(all, best.totalMs), bestMs: best.totalMs }
    }

    for (const e of mine) {
      if (e.__id) await $global.deleteCollectionItem(col, e.__id).catch(() => {})
    }
    await $global.addCollectionItem(col, {
      account: $sender.account,
      nickname: nickname,
      color: String(color || 'red').slice(0, 12),
      totalMs: Math.round(totalMs),
      bestLapMs: Math.round(bestLapMs),
      createdAt: Date.now(),
    })

    // 개인 최고기록의 리플레이 고스트 저장 (타임어택 '1위 고스트'용)
    if (
      ghost &&
      Array.isArray(ghost.samples) &&
      ghost.samples.length >= 3 &&
      ghost.samples.length <= 12000 &&
      typeof ghost.dt === 'number' &&
      ghost.dt >= 50 &&
      ghost.dt <= 500
    ) {
      const gcol = 'ghosts_' + courseId
      const oldGhosts = (await this._all(gcol)).filter((g) => g.account === $sender.account)
      for (const g of oldGhosts) {
        if (g.__id) await $global.deleteCollectionItem(gcol, g.__id).catch(() => {})
      }
      await $global.addCollectionItem(gcol, {
        account: $sender.account,
        dt: Math.round(ghost.dt),
        samples: ghost.samples.map(Number),
        kart: String(ghost.kart || 'red').slice(0, 12),
        char: String(ghost.char || 'moka').slice(0, 12),
        totalMs: Math.round(totalMs),
        createdAt: Date.now(),
      })
    }

    // 방금 넣은 기록 포함 재계산 (all엔 아직 없으니 totalMs 기준으로 rank 계산)
    return { updated: true, rank: this._rankOf(all, Math.round(totalMs)), bestMs: Math.round(totalMs) }
  }

  // 현재 코스 #1 기록 보유자의 고스트
  async getTopGhost(courseId: string): Promise<any> {
    const col = this.collectionFor(courseId)
    const all = await this._all(col)
    if (all.length === 0) return { ghost: null }
    const top = all.slice().sort((a, b) => a.totalMs - b.totalMs)[0]
    const ghosts = (await this._all('ghosts_' + courseId)).filter((g) => g.account === top.account)
    return {
      nickname: top.nickname,
      totalMs: top.totalMs,
      ghost: ghosts.length > 0 ? ghosts[0] : null,
    }
  }

  async getTopTimes(courseId: string): Promise<any[]> {
    const col = this.collectionFor(courseId)
    const all = await this._all(col)
    return all
      .slice()
      .sort((a, b) => a.totalMs - b.totalMs)
      .slice(0, 20)
  }

  async getMyBest(courseId: string): Promise<any> {
    const col = this.collectionFor(courseId)
    const all = await this._all(col)
    const mine = all.filter((r) => r.account === $sender.account)
    if (mine.length === 0) return { entry: null, rank: -1 }
    const best = mine.slice().sort((a, b) => a.totalMs - b.totalMs)[0]
    return { entry: best, rank: this._rankOf(all, best.totalMs) }
  }
}
