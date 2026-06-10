// Tiny i18n — English is the default, Korean available.
import { useEffect, useReducer } from 'react'

export type Lang = 'en' | 'ko'

const DICT = {
  tagline: {
    en: 'Drift · Booster · Item battles — chase the course records',
    ko: '드리프트 · 부스터 · 아이템전 — 코스별 최속 랭킹에 도전하세요',
  },
  nickname: { en: 'Nickname', ko: '닉네임' },
  character: { en: 'CHARACTER', ko: '캐릭터' },
  kart: { en: 'KART', ko: '카트' },
  finalStats: { en: 'Final Stats', ko: '최종 스탯' },
  statSpeed: { en: 'Top Speed', ko: '최고속도' },
  statAccel: { en: 'Accel', ko: '가속' },
  statGrip: { en: 'Drift', ko: '드리프트' },
  statGauge: { en: 'Gauge', ko: '게이지' },
  statFormula: { en: 'Final = 100 + character({c}) + kart({k})', ko: '최종 = 100 + 캐릭터({c}) + 카트({k})' },
  singlePlay: { en: '🏁 Single Player', ko: '🏁 싱글 플레이' },
  singleSub: { en: 'Speed (vs #1 ghost) · Item race (vs AI)', ko: '스피드전 (1위 고스트 대결) · 아이템전 (AI 레이스)' },
  multiPlay: { en: '⚔️ Multiplayer', ko: '⚔️ 멀티플레이' },
  multiSubOnline: { en: 'Up to 8 players · Speed / Item', ko: '최대 8인 · 스피드전 / 아이템전' },
  multiSubConnecting: { en: 'Connecting...', ko: '서버 연결 중...' },
  multiSubOffline: { en: 'Offline (no server)', ko: '오프라인 (서버 미연결)' },
  netOnline: { en: '🟢 Connected to Verse8 server', ko: '🟢 Verse8 서버 연결됨' },
  netConnecting: { en: '🟡 Connecting', ko: '🟡 연결 중' },
  netOffline: { en: '🔴 Offline — records stay on this device', ko: '🔴 오프라인 모드 — 랭킹은 이 기기에만 저장됩니다' },
  settings: { en: '⚙️ Settings', ko: '⚙️ 설정' },
  back: { en: '← Back', ko: '← 뒤로' },
  selectSingle: { en: '🏁 Single — Pick a course', ko: '🏁 싱글 — 코스 선택' },
  selectMulti: { en: '⚔️ Multiplayer — Pick a course', ko: '⚔️ 멀티플레이 — 코스 선택' },
  speedToggle: { en: '⚡ Speed', ko: '⚡ 스피드전' },
  speedToggleSub: { en: '(#1 ghost)', ko: '(1위 고스트)' },
  itemToggle: { en: '🎁 Items', ko: '🎁 아이템전' },
  itemToggleSub: { en: '(3 AI)', ko: '(AI 3명)' },
  teamToggle: { en: '🤝 Team 4:4', ko: '🤝 팀전 4:4' },
  teamToggleSub: { en: '(drift practice)', ko: '(드리프트 연습)' },
  teamBlue: { en: 'BLUE', ko: '블루' },
  teamRed: { en: 'RED', ko: '레드' },
  teamWin: { en: '🏆 {team} TEAM WINS!', ko: '🏆 {team}팀 승리!' },
  teamDraw: { en: 'DRAW', ko: '무승부' },
  roomCode: { en: 'Room code (blank = public)', ko: '방 코드 (비우면 공개방)' },
  laps: { en: 'laps', ko: '랩' },
  noRecord: { en: 'No records yet — be the first!', ko: '아직 기록 없음 — 1위에 도전!' },
  go: { en: 'GO!', ko: '출발!' },
  enter: { en: 'Enter', ko: '입장' },
  preparing: { en: 'Preparing...', ko: '준비 중...' },
  offlineSelectNote: { en: 'Offline: records are saved in this browser only.', ko: '오프라인 모드: 기록은 이 브라우저에만 저장됩니다.' },
  lobbyTitle: { en: '🏟 Lobby', ko: '🏟 대기실' },
  room: { en: 'Room', ko: '방' },
  racingInProgress: { en: 'Race in progress (you join the next one)', ko: '레이스 진행 중 (끝나면 다음 판에 합류)' },
  connectingDots: { en: 'Connecting...', ko: '접속 중...' },
  leave: { en: '← Leave', ko: '← 나가기' },
  ready: { en: 'READY', ko: 'READY' },
  waiting: { en: 'waiting', ko: '대기' },
  host: { en: 'HOST', ko: '방장' },
  me: { en: '(me)', ko: '(나)' },
  startRace: { en: '🏁 Start Race', ko: '🏁 레이스 시작' },
  modeItem: { en: '🎁 Item Race', ko: '🎁 아이템전' },
  modeSpeed: { en: '⚡ Speed Race', ko: '⚡ 스피드전' },
  hostStarts: { en: 'The race starts when the host presses start', ko: '방장이 시작하면 자동으로 출발합니다' },
  modeDescItem: { en: 'Items: attack and defend with item boxes', ko: '아이템전: 아이템 박스로 공격/방어' },
  modeDescSpeed: { en: 'Speed: drift to charge the gauge → booster', ko: '스피드전: 드리프트로 게이지 충전 → 부스터' },
  results: { en: '🏆 Results', ko: '🏆 결과' },
  bestLap: { en: 'Best lap', ko: '베스트 랩' },
  newRecord: { en: '🎉 New record! Global rank #{r}', ko: '🎉 신기록! 현재 글로벌 {r}위' },
  keepBest: { en: 'Personal best kept (rank #{r})', ko: '기존 베스트 유지 (현재 {r}위)' },
  keepBestNoRank: { en: 'Personal best kept', ko: '기존 베스트 유지' },
  ranking: { en: '🌍 Fastest — {c}', ko: '🌍 {c} 최속 랭킹' },
  raceResults: { en: 'Race Results', ko: '레이스 순위' },
  stillRacing: { en: 'racing', ko: '주행 중' },
  finishedCount: { en: 'Finished {a}/{b}', ko: '완주 {a}/{b}명' },
  retry: { en: '🔄 Retry', ko: '🔄 다시 도전' },
  courseSelect: { en: 'Course select', ko: '코스 선택' },
  toLobby: { en: 'To lobby', ko: '대기실로' },
  exit: { en: 'Exit', ko: '나가기' },
  quit: { en: '✕ Quit', ko: '✕ 나가기' },
  placeOf: { en: '#{r} of {n}', ko: '{r}위 / {n}명' },
  // HUD
  lap: { en: 'LAP', ko: 'LAP' },
  currentLap: { en: 'Lap', ko: '현재 랩' },
  best: { en: 'Best', ko: '베스트' },
  standings: { en: 'Standings', ko: '순위' },
  lapTimes: { en: 'Lap times', ko: '랩 타임' },
  wrongWay: { en: '⟲ WRONG WAY!', ko: '⟲ 반대 방향!' },
  rescuing: { en: '☁️ Cloudy to the rescue...', ko: '☁️ 구름이가 구조 중...' },
  boosterReady: { en: '⚡ Booster ready! (E/Ctrl)', ko: '⚡ 부스터 준비! (E/Ctrl)' },
  boost: { en: 'BOOST', ko: 'BOOST' },
  chargeHint: { en: 'Hold ↑ to charge', ko: '↑ 길게 눌러 기 모으기' },
  chargeGood: { en: 'Launch boost 🔥', ko: '스타트 부스터 🔥' },
  chargeOver: { en: '⚠️ Overcharged!', ko: '⚠️ 과충전!' },
  controlsSpeed: { en: 'Arrows drive · Shift/Space drift (charge) · E/Ctrl booster · R reset', ko: '↑↓←→ 주행 · Shift/Space 드리프트 (게이지 충전) · E/Ctrl 부스터 · R 리셋' },
  controlsItem: { en: 'Arrows drive · Shift/Space drift · E/Ctrl item · R reset', ko: '↑↓←→ 주행 · Shift/Space 드리프트 · E/Ctrl 아이템 · R 리셋' },
  mirrorMissile: { en: '🚨 MISSILE BEHIND!', ko: '🚨 후방 미사일!' },
  mirrorOvertake: { en: '⚠️ OVERTAKEN!', ko: '⚠️ 추월당함!' },
  mirrorHit: { en: '🎯 HIT!', ko: '🎯 명중!' },
  // Settings
  settingsTitle: { en: '⚙️ Settings', ko: '⚙️ 설정' },
  bgmVolume: { en: 'BGM Volume', ko: '배경음악 볼륨' },
  sfxVolume: { en: 'SFX Volume', ko: '효과음 볼륨' },
  language: { en: 'Language', ko: '언어' },
  keymap: { en: 'Key Bindings', ko: '키 설정' },
  pressKey: { en: 'Press a key...', ko: '키를 누르세요...' },
  resetDefaults: { en: 'Reset to defaults', ko: '기본값으로' },
  done: { en: 'Done', ko: '완료' },
  actAccel: { en: 'Accelerate', ko: '가속' },
  actBrake: { en: 'Brake / Reverse', ko: '브레이크/후진' },
  actLeft: { en: 'Steer Left', ko: '좌회전' },
  actRight: { en: 'Steer Right', ko: '우회전' },
  actDrift: { en: 'Drift', ko: '드리프트' },
  actItem: { en: 'Item / Booster', ko: '아이템/부스터' },
  actReset: { en: 'Reset to track', ko: '트랙 복귀' },
  loading: { en: 'Loading assets...', ko: '에셋 로딩 중...' },
  joinFailed: { en: 'Failed to join the room. Please retry.', ko: '방 입장에 실패했습니다. 다시 시도해 주세요.' },
} as const

export type I18nKey = keyof typeof DICT

let lang: Lang = (localStorage.getItem('v8kart_lang') as Lang) || 'en'
const listeners = new Set<() => void>()

export function getLang(): Lang {
  return lang
}

export function setLang(l: Lang) {
  lang = l
  localStorage.setItem('v8kart_lang', l)
  listeners.forEach((fn) => fn())
}

export function t(key: I18nKey, vars?: Record<string, string | number>): string {
  let s: string = DICT[key]?.[lang] ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v))
  return s
}

/** React hook — re-renders the component when the language changes. */
export function useI18n() {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    listeners.add(force)
    return () => {
      listeners.delete(force)
    }
  }, [])
  return { t, lang, setLang }
}
