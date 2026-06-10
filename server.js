// V8 Kart Rush — Verse8 game server
// Deployed with: npx -y @agent8/deploy
// Conventions: define the class only (no exports), no setTimeout/setInterval.

const COURSE_IDS = ['sunny', 'neon', 'canyon']
// sanity bounds for submitted race times (3 laps)
const MIN_TOTAL_MS = 30 * 1000
const MAX_TOTAL_MS = 30 * 60 * 1000

class Server {
  // ---------- misc ----------

  now() {
    return Date.now()
  }

  // ---------- rooms / multiplayer ----------

  async joinRace(roomId) {
    if (typeof roomId !== 'string' || roomId.length < 1 || roomId.length > 40) {
      throw new Error('invalid room id')
    }
    return await $global.joinRoom(roomId)
  }

  async leaveRace() {
    try {
      await $room.updateRoomState({ ['p_' + $sender.account]: null })
    } catch (e) {
      // not in a room — ignore
    }
    return await $global.leaveRoom()
  }

  async updatePlayer(info) {
    const safe = {
      nick: String(info && info.nick ? info.nick : 'Racer').slice(0, 15),
      color: String(info && info.color ? info.color : 'red').slice(0, 12),
      ready: !!(info && info.ready),
      joinedAt: Number((info && info.joinedAt) || Date.now()),
    }
    await $room.updateRoomState({ ['p_' + $sender.account]: safe })
    return safe
  }

  async setReady(ready) {
    const state = await $room.getRoomState()
    const key = 'p_' + $sender.account
    const prev = state[key] || { nick: 'Racer', color: 'red', joinedAt: Date.now() }
    await $room.updateRoomState({ [key]: { ...prev, ready: !!ready } })
    return true
  }

  async getRoomSnapshot() {
    return await $room.getRoomState()
  }

  async startRace(courseId) {
    if (!COURSE_IDS.includes(courseId)) throw new Error('invalid course')
    const state = await $room.getRoomState()
    const users = state.$users || []
    // only the host (first user in the room) can start
    if (users.length > 0 && users[0] !== $sender.account) {
      throw new Error('only the host can start the race')
    }
    if (state.phase === 'racing') throw new Error('race already running')
    const raceId = (state.raceId || 0) + 1
    const update = {
      phase: 'racing',
      raceId: raceId,
      courseId: courseId,
      startAt: Date.now() + 4500, // clients count down to this server timestamp
    }
    // clear previous finish records
    for (const k of Object.keys(state)) {
      if (k.indexOf('fin_') === 0) update[k] = null
    }
    await $room.updateRoomState(update)
    await $room.broadcastToRoom('start', { raceId: raceId, courseId: courseId, startAt: update.startAt })
    return update
  }

  async finishRace(totalMs, bestLapMs) {
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

  async backToLobby() {
    await $room.updateRoomState({ phase: 'lobby' })
    return true
  }

  // High-frequency relays — no state writes, just fan-out.
  updatePos(d) {
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
    })
  }

  itemEvent(e) {
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

  collectionFor(courseId) {
    if (!COURSE_IDS.includes(courseId)) throw new Error('invalid course')
    return 'times_' + courseId
  }

  async submitTime(courseId, totalMs, bestLapMs, nickname, color) {
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

    const mine = await $global.getCollectionItems(col, {
      filters: [{ field: 'account', operator: '==', value: $sender.account }],
    })
    const best = mine.length > 0 ? mine.sort((a, b) => a.totalMs - b.totalMs)[0] : null

    if (best && best.totalMs <= totalMs) {
      const rank = await this.rankOf(col, best.totalMs)
      return { updated: false, rank: rank, bestMs: best.totalMs }
    }

    for (const e of mine) {
      await $global.deleteCollectionItem(col, e.__id)
    }
    await $global.addCollectionItem(col, {
      account: $sender.account,
      nickname: nickname,
      color: String(color || 'red').slice(0, 12),
      totalMs: Math.round(totalMs),
      bestLapMs: Math.round(bestLapMs),
      createdAt: Date.now(),
    })
    const rank = await this.rankOf(col, totalMs)
    return { updated: true, rank: rank, bestMs: Math.round(totalMs) }
  }

  async rankOf(col, totalMs) {
    const faster = await $global.countCollectionItems(col, {
      filters: [{ field: 'totalMs', operator: '<', value: totalMs }],
    })
    return faster + 1
  }

  async getTopTimes(courseId) {
    const col = this.collectionFor(courseId)
    return await $global.getCollectionItems(col, {
      orderBy: [{ field: 'totalMs', direction: 'asc' }],
      limit: 20,
    })
  }

  async getMyBest(courseId) {
    const col = this.collectionFor(courseId)
    const mine = await $global.getCollectionItems(col, {
      filters: [{ field: 'account', operator: '==', value: $sender.account }],
    })
    if (mine.length === 0) return { entry: null, rank: -1 }
    const best = mine.sort((a, b) => a.totalMs - b.totalMs)[0]
    const rank = await this.rankOf(col, best.totalMs)
    return { entry: best, rank: rank }
  }
}
