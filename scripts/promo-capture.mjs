// promo-capture.mjs — Verse8 런칭용 프로모 에셋 자동 생성.
//   정방형(1080²) 썸네일 PNG + 15초 정방형 MP4 (봇 주행을 결정론적으로 프레임 캡처 → ffmpeg).
//   사용: node scripts/promo-capture.mjs [url] [outDir] [courseIndex] [seconds]
//   (dev 서버가 먼저 떠 있어야 함: npm run dev)
import { mkdirSync, rmSync, existsSync } from 'fs'
import { execFileSync } from 'child_process'
import { createRequire } from 'module'
const require = createRequire('/Users/hytae/Downloads/cryzen-downloader/')
const puppeteer = require('puppeteer')

const URL = process.argv[2] || 'http://localhost:3014'
const OUT = process.argv[3] || '/tmp/driftrush-promo'
const COURSE = Number(process.argv[4] ?? 0) // 0=sunny
const SECONDS = Number(process.argv[5] ?? 15)
const FPS = 30
const SIZE = 1080
const FRAMES = SECONDS * FPS

const framesDir = `${OUT}/frames`
rmSync(OUT, { recursive: true, force: true })
mkdirSync(framesDir, { recursive: true })

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', `--window-size=${SIZE},${SIZE}`],
})
const page = await browser.newPage()
await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 })
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })

// 메뉴 → 아이템전(8인, 활기참) → 코스 시작
await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Single Player')), { timeout: 30000 })
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Single Player')).click())
await new Promise(r => setTimeout(r, 500))
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/Item|아이템/.test(x.textContent)); if(b)b.click() })
await new Promise(r => setTimeout(r, 300))
await page.evaluate((i) => { const gos=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='GO!'); gos[i].click() }, COURSE)
// 게임/에셋 로딩 대기
await page.waitForFunction(() => window.__game && window.__game.kart, { timeout: 30000 })
await new Promise(r => setTimeout(r, 2500)) // 코스 풍경 스트리밍 여유

// 봇 주행 셋업 (결정론적 수동 스텝)
await page.evaluate(() => {
  const g = window.__game
  if (window.__audio) window.__audio.muted = true
  window.requestAnimationFrame = () => 0
  g.phase = 'racing'; g.goTime = g.last - 2000
  g.input.update = () => {}
  window.__promoT = g.last + 33
  window.__promoStep = () => {
    const k = g.kart, tr = g.track, st = g.input.state, N = tr.N
    const la = 16 + Math.min(10, Math.abs(k.speed) * 0.3)
    const tg = tr.sampleAt(k.trackIdx + Math.round(la))
    let diff = Math.atan2(tg.pos.x - k.pos.x, tg.pos.z - k.pos.z) - k.heading
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    st.steer = Math.max(-1, Math.min(1, diff * 2.3))
    st.throttle = 1
    st.drift = Math.abs(st.steer) > 0.32 && k.speed > 16 // 코너에서 드리프트(스파크 연출)
    st.useItem = false
    if (k.boostGauge >= 1 && k.boosterT <= 0 && k.boostT <= 0) k.fireBooster() // 게이지 차면 부스터
    g.loop(window.__promoT)
    window.__promoT += 33.333
  }
})

const canvas = await page.$('canvas')
for (let f = 0; f < FRAMES; f++) {
  await page.evaluate(() => window.__promoStep())
  await canvas.screenshot({ path: `${framesDir}/f${String(f).padStart(4, '0')}.png` })
}
// 썸네일: 눈에 띄는 중반 프레임 (드리프트/부스트 순간)
const heroIdx = Math.min(FRAMES - 1, Math.round(FPS * 3.2))
execFileSync('cp', [`${framesDir}/f${String(heroIdx).padStart(4, '0')}.png`, `${OUT}/thumbnail.png`])
await browser.close()

// ffmpeg: 프레임 → 정방형 15초 MP4 (H.264, 웹/모바일 호환)
execFileSync('ffmpeg', [
  '-y', '-framerate', String(FPS), '-i', `${framesDir}/f%04d.png`,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-crf', '20',
  '-movflags', '+faststart', '-vf', `scale=${SIZE}:${SIZE}`,
  `${OUT}/gameplay.mp4`,
], { stdio: 'inherit' })

console.log(`\n✅ 완료: ${OUT}/thumbnail.png , ${OUT}/gameplay.mp4`)
