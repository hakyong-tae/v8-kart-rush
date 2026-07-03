import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { COURSES, getCourse } from './game/courses'
import { KARTS, CHARACTERS, getKart } from './game/roster'
import { Track } from './game/track'
import { Assets, SCENERY_MODELS } from './game/assets'
import { Game, type HudSnapshot, type GhostData, type Placement } from './game/Game'
import { Hud } from './ui/Hud'
import { ComboPreview } from './ui/ComboPreview'
import { net, type NetStatus, type RoomSnapshot, type LeaderboardEntry } from './net/net'
import { audio } from './game/audio'
import { fmtTime } from './util'
import { useI18n } from './i18n'
import { SettingsScreen } from './ui/SettingsScreen'

type Screen =
  | { name: 'title' }
  | { name: 'settings' }
  | { name: 'select'; mode: 'time' | 'multi' }
  | { name: 'lobby'; courseId: string; roomId: string }
  | {
      name: 'game'
      mode: 'time' | 'multi'
      raceMode: 'speed' | 'item'
      courseId: string
      startAt?: number
      raceId?: number
      ghost?: GhostData | null
      aiCount?: number
      teamRace?: boolean
    }
  | {
      name: 'results'
      mode: 'time' | 'multi'
      raceMode: 'speed' | 'item'
      courseId: string
      totalMs: number
      bestLapMs: number
      raceId?: number
      placements?: Placement[]
      ghost?: GhostData
      teamRace?: boolean
      teamScores?: { blue: number; red: number }
    }

const assets = new Assets()
let assetsLoaded = false

export default function App() {
  const { t } = useI18n()
  const [screen, setScreen] = useState<Screen>({ name: 'title' })
  const [netStatus, setNetStatus] = useState<NetStatus>('connecting')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    net.init().then(setNetStatus)
    // satisfying button clicks everywhere
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest?.('button')) audio.uiClick()
    }
    document.addEventListener('click', onClick)
    if (!assetsLoaded) {
      assets.load().then(() => {
        assetsLoaded = true
        setReady(true)
      })
    } else setReady(true)
    return () => document.removeEventListener('click', onClick)
  }, [])

  if (!ready)
    return (
      <div className="screen center-col">
        <h1 className="logo">V8 KART RUSH</h1>
        <p className="dim">{t('loading')}</p>
      </div>
    )

  switch (screen.name) {
    case 'title':
      return <TitleScreen netStatus={netStatus} go={setScreen} />
    case 'settings':
      return <SettingsScreen onClose={() => setScreen({ name: 'title' })} />
    case 'select':
      return <SelectScreen mode={screen.mode} netStatus={netStatus} go={setScreen} />
    case 'lobby':
      return <LobbyScreen courseId={screen.courseId} roomId={screen.roomId} go={setScreen} />
    case 'game':
      return <GameScreen screen={screen} go={setScreen} />
    case 'results':
      return <ResultsScreen screen={screen} go={setScreen} />
  }
}

// ---------- Title ----------

