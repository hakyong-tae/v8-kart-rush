// In-game advertising boards.
//
// To run REAL ads (e.g. other Verse8 games), drop a 512x256-ish image into
// public/ads/ and reference it below — boards fall back to a generated
// promo card when the image is missing or still loading.
import * as THREE from 'three'

export interface AdDef {
  title: string
  subtitle?: string
  image?: string // e.g. '/ads/my-game.png'
  bg1: string
  bg2: string
  fg: string
}

export const ADS: AdDef[] = [
  { title: 'VERSE8', subtitle: 'PLAY · CREATE · EARN', bg1: '#1b2350', bg2: '#3a2a8c', fg: '#ffffff' },
  { title: 'V8 KART RUSH', subtitle: 'BEAT THE #1 GHOST', bg1: '#0f3057', bg2: '#00587a', fg: '#ffe14d' },
  { title: 'VERSE8.IO', subtitle: '1000+ BROWSER GAMES', bg1: '#3d1d63', bg2: '#7a2a8c', fg: '#9fe8ff' },
  { title: 'MADE WITH AI', subtitle: 'CREATE YOURS ON VERSE8', bg1: '#0b3d2e', bg2: '#11705a', fg: '#baffd9' },
  { title: 'YOUR GAME HERE', subtitle: 'ads@verse8.io', bg1: '#26233a', bg2: '#4a4566', fg: '#f2f2f2' },
]

function canvasTexture(ad: AdDef): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = 512
  cv.height = 256
  const ctx = cv.getContext('2d')!
  const grad = ctx.createLinearGradient(0, 0, 512, 256)
  grad.addColorStop(0, ad.bg1)
  grad.addColorStop(1, ad.bg2)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 512, 256)
  // border
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 10
  ctx.strokeRect(10, 10, 492, 236)
  // title
  ctx.fillStyle = ad.fg
  ctx.textAlign = 'center'
  ctx.font = '900 64px "Pretendard", system-ui, sans-serif'
  ctx.fillText(ad.title, 256, ad.subtitle ? 130 : 150, 460)
  if (ad.subtitle) {
    ctx.font = '600 30px "Pretendard", system-ui, sans-serif'
    ctx.globalAlpha = 0.85
    ctx.fillText(ad.subtitle, 256, 190, 460)
    ctx.globalAlpha = 1
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function adTexture(ad: AdDef): THREE.Texture {
  const fallback = canvasTexture(ad)
  if (ad.image) {
    // swap in the real creative once it loads; keep the promo card meanwhile
    new THREE.TextureLoader().load(ad.image, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      fallback.image = tex.image
      fallback.needsUpdate = true
    })
  }
  return fallback
}

/** A free-standing trackside ad board (~8 wide), front face textured. */
export function makeAdBoard(ad: AdDef): THREE.Group {
  const g = new THREE.Group()
  const W = 8
  const H = 4
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x2a2a33 })
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, H + 0.4, 0.35), frameMat)
  frame.position.y = H / 2 + 1.6
  g.add(frame)
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshBasicMaterial({ map: adTexture(ad) }),
  )
  face.position.set(0, H / 2 + 1.6, 0.19)
  g.add(face)
  for (const sx of [-W / 3, W / 3]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.8, 6), frameMat)
    leg.position.set(sx, 0.9, 0)
    g.add(leg)
  }
  return g
}
