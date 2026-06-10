import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { COURSES, KART_COLORS, getCourse } from './game/courses'
import { Track } from './game/track'
import { Assets } from './game/assets'
import { Game, type HudSnapshot } from './game/Game'
import { Hud } from './ui/Hud'
import { net, type NetStatus, type RoomSnapshot, type LeaderboardEntry } from './net/net'
import { audio } from './game/audio'
import { fmtTime } from './util'

type Screen =
  | { name: 'title' }
  | { name: 'select'; mode: 'time' | 'multi' }
  | { name: 'lobby'; courseId: string; roomId: string }
  | { name: 'game'; mode: 'time' | 'multi'; courseId: string; startAt?: number; raceId?: number }
  | { name: 'results'; mode: 'time' | 'multi'; courseId: string; totalMs: number; bestLapMs: number; raceId?: number; roomId?: string }

const assets = new Assets()
let assetsLoaded = false

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'title' })
  const [netStatus, setNetStatus] = useState<NetStatus>('connecting')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    net.init().then(setNetStatus)
    if (!assetsLoaded) {
      assets.load().then(() => {
        assetsLoaded = true
        setReady(true)
      })
    } else setReady(true)
  }, [])

  if (!ready)
    return (
      <div className="screen center-col">
        <h1 className="logo">V8 KART RUSH</h1>
        <p className="dim">에셋 로딩 중...</p>
      </div>
    )

  switch (screen.name) {
    case 'title':
      return <TitleScreen netStatus={netStatus} go={setScreen} />
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
  const [nick, setNick] = useState(net.nickname)
  const [color, setColor] = useState(net.color)

  const saveProfile = () => {
    net.nickname = nick.trim() || 'Racer'
    net.color = color
  }

  return (
    <div className="screen center-col title-screen">
      <h1 className="logo">
        V8 KART <span className="logo-accent">RUSH</span>
      </h1>
      <p className="tagline">드리프트 · 부스트 · 아이템전 — 코스별 최속 랭킹에 도전하세요</p>

      <div className="card profile">
        <label className="field">
          <span>닉네임</span>
          <input
            value={nick}
            maxLength={15}
            placeholder="Racer"
            onChange={(e) => setNick(e.target.value)}
          />
        </label>
        <div className="field">
          <span>카트</span>
          <div className="colors">
            {KART_COLORS.map((c) => (
              <button
                key={c.id}
                className={`color-dot ${color === c.id ? 'sel' : ''}`}
                style={{ background: c.ui }}
                onClick={() => setColor(c.id)}
                aria-label={c.id}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="menu">
        <button
          className="btn big"
          onClick={() => {
            saveProfile()
            audio.resume()
            go({ name: 'select', mode: 'time' })
          }}
        >
          🏁 타임어택
          <small>코스별 최속 글로벌 랭킹</small>
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
          ⚔️ 멀티플레이
          <small>
            {netStatus === 'online'
              ? '최대 8인 아이템 레이스'
              : netStatus === 'connecting'
                ? '서버 연결 중...'
                : '오프라인 (서버 미연결)'}
          </small>
        </button>
      </div>

      <p className="footer dim">
        {netStatus === 'online' ? '🟢 Verse8 서버 연결됨' : netStatus === 'connecting' ? '🟡 연결 중' : '🔴 오프라인 모드 — 랭킹은 이 기기에만 저장됩니다'}
      </p>
    </div>
  )
}

// ---------- Course preview minimap ----------

const outlineCache = new Map<string, { x: number; z: number }[]>()
function courseOutline(courseId: string) {
  let o = outlineCache.get(courseId)
  if (!o) {
    const t = new Track(getCourse(courseId))
    o = []
    for (let i = 0; i <= 100; i++) {
      const s = t.sampleAt(Math.floor((i / 100) * t.N))
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
    ctx.closePath()
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
  const [boards, setBoards] = useState<Record<string, LeaderboardEntry[]>>({})
  const [roomCode, setRoomCode] = useState('')
  const [joining, setJoining] = useState<string | null>(null)

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
      go({ name: 'game', mode: 'time', courseId })
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
      alert('방 입장에 실패했습니다. 다시 시도해 주세요.')
      setJoining(null)
    }
  }

  return (
    <div className="screen select-screen">
      <header className="row spread">
        <button className="btn small" onClick={() => go({ name: 'title' })}>← 뒤로</button>
        <h2>{mode === 'time' ? '🏁 타임어택 — 코스 선택' : '⚔️ 멀티플레이 — 코스 선택'}</h2>
        {mode === 'multi' ? (
          <input
            className="room-code"
            placeholder="방 코드 (비우면 공개방)"
            value={roomCode}
            maxLength={12}
            onChange={(e) => setRoomCode(e.target.value)}
          />
        ) : (
          <span />
        )}
      </header>

      <div className="courses">
        {COURSES.map((c) => (
          <div key={c.id} className="card course-card">
            <CoursePreview courseId={c.id} stroke={c.theme.night ? '#7df' : '#fff'} />
            <h3>
              {c.nameKo} <span className="dim">{c.name}</span>
            </h3>
            <div className="stars">{'★'.repeat(c.difficulty)}{'☆'.repeat(3 - c.difficulty)} · {c.laps}랩</div>
            <ol className="board-mini">
              {(boards[c.id] ?? []).slice(0, 3).map((e, i) => (
                <li key={e.__id ?? i}>
                  <span className="rank">{i + 1}</span> {e.nickname}
                  <span className="t">{fmtTime(e.totalMs)}</span>
                </li>
              ))}
              {(boards[c.id] ?? []).length === 0 && <li className="dim">아직 기록 없음 — 1위에 도전!</li>}
            </ol>
            <button className="btn" disabled={joining !== null} onClick={() => pick(c.id)}>
              {joining === c.id ? '입장 중...' : mode === 'time' ? '출발!' : '입장'}
            </button>
          </div>
        ))}
      </div>
      {mode === 'time' && netStatus !== 'online' && (
        <p className="dim center">오프라인 모드: 기록은 이 브라우저에만 저장됩니다.</p>
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
  const [snap, setSnap] = useState<RoomSnapshot | null>(null)
  const [myReady, setMyReady] = useState(false)
  const startedRef = useRef(false)
  const course = getCourse(courseId)

  useEffect(() => {
    const unsub = net.onRoomState((s) => {
      setSnap(s)
      if (s.phase === 'racing' && s.startAt > net.serverNow() - 5000 && !startedRef.current) {
        startedRef.current = true
        go({ name: 'game', mode: 'multi', courseId: s.courseId, startAt: s.startAt, raceId: s.raceId })
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
      <h2>🏟 대기실 — {course.nameKo}</h2>
      <p className="dim">
        방: <code>{roomId}</code> · {playerList.length}/8명
        {racing && ' · 레이스 진행 중 (끝나면 다음 판에 합류)'}
      </p>

      <div className="card lobby-list">
        {playerList.map((p) => (
          <div key={p.account} className="lobby-row">
            <span
              className="color-dot small"
              style={{ background: KART_COLORS.find((c) => c.id === p.info.color)?.ui ?? '#ccc' }}
            />
            <span className="nick">
              {p.info.nick}
              {p.account === net.account && ' (나)'}
            </span>
            {p.isHost && <span className="badge">방장</span>}
            <span className={`ready ${p.info.ready ? 'on' : ''}`}>
              {p.info.ready ? 'READY' : '대기'}
            </span>
          </div>
        ))}
        {playerList.length === 0 && <p className="dim">접속 중...</p>}
      </div>

      <div className="row gap">
        <button className="btn" onClick={leave}>← 나가기</button>
        <button
          className={`btn ${myReady ? 'on' : ''}`}
          disabled={racing}
          onClick={() => {
            const v = !myReady
            setMyReady(v)
            net.setReady(v)
          }}
        >
          {myReady ? '✓ READY' : 'READY'}
        </button>
        {isHost && (
          <button
            className="btn primary"
            disabled={racing}
            onClick={() => net.startRace(courseId)?.catch((e) => alert(String(e?.message ?? e)))}
          >
            🏁 레이스 시작
          </button>
        )}
      </div>
      {!isHost && <p className="dim">방장이 시작하면 자동으로 출발합니다</p>}
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
    // assets.load() is idempotent — guarantees models exist even across HMR reloads
    assets.load().then(() => {
      if (cancelled) return
      game = new Game(canvas, assets, {
        courseId: screen.courseId,
        mode: screen.mode,
        startAt: screen.startAt,
        players: screen.mode === 'multi' ? playersCacheRef.players : undefined,
        onSnapshot: setSnap,
        onFinish: (totalMs, bestLapMs) => {
          if (finishedRef.current) return
          finishedRef.current = true
          if (screen.mode === 'multi') net.finishRace(totalMs, bestLapMs)
          // brief FINISH! moment, then results
          setTimeout(() => {
            go({
              name: 'results',
              mode: screen.mode,
              courseId: screen.courseId,
              totalMs,
              bestLapMs,
              raceId: screen.raceId,
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
      <Hud snap={snap} outline={outline} mode={screen.mode} />
      <button
        className="btn small hud-quit"
        onClick={async () => {
          if (screen.mode === 'multi') await net.leaveRoom()
          go({ name: 'title' })
        }}
      >
        ✕ 나가기
      </button>
      {screen.mode === 'multi' && roomSnap && snap?.finished && (
        <div className="live-finish dim">
          완주: {Object.values(roomSnap.finishes).filter((f) => f.raceId === screen.raceId).length}
          /{roomSnap.users.length}
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
  const course = getCourse(screen.courseId)
  const [board, setBoard] = useState<LeaderboardEntry[]>([])
  const [submitResult, setSubmitResult] = useState<{ updated: boolean; rank: number } | null>(null)
  const [roomSnap, setRoomSnap] = useState<RoomSnapshot | null>(null)
  const submittedRef = useRef(false)

  useEffect(() => {
    if (screen.mode === 'time') {
      if (submittedRef.current) return
      submittedRef.current = true
      ;(async () => {
        const res = await net.submitTime(screen.courseId, screen.totalMs, screen.bestLapMs)
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
      <h2>🏆 결과 — {course.nameKo}</h2>
      <div className="card result-card">
        <p className="big-time">{fmtTime(screen.totalMs)}</p>
        <p className="dim">베스트 랩 {fmtTime(screen.bestLapMs)}</p>
        {screen.mode === 'time' && submitResult && (
          <p className={submitResult.updated ? 'accent' : 'dim'}>
            {submitResult.updated
              ? `🎉 신기록! 현재 글로벌 ${submitResult.rank}위`
              : `기존 베스트 유지 (현재 ${submitResult.rank > 0 ? submitResult.rank + '위' : '기록 없음'})`}
          </p>
        )}
      </div>

      {screen.mode === 'time' ? (
        <div className="card board">
          <h3>🌍 {course.nameKo} 최속 랭킹</h3>
          <ol>
            {board.map((e, i) => (
              <li key={e.__id ?? i} className={e.account === net.account ? 'me' : ''}>
                <span className="rank">{i + 1}</span>
                <span
                  className="color-dot small"
                  style={{ background: KART_COLORS.find((c) => c.id === e.color)?.ui ?? '#ccc' }}
                />
                {e.nickname}
                <span className="t">{fmtTime(e.totalMs)}</span>
              </li>
            ))}
            {board.length === 0 && <li className="dim">기록 없음</li>}
          </ol>
        </div>
      ) : (
        <div className="card board">
          <h3>레이스 순위</h3>
          <ol>
            {multiResults.map((r, i) => (
              <li key={r.account} className={r.account === net.account ? 'me' : ''}>
                <span className="rank">{i + 1}</span>
                <span
                  className="color-dot small"
                  style={{ background: KART_COLORS.find((c) => c.id === r.color)?.ui ?? '#ccc' }}
                />
                {r.nick}
                <span className="t">{fmtTime(r.totalMs)}</span>
              </li>
            ))}
          </ol>
          <p className="dim">
            완주 {multiResults.length}/{roomSnap?.users.length ?? 0}명
          </p>
        </div>
      )}

      <div className="row gap">
        {screen.mode === 'time' ? (
          <>
            <button
              className="btn primary"
              onClick={() => go({ name: 'game', mode: 'time', courseId: screen.courseId })}
            >
              🔄 다시 도전
            </button>
            <button className="btn" onClick={() => go({ name: 'select', mode: 'time' })}>
              코스 선택
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
                대기실로
              </button>
            )}
            {!isHost && (
              <button
                className="btn"
                onClick={() => go({ name: 'lobby', courseId: screen.courseId, roomId: net.roomId ?? '' })}
              >
                대기실로
              </button>
            )}
            <button
              className="btn"
              onClick={async () => {
                await net.leaveRoom()
                go({ name: 'title' })
              }}
            >
              나가기
            </button>
          </>
        )}
      </div>
    </div>
  )
}