function TitleScreen({ netStatus, go }: { netStatus: NetStatus; go: (s: Screen) => void }) {
  const { t, lang } = useI18n()
  const [nick, setNick] = useState(net.nickname)
  const [color, setColor] = useState(net.color)
  const [charId, setCharId] = useState(net.character)

  const saveProfile = () => {
    net.nickname = nick.trim() || 'Racer'
    net.color = color
    net.character = charId
  }

  return (
    <div className="screen center-col title-screen">
      <h1 className="logo">
        V8 KART <span className="logo-accent">RUSH</span>
      </h1>
      <p className="tagline">{t('tagline')}</p>

      <div className="card profile">
        <label className="field">
          <span>{t('nickname')}</span>
          <input
            value={nick}
            maxLength={15}
            placeholder="Racer"
            onChange={(e) => setNick(e.target.value)}
          />
        </label>
      </div>

      <div className="pickers">
        <div className="card picker">
          <h4>{t('character')}</h4>
          <div className="picker-row">
            {CHARACTERS.map((c) => (
              <button
                key={c.id}
                className={`pick-card ${charId === c.id ? 'sel' : ''}`}
                onClick={() => setCharId(c.id)}
              >
                <span
                  className="pick-face"
                  style={{ background: `#${c.suit.toString(16).padStart(6, '0')}` }}
                >
                  {c.emoji}
                </span>
                <b>{lang === 'ko' ? c.nameKo : c.name}</b>
              </button>
            ))}
          </div>
        </div>
        <div className="card picker">
          <h4>{t('kart')}</h4>
          <div className="picker-row">
            {KARTS.map((k) => (
              <button
                key={k.id}
                className={`pick-card ${color === k.id ? 'sel' : ''}`}
                onClick={() => setColor(k.id)}
              >
                <span className="pick-face" style={{ background: k.ui }}>🏎️</span>
                <b>{lang === 'ko' ? k.nameKo : k.name}</b>
              </button>
            ))}
          </div>
        </div>
      </div>

      <ComboPreview assets={assets} charId={charId} kartId={color} />

      <div className="menu">
        <button
          className="btn big"
          onClick={() => {
            saveProfile()
            audio.resume()
            go({ name: 'select', mode: 'time' })
          }}
        >
          {t('singlePlay')}
          <small>{t('singleSub')}</small>
        </button>
        <button
          className="btn big"
          disabled={netStatus !== 'online'}
          onClick={() => {
            saveProfile()
            audio.resume()
            go({ name: 'select', mode: 'multi' })
          }}
        >
          {t('multiPlay')}
          <small>
            {netStatus === 'online'
              ? t('multiSubOnline')
              : netStatus === 'connecting'
                ? t('multiSubConnecting')
                : t('multiSubOffline')}
          </small>
        </button>
        <button className="btn" onClick={() => go({ name: 'settings' })}>
          {t('settings')}
        </button>
      </div>

      <p className="footer dim">
        {netStatus === 'online' ? t('netOnline') : netStatus === 'connecting' ? t('netConnecting') : t('netOffline')}
      </p>
    </div>
  )
}

// ---------- Course preview minimap ----------

const outlineCache = new Map<string, { x: number; z: number }[]>()
function courseOutline(courseId: string) {
  let o = outlineCache.get(courseId)
  if (!o) {
    const course = getCourse(courseId)
    const t = new Track(course)
    o = []
    // P2P 코스는 숨은 복귀 레그를 미니맵에서 제외 (선 모양이 됨)
    const endFrac = course.p2pFinishT ? course.p2pFinishT + 0.055 : 1
    for (let i = 0; i <= 100; i++) {
      const s = t.sampleAt(Math.floor((i / 100) * endFrac * t.N))
      o.push({ x: s.pos.x, z: s.pos.z })
    }
    outlineCache.set(courseId, o)
  }
  return o
}

function CoursePreview({ courseId, stroke }: { courseId: string; stroke: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    const o = courseOutline(courseId)
    const W = (cv.width = 220)
    const H = (cv.height = 140)
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const p of o) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
    }
    const pad = 12
    const sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ))
    ctx.clearRect(0, 0, W, H)
    ctx.strokeStyle = stroke
    ctx.lineWidth = 6
    ctx.lineJoin = 'round'
    ctx.beginPath()
    o.forEach((p, i) => {
      const x = pad + (p.x - minX) * sc + (W - pad * 2 - (maxX - minX) * sc) / 2
      const y = pad + (p.z - minZ) * sc + (H - pad * 2 - (maxZ - minZ) * sc) / 2
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    // P2P(다운힐)는 열린 선 — 시작/끝이 떨어져 있으면 닫지 않는다
    const f = o[0]
    const l = o[o.length - 1]
    if (Math.hypot(f.x - l.x, f.z - l.z) < 30) ctx.closePath()
    ctx.stroke()
  }, [courseId, stroke])
  return <canvas ref={ref} className="course-preview" />
}

// ---------- Select ----------

function SelectScreen({
  mode,
  netStatus,
  go,
}: {
  mode: 'time' | 'multi'
  netStatus: NetStatus
  go: (s: Screen) => void
}) {
  const { t, lang } = useI18n()
  const [boards, setBoards] = useState<Record<string, LeaderboardEntry[]>>({})
  const [roomCode, setRoomCode] = useState('')
  const [joining, setJoining] = useState<string | null>(null)
  const [raceMode, setRaceMode] = useState<'speed' | 'item' | 'team'>('speed')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const result: Record<string, LeaderboardEntry[]> = {}
      for (const c of COURSES) {
        result[c.id] = await net.getTopTimes(c.id)
      }
      if (alive) setBoards(result)
    })()
    return () => {
      alive = false
    }
  }, [])

  const pick = async (courseId: string) => {
    if (mode === 'time') {
      if (raceMode === 'item') {
        // single item race vs CPU karts
        go({ name: 'game', mode: 'time', raceMode: 'item', courseId, aiCount: 3 })
      } else if (raceMode === 'team') {
        // 4:4 team speed race (drift practice)
        go({ name: 'game', mode: 'time', raceMode: 'speed', teamRace: true, courseId })
      } else {
        // speed race: fetch the #1 ghost to race against
        setJoining(courseId)
        const ghost = await net.getTopGhost(courseId)
        go({ name: 'game', mode: 'time', raceMode: 'speed', courseId, ghost })
      }
      return
    }
    setJoining(courseId)
    try {
      const roomId = roomCode.trim()
        ? `r-${roomCode.trim().toLowerCase()}-${courseId}`
        : `q-${courseId}`
      await net.joinRoom(roomId)
      go({ name: 'lobby', courseId, roomId })
    } catch (e) {
      console.error('join failed', e)
      alert(t('joinFailed'))
      setJoining(null)
    }
  }

  return (
    <div className="screen select-screen">
      <header className="row spread">
        <button className="btn small" onClick={() => go({ name: 'title' })}>{t('back')}</button>
        <h2>{mode === 'time' ? t('selectSingle') : t('selectMulti')}</h2>
        {mode === 'multi' ? (
          <input
            className="room-code"
            placeholder={t('roomCode')}
            value={roomCode}
            maxLength={12}
            onChange={(e) => setRoomCode(e.target.value)}
          />
        ) : (
          <div className="row gap">
            <button
              className={`btn small ${raceMode === 'speed' ? 'on' : ''}`}
              onClick={() => setRaceMode('speed')}
            >
              {t('speedToggle')} <small>{t('speedToggleSub')}</small>
            </button>
            <button
              className={`btn small ${raceMode === 'team' ? 'on' : ''}`}
              onClick={() => setRaceMode('team')}
            >
              {t('teamToggle')} <small>{t('teamToggleSub')}</small>
            </button>
            <button
              className={`btn small ${raceMode === 'item' ? 'on' : ''}`}
              onClick={() => setRaceMode('item')}
            >
              {t('itemToggle')} <small>{t('itemToggleSub')}</small>
            </button>
          </div>
        )}
      </header>

      <div className="courses">
        {COURSES.map((c) => (
          <div key={c.id} className="card course-card">
            <CoursePreview courseId={c.id} stroke={c.theme.night ? '#7df' : '#fff'} />
            <h3>
              {lang === 'ko' ? c.nameKo : c.name}{' '}
              {lang === 'ko' && <span className="dim">{c.name}</span>}
            </h3>
            <div className="stars">{'★'.repeat(c.difficulty)}{'☆'.repeat(3 - c.difficulty)} · {c.laps} {t('laps')}</div>
            <ol className="board-mini">
              {(boards[c.id] ?? []).slice(0, 3).map((e, i) => (
                <li key={e.__id ?? i}>
                  <span className="rank">{i + 1}</span> {e.nickname}
                  <span className="t">{fmtTime(e.totalMs)}</span>
                </li>
              ))}
              {(boards[c.id] ?? []).length === 0 && <li className="dim">{t('noRecord')}</li>}
            </ol>
            <button className="btn" disabled={joining !== null} onClick={() => pick(c.id)}>
              {joining === c.id ? t('preparing') : mode === 'time' ? t('go') : t('enter')}
            </button>
          </div>
        ))}
      </div>
      {mode === 'time' && netStatus !== 'online' && (
        <p className="dim center">{t('offlineSelectNote')}</p>
      )}
    </div>
  )
}

// ---------- Lobby ----------

function LobbyScreen({
  courseId,
  roomId,
  go,
}: {
  courseId: string
  roomId: string
  go: (s: Screen) => void
}) {
  const { t, lang } = useI18n()
  const [snap, setSnap] = useState<RoomSnapshot | null>(null)
  const [myReady, setMyReady] = useState(false)
  const [raceMode, setRaceMode] = useState<'speed' | 'item'>('item')
  const startedRef = useRef(false)
  const course = getCourse(courseId)

  useEffect(() => {
    const unsub = net.onRoomState((s) => {
      setSnap(s)
      if (s.phase === 'racing' && s.startAt > net.serverNow() - 5000 && !startedRef.current) {
        startedRef.current = true
        go({
          name: 'game',
          mode: 'multi',
          raceMode: s.raceMode,
          courseId: s.courseId,
          startAt: s.startAt,
          raceId: s.raceId,
        })
      }
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const leave = async () => {
    await net.leaveRoom()
    go({ name: 'select', mode: 'multi' })
  }

  const isHost = snap?.host === net.account
  const racing = snap?.phase === 'racing'
  const playerList = snap
    ? snap.users.map((a) => ({
        account: a,
        info: snap.players[a] ?? { nick: '...', color: 'white', ready: false, joinedAt: 0 },
        isHost: a === snap.host,
      }))
    : []

  return (
    <div className="screen center-col">
      <h2>{t('lobbyTitle')} — {lang === 'ko' ? course.nameKo : course.name}</h2>
      <p className="dim">
        {t('room')}: <code>{roomId}</code> · {playerList.length}/8
        {racing && <> · {t('racingInProgress')}</>}
      </p>

      <div className="card lobby-list">
        {playerList.map((p) => (
          <div key={p.account} className="lobby-row">
            <span
              className="color-dot small"
              style={{ background: getKart(p.info.color).ui ?? '#ccc' }}
            />
            <span className="nick">
              {p.info.nick}
              {p.account === net.account && <> {t('me')}</>}
            </span>
            {p.isHost && <span className="badge">{t('host')}</span>}
            <span className={`ready ${p.info.ready ? 'on' : ''}`}>
              {p.info.ready ? t('ready') : t('waiting')}
            </span>
          </div>
        ))}
        {playerList.length === 0 && <p className="dim">{t('connectingDots')}</p>}
      </div>

      <div className="row gap">
        <button className="btn" onClick={leave}>{t('leave')}</button>
        <button
          className={`btn ${myReady ? 'on' : ''}`}
          disabled={racing}
          onClick={() => {
            const v = !myReady
            setMyReady(v)
            net.setReady(v)
          }}
        >
          {myReady ? '✓ ' + t('ready') : t('ready')}
        </button>
        {isHost && (
          <>
            <button
              className="btn"
              disabled={racing}
              onClick={() => setRaceMode(raceMode === 'item' ? 'speed' : 'item')}
            >
              {raceMode === 'item' ? t('modeItem') : t('modeSpeed')}
            </button>
            <button
              className="btn primary"
              disabled={racing}
              onClick={() =>
                net.startRace(courseId, raceMode)?.catch((e) => alert(String(e?.message ?? e)))
              }
            >
              {t('startRace')}
            </button>
          </>
        )}
      </div>
      {!isHost && <p className="dim">{t('hostStarts')}</p>}
      {isHost && (
        <p className="dim">
          {raceMode === 'item' ? t('modeDescItem') : t('modeDescSpeed')}
        </p>
      )}
    </div>
  )
}

// ---------- Game ----------

function GameScreen({
  screen,
  go,
}: {
  screen: Extract<Screen, { name: 'game' }>
  go: (s: Screen) => void
}) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [snap, setSnap] = useState<HudSnapshot | null>(null)
  const [outline, setOutline] = useState<{ x: number; z: number }[]>([])
  const [roomSnap, setRoomSnap] = useState<RoomSnapshot | null>(null)
  const finishedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current!
    let cancelled = false
    let game: Game | null = null
    // assets.load() is idempotent — guarantees models exist even across HMR reloads.
    // Course scenery sets are loaded on demand right before the race.
    assets
      .load()
      .then(() => assets.loadSet(SCENERY_MODELS[screen.courseId] ?? []))
      .then(() => {
      if (cancelled) return
      game = new Game(canvas, assets, {
        courseId: screen.courseId,
        mode: screen.mode,
        raceMode: screen.raceMode,
        teamRace: screen.teamRace,
        startAt: screen.startAt,
        ghost: screen.ghost,
        aiCount: screen.aiCount,
        players: screen.mode === 'multi' ? playersCacheRef.players : undefined,
        onSnapshot: setSnap,
        onFinish: (totalMs, bestLapMs, extra) => {
          if (finishedRef.current) return
          finishedRef.current = true
          if (screen.mode === 'multi') net.finishRace(totalMs, bestLapMs)
          // brief FINISH! moment, then results
          setTimeout(() => {
            go({
              name: 'results',
              mode: screen.mode,
              raceMode: screen.raceMode,
              courseId: screen.courseId,
              totalMs,
              bestLapMs,
              raceId: screen.raceId,
              placements: extra.placements,
              ghost: extra.ghost,
              teamRace: screen.teamRace,
              teamScores: extra.teamScores,
            })
          }, 1800)
        },
      })
      gameRef.current = game
      setOutline(game.minimapOutline())
    })

    return () => {
      cancelled = true
      game?.dispose()
      gameRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // keep room subscription alive in multi to receive player info updates
  useEffect(() => {
    if (screen.mode !== 'multi') return
    const unsub = net.onRoomState((s) => {
      setRoomSnap(s)
      playersCacheRef.players = s.players
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="game-wrap">
      <canvas ref={canvasRef} className="game-canvas" />
      <Hud snap={snap} outline={outline} mode={screen.mode} raceMode={screen.raceMode} />
      <button
        className="btn small hud-quit"
        onClick={async () => {
          if (screen.mode === 'multi') await net.leaveRoom()
          go({ name: 'title' })
        }}
      >
        {t('quit')}
      </button>
      {screen.mode === 'multi' && roomSnap && snap?.finished && (
        <div className="live-finish dim">
          {t('finishedCount', {
            a: Object.values(roomSnap.finishes).filter((f) => f.raceId === screen.raceId).length,
            b: roomSnap.users.length,
          })}
        </div>
      )}
    </div>
  )
}

// players cache shared between lobby->game transition
const playersCacheRef: { players: Record<string, any> } = { players: {} }

// ---------- Results ----------

function ResultsScreen({
  screen,
  go,
}: {
  screen: Extract<Screen, { name: 'results' }>
  go: (s: Screen) => void
}) {
  const { t, lang } = useI18n()
  const course = getCourse(screen.courseId)
  const [board, setBoard] = useState<LeaderboardEntry[]>([])
  const [submitResult, setSubmitResult] = useState<{ updated: boolean; rank: number } | null>(null)
  const [roomSnap, setRoomSnap] = useState<RoomSnapshot | null>(null)
  const submittedRef = useRef(false)

  // AI races (item / team): placements only, never submitted to the leaderboard
  const isAiRace = screen.mode === 'time' && (screen.raceMode === 'item' || screen.teamRace)

  useEffect(() => {
    if (isAiRace) return
    if (screen.mode === 'time') {
      if (submittedRef.current) return
      submittedRef.current = true
      ;(async () => {
        const res = await net.submitTime(
          screen.courseId,
          screen.totalMs,
          screen.bestLapMs,
          screen.ghost,
        )
        setSubmitResult(res)
        setBoard(await net.getTopTimes(screen.courseId))
      })()
    } else {
      const unsub = net.onRoomState(setRoomSnap)
      return unsub
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isHost = roomSnap?.host === net.account

  const multiResults = useMemo(() => {
    if (!roomSnap) return []
    return Object.entries(roomSnap.finishes)
      .filter(([, f]) => f.raceId === screen.raceId)
      .map(([account, f]) => ({
        account,
        nick: roomSnap.players[account]?.nick ?? account.slice(0, 6),
        color: roomSnap.players[account]?.color ?? 'white',
        ...f,
      }))
      .sort((a, b) => a.totalMs - b.totalMs)
  }, [roomSnap, screen.raceId])

  return (
    <div className="screen center-col">
      <h2>{t('results')} — {lang === 'ko' ? course.nameKo : course.name}</h2>
      <div className="card result-card">
        <p className="big-time">{fmtTime(screen.totalMs)}</p>
        <p className="dim">{t('bestLap')} {fmtTime(screen.bestLapMs)}</p>
        {isAiRace && screen.placements && (
          <p className="accent">
            {t('placeOf', {
              r: screen.placements.findIndex((p) => p.isPlayer) + 1,
              n: screen.placements.length,
            })}
          </p>
        )}
        {screen.teamRace && screen.teamScores && (
          <div className="team-result">
            <p className="team-banner">
              {screen.teamScores.blue === screen.teamScores.red
                ? t('teamDraw')
                : t('teamWin', {
                    team:
                      screen.teamScores.blue > screen.teamScores.red ? t('teamBlue') : t('teamRed'),
                  })}
            </p>
            <p className="team-scoreline">
              <span className="team-chip blue">{t('teamBlue')} {screen.teamScores.blue}</span>
              <span className="dim"> : </span>
              <span className="team-chip red">{screen.teamScores.red} {t('teamRed')}</span>
            </p>
          </div>
        )}
        {!isAiRace && screen.mode === 'time' && submitResult && (
          <p className={submitResult.updated ? 'accent' : 'dim'}>
            {submitResult.updated
              ? t('newRecord', { r: submitResult.rank })
              : submitResult.rank > 0
                ? t('keepBest', { r: submitResult.rank })
                : t('keepBestNoRank')}
          </p>
        )}
      </div>

      {isAiRace ? (
        <div className="card board">
          <h3>{t('raceResults')}</h3>
          <ol>
            {(screen.placements ?? []).map((p, i) => (
              <li key={i} className={p.isPlayer ? 'me' : ''}>
                <span className="rank">{i + 1}</span>
                <span
                  className="color-dot small"
                  style={{ background: p.team ? (p.team === 'blue' ? '#3a8dff' : '#ff4d3d') : getKart(p.color).ui }}
                />
                {p.name}
                {p.isPlayer && <> {t('me')}</>}
                <span className="t">{p.totalMs !== null ? fmtTime(p.totalMs) : t('stillRacing')}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : screen.mode === 'time' ? (
        <div className="card board">
          <h3>{t('ranking', { c: lang === 'ko' ? course.nameKo : course.name })}</h3>
          <ol>
            {board.map((e, i) => (
              <li key={e.__id ?? i} className={e.account === net.account ? 'me' : ''}>
                <span className="rank">{i + 1}</span>
                <span
                  className="color-dot small"
                  style={{ background: getKart(e.color ?? 'red').ui }}
                />
                {e.nickname}
                <span className="t">{fmtTime(e.totalMs)}</span>
              </li>
            ))}
            {board.length === 0 && <li className="dim">{t('noRecord')}</li>}
          </ol>
        </div>
      ) : (
        <div className="card board">
          <h3>{t('raceResults')}</h3>
          <ol>
            {multiResults.map((r, i) => (
              <li key={r.account} className={r.account === net.account ? 'me' : ''}>
                <span className="rank">{i + 1}</span>
                <span
                  className="color-dot small"
                  style={{ background: getKart(r.color).ui ?? '#ccc' }}
                />
                {r.nick}
                <span className="t">{fmtTime(r.totalMs)}</span>
              </li>
            ))}
          </ol>
          <p className="dim">
            {t('finishedCount', { a: multiResults.length, b: roomSnap?.users.length ?? 0 })}
          </p>
        </div>
      )}

      <div className="row gap">
        {screen.mode === 'time' ? (
          <>
            <button
              className="btn primary"
              onClick={async () => {
                if (screen.teamRace) {
                  go({ name: 'game', mode: 'time', raceMode: 'speed', teamRace: true, courseId: screen.courseId })
                } else if (isAiRace) {
                  go({ name: 'game', mode: 'time', raceMode: 'item', courseId: screen.courseId, aiCount: 3 })
                } else {
                  const ghost = await net.getTopGhost(screen.courseId)
                  go({ name: 'game', mode: 'time', raceMode: 'speed', courseId: screen.courseId, ghost })
                }
              }}
            >
              {t('retry')}
            </button>
            <button className="btn" onClick={() => go({ name: 'select', mode: 'time' })}>
              {t('courseSelect')}
            </button>
          </>
        ) : (
          <>
            {isHost && (
              <button
                className="btn primary"
                onClick={async () => {
                  await net.backToLobby()
                  go({ name: 'lobby', courseId: screen.courseId, roomId: net.roomId ?? '' })
                }}
              >
                {t('toLobby')}
              </button>
            )}
            {!isHost && (
              <button
                className="btn"
                onClick={() => go({ name: 'lobby', courseId: screen.courseId, roomId: net.roomId ?? '' })}
              >
                {t('toLobby')}
              </button>
            )}
            <button
              className="btn"
              onClick={async () => {
                await net.leaveRoom()
                go({ name: 'title' })
              }}
            >
              {t('exit')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
