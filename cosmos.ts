import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments } from '@chenglou/pretext'

// ── Canvas setup ──
const canvas = document.getElementById('cosmos') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
let W = 0, H = 0
let dpr = 1
let needsStarRedraw = true

function resize(): void {
  dpr = window.devicePixelRatio || 1
  W = window.innerWidth
  H = window.innerHeight
  canvas.width = W * dpr
  canvas.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  needsStarRedraw = true
}
resize()
window.addEventListener('resize', resize)

// ── Offscreen canvases for cached layers ──
const starCanvas = new OffscreenCanvas(1, 1)
const starCtx = starCanvas.getContext('2d')!

// Pre-rendered planet textures (keyed by planet index)
const planetTextures: Map<number, OffscreenCanvas> = new Map()

// ── Input ──
const mouse = { x: W / 2, y: H / 2, active: false }
let zoom = 1
let prevZoom = -1
const supernovae: { x: number; y: number; t: number; hue: number }[] = []

window.addEventListener('mousemove', e => {
  mouse.x = e.clientX
  mouse.y = e.clientY
  mouse.active = true
})
window.addEventListener('mouseleave', () => { mouse.active = false })
window.addEventListener('wheel', e => {
  zoom = Math.max(0.3, Math.min(3, zoom - e.deltaY * 0.001))
}, { passive: true })
window.addEventListener('click', e => {
  supernovae.push({ x: e.clientX, y: e.clientY, t: 0, hue: Math.random() * 360 })
})

// ── Text corpus ──
const TEXTS = [
  'In the beginning there was the void and the void was without form',
  'Stars are furnaces where hydrogen dreams become helium reality',
  'Every atom in your body was forged in the belly of a dying star',
  'The universe is under no obligation to make sense to you',
  'We are a way for the cosmos to know itself',
  'Look again at that dot — that is here that is home that is us',
  'The nitrogen in our DNA the calcium in our teeth the iron in our blood',
  'Somewhere something incredible is waiting to be known',
  'The cosmos is all that is or was or ever will be',
  'We are made of star-stuff contemplating star-stuff',
  'There are more stars than grains of sand on every beach on Earth',
  'Time is what keeps everything from happening at once',
  'Space is big really big you just will not believe how vastly hugely mind-bogglingly big it is',
  'In the vast cosmic arena the Earth is a very small stage',
  'For small creatures such as we the vastness is bearable only through love',
  'Not only is the universe stranger than we imagine it is stranger than we can imagine',
  'Two things are infinite the universe and human stupidity',
]

const STAR_CHARS = '.·*+°'
const PLANET_NAMES = ['MERCURY', 'VENUS', 'EARTH', 'MARS', 'JUPITER', 'SATURN']

// ── Font ──
const BODY_FONT = '14px "Iowan Old Style", "Palatino Linotype", Palatino, serif'

// ── Star field (simple dots, not text) ──
type Star = { x: number; y: number; z: number; size: number; twinkleOffset: number; brightness: number }
const stars: Star[] = []
for (let i = 0; i < 400; i++) {
  stars.push({
    x: (Math.random() - 0.5) * 3000,
    y: (Math.random() - 0.5) * 3000,
    z: Math.random() * 3,
    size: 0.5 + Math.random() * 2,
    twinkleOffset: Math.random() * Math.PI * 2,
    brightness: 0.3 + Math.random() * 0.7,
  })
}

// ── Planets ──
type Planet = {
  orbitRadius: number
  orbitSpeed: number
  orbitOffset: number
  radius: number
  hue: number
  name: string
  text: string
  ringCount: number
  prepared?: PreparedTextWithSegments
  tilt: number
  textureDirty: boolean
}

const planets: Planet[] = []
for (let i = 0; i < 6; i++) {
  planets.push({
    orbitRadius: 140 + i * 110,
    orbitSpeed: 0.08 + (5 - i) * 0.018,
    orbitOffset: Math.random() * Math.PI * 2,
    radius: 20 + Math.random() * 25,
    hue: [30, 180, 210, 10, 35, 250][i]!,
    name: PLANET_NAMES[i]!,
    text: TEXTS[i]!,
    ringCount: i === 4 ? 2 : (i === 3 ? 1 : 0),
    tilt: 0.3 + Math.random() * 0.4,
    textureDirty: true,
  })
}

// ── Nebulae (just glows, no per-word text) ──
type Nebula = { x: number; y: number; radius: number; hue: number }
const nebulae: Nebula[] = []
for (let i = 0; i < 3; i++) {
  const angle = (i / 3) * Math.PI * 2 + Math.random() * 0.5
  nebulae.push({
    x: Math.cos(angle) * 500 + (Math.random() - 0.5) * 200,
    y: Math.sin(angle) * 400 + (Math.random() - 0.5) * 200,
    radius: 120 + Math.random() * 80,
    hue: [280, 340, 200][i]!,
  })
}

// ── Shooting stars ──
type ShootingStar = { x: number; y: number; vx: number; vy: number; text: string; life: number; maxLife: number }
const shootingStars: ShootingStar[] = []

// ── Pretext preparation ──
let ringPrepared: PreparedTextWithSegments | null = null
const orbitTextPrepared: PreparedTextWithSegments[] = []

document.fonts.ready.then(() => {
  const ringText = (TEXTS.join(' — ') + ' — ').repeat(2)
  ringPrepared = prepareWithSegments(ringText, BODY_FONT)

  for (let i = 0; i < planets.length; i++) {
    const p = planets[i]!
    const fullText = (p.text + ' ◆ ').repeat(8)
    const prepared = prepareWithSegments(fullText, BODY_FONT)
    orbitTextPrepared.push(prepared)
    p.prepared = prepared
  }

  requestAnimationFrame(loop)
})

// ── Rendering helpers ──
let time = 0

function worldToScreen(wx: number, wy: number): [number, number] {
  const cx = W / 2
  const cy = H / 2
  const mx = mouse.active ? (mouse.x - cx) * 0.03 : 0
  const my = mouse.active ? (mouse.y - cy) * 0.03 : 0
  return [cx + (wx - mx) * zoom, cy + (wy - my) * zoom]
}

// ── Stars: rendered as simple fillRect dots to offscreen canvas ──
function renderStarLayer(): void {
  if (!needsStarRedraw && zoom === prevZoom) return
  needsStarRedraw = false

  starCanvas.width = W * dpr
  starCanvas.height = H * dpr
  starCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  starCtx.clearRect(0, 0, W, H)

  for (let i = 0; i < stars.length; i++) {
    const s = stars[i]!
    const parallax = 0.3 + s.z * 0.4
    const sx = W / 2 + s.x * zoom * parallax
    const sy = H / 2 + s.y * zoom * parallax
    if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue

    const size = s.size * zoom * (0.5 + s.z * 0.3)
    const alpha = s.brightness * (0.2 + s.z * 0.3)
    starCtx.globalAlpha = alpha
    starCtx.fillStyle = '#d4cfc5'
    starCtx.beginPath()
    starCtx.arc(sx, sy, Math.max(0.4, size * 0.5), 0, Math.PI * 2)
    starCtx.fill()
  }
  starCtx.globalAlpha = 1
}

function drawStarField(): void {
  // Composite the cached star layer with slight parallax shift from mouse
  const mx = mouse.active ? -(mouse.x - W / 2) * 0.015 : 0
  const my = mouse.active ? -(mouse.y - H / 2) * 0.015 : 0
  ctx.drawImage(starCanvas, mx * dpr, my * dpr, starCanvas.width, starCanvas.height, mx, my, W, H)
}

// ── Pre-render planet texture (text filling a circle) ──
function renderPlanetTexture(planet: Planet, index: number): OffscreenCanvas {
  const prepared = orbitTextPrepared[index]
  const r = planet.radius
  const size = Math.ceil(r * 2 + 4)
  const oc = new OffscreenCanvas(size * 2, size * 2) // 2x for quality
  const octx = oc.getContext('2d')!
  octx.scale(2, 2)

  if (!prepared) return oc

  const centerX = r + 2
  const centerY = r + 2
  let cursor = { segmentIndex: 0, graphemeIndex: 0 }
  const lineH = 10
  const startY = centerY - r + lineH * 0.5

  const maxLines = Math.floor((r * 2) / lineH)
  for (let l = 0; l < maxLines; l++) {
    const ly = startY + l * lineH
    const dist = Math.abs(ly - centerY)
    if (dist >= r) continue

    const halfChord = Math.sqrt(r * r - dist * dist)
    const lineWidth = halfChord * 2
    if (lineWidth < 12) continue

    const line = layoutNextLine(prepared, cursor, lineWidth)
    if (!line) break

    octx.font = '8px "Iowan Old Style", "Palatino Linotype", Palatino, serif'
    octx.textAlign = 'center'
    octx.textBaseline = 'middle'

    const distNorm = dist / r
    const alpha = 0.6 + 0.4 * (1 - distNorm * distNorm)
    octx.fillStyle = `hsla(${planet.hue}, 60%, 78%, ${alpha})`
    octx.fillText(line.text, centerX, ly)
    cursor = line.end
  }

  return oc
}

// ── Nebulae: just gradient glows ──
function drawNebulae(): void {
  for (let i = 0; i < nebulae.length; i++) {
    const n = nebulae[i]!
    const [nx, ny] = worldToScreen(n.x, n.y)
    const r = n.radius * zoom

    if (nx + r < 0 || nx - r > W || ny + r < 0 || ny - r > H) continue

    const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, r)
    grad.addColorStop(0, `hsla(${n.hue}, 60%, 40%, 0.07)`)
    grad.addColorStop(0.6, `hsla(${n.hue + 20}, 50%, 30%, 0.03)`)
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.fillRect(nx - r, ny - r, r * 2, r * 2)
  }
}

// ── Orbital path lines ──
function drawOrbitalRings(): void {
  const [cx, cy] = worldToScreen(0, 0)
  ctx.setLineDash([2, 8])
  ctx.lineWidth = 0.5
  for (let i = 0; i < planets.length; i++) {
    const r = planets[i]!.orbitRadius * zoom
    ctx.strokeStyle = `hsla(0, 0%, 40%, 0.06)`
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * 0.4, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.setLineDash([])
}

// ── Text along orbit: render as a single fillText string, not per-char ──
function drawTextAlongOrbit(planet: Planet): void {
  if (!planet.prepared) return
  const [cx, cy] = worldToScreen(0, 0)
  const orbitR = planet.orbitRadius * zoom
  const orbitRY = orbitR * 0.4

  // Render a few words at discrete positions around the orbit
  const segmentCount = 8
  const orbitOffset = time * planet.orbitSpeed * 0.01 + planet.orbitOffset
  const fontSize = Math.max(7, 9 * zoom)
  ctx.font = `${fontSize}px "Iowan Old Style", Palatino, serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  let cursor = { segmentIndex: 0, graphemeIndex: 0 }
  for (let s = 0; s < segmentCount; s++) {
    const angle = orbitOffset + (s / segmentCount) * Math.PI * 2
    const px = cx + Math.cos(angle) * orbitR
    const py = cy + Math.sin(angle) * orbitRY

    if (px < -100 || px > W + 100 || py < -50 || py > H + 50) continue

    const line = layoutNextLine(planet.prepared, cursor, 80 * zoom)
    if (!line) break

    const alpha = 0.06 + 0.08 * Math.sin(time * 0.01 + s * 1.2)
    ctx.fillStyle = `hsla(${planet.hue}, 35%, 65%, ${alpha})`

    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(angle + Math.PI / 2)
    ctx.fillText(line.text, 0, 0)
    ctx.restore()

    cursor = line.end
  }
}

// ── Planet rendering ──
function drawPlanet(planet: Planet, index: number): void {
  const angle = time * planet.orbitSpeed * 0.01 + planet.orbitOffset
  const px = Math.cos(angle) * planet.orbitRadius
  const py = Math.sin(angle) * planet.orbitRadius * 0.4
  const [sx, sy] = worldToScreen(px, py)
  const r = planet.radius * zoom

  if (sx < -r * 5 || sx > W + r * 5 || sy < -r * 5 || sy > H + r * 5) return

  // Glow
  const glowR = r * 3
  const glow = ctx.createRadialGradient(sx, sy, r * 0.3, sx, sy, glowR)
  glow.addColorStop(0, `hsla(${planet.hue}, 70%, 50%, 0.12)`)
  glow.addColorStop(0.5, `hsla(${planet.hue}, 60%, 40%, 0.03)`)
  glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow
  ctx.fillRect(sx - glowR, sy - glowR, glowR * 2, glowR * 2)

  // Draw pre-rendered planet texture
  if (!planetTextures.has(index) || planet.textureDirty) {
    planetTextures.set(index, renderPlanetTexture(planet, index))
    planet.textureDirty = false
  }
  const tex = planetTextures.get(index)!
  const drawSize = (planet.radius + 2) * 2 * zoom
  ctx.drawImage(tex, sx - drawSize / 2, sy - drawSize / 2, drawSize, drawSize)

  // Planet name
  ctx.font = `700 ${Math.max(7, 10 * zoom)}px "Helvetica Neue", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = `hsla(${planet.hue}, 50%, 70%, 0.35)`
  ctx.fillText(planet.name, sx, sy + r + 8 * zoom)

  // Saturn-style text rings (few words, not per-char)
  for (let ring = 0; ring < planet.ringCount; ring++) {
    const ringR = r * (1.6 + ring * 0.4)
    const ringRY = ringR * planet.tilt
    const ringFontSize = Math.max(5, 6 * zoom)
    ctx.font = `${ringFontSize}px "Iowan Old Style", Palatino, serif`

    // Render 6 word chunks around the ring instead of per-character
    const chunks = 6
    for (let c = 0; c < chunks; c++) {
      const charAngle = time * 0.006 * (ring % 2 === 0 ? 1 : -1) + (c / chunks) * Math.PI * 2
      const rx = sx + Math.cos(charAngle) * ringR
      const ry = sy + Math.sin(charAngle) * ringRY

      const alpha = 0.1 + 0.1 * Math.sin(charAngle * 2)
      ctx.fillStyle = `hsla(${planet.hue + ring * 30}, 40%, 65%, ${alpha})`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      ctx.save()
      ctx.translate(rx, ry)
      ctx.rotate(charAngle + Math.PI / 2)
      const word = planet.text.split(' ')[c % planet.text.split(' ').length] ?? '·'
      ctx.fillText(word, 0, 0)
      ctx.restore()
    }
  }
}

// ── Sun ──
function drawSun(): void {
  const [sx, sy] = worldToScreen(0, 0)
  const baseR = 50 * zoom
  const pulseR = baseR + Math.sin(time * 0.02) * 4 * zoom

  // Corona (just 2 layers)
  for (let layer = 1; layer >= 0; layer--) {
    const lr = pulseR * (1 + layer * 1.2)
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, lr)
    const a = 0.05 / (layer + 1)
    grad.addColorStop(0, `hsla(40, 100%, 70%, ${a * 3})`)
    grad.addColorStop(0.4, `hsla(30, 90%, 60%, ${a * 1.5})`)
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.fillRect(sx - lr, sy - lr, lr * 2, lr * 2)
  }

  // Sun text surface (using pretext layout into circle)
  if (ringPrepared) {
    let cursor = { segmentIndex: 0, graphemeIndex: 0 }
    const lineH = Math.max(8, 10 * zoom)
    const lineCount = Math.floor((pulseR * 2) / lineH)
    const fontSize = Math.max(6, 8 * zoom)
    ctx.font = `700 ${fontSize}px "Helvetica Neue", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let l = 0; l < lineCount; l++) {
      const ly = sy - pulseR + l * lineH + lineH * 0.5
      const dist = Math.abs(ly - sy)
      if (dist >= pulseR) continue

      const halfChord = Math.sqrt(pulseR * pulseR - dist * dist)
      if (halfChord * 2 < 10) continue

      const line = layoutNextLine(ringPrepared, cursor, halfChord * 2)
      if (!line) break

      const distNorm = dist / pulseR
      const flicker = 0.6 + 0.4 * Math.sin(time * 0.04 + l * 1.5)
      ctx.fillStyle = `hsla(${35 + l * 2}, 90%, ${65 + (1 - distNorm) * 25}%, ${flicker * (1 - distNorm * 0.4)})`
      ctx.fillText(line.text, sx, ly)
      cursor = line.end
    }
  }

  // Label
  ctx.font = `700 ${Math.max(8, 12 * zoom)}px "Helvetica Neue", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'hsla(40, 80%, 70%, 0.25)'
  ctx.fillText('SOL', sx, sy + pulseR + 10 * zoom)
}

// ── Shooting stars ──
function drawShootingStars(): void {
  if (Math.random() < 0.005 && shootingStars.length < 2) {
    const angle = Math.random() * Math.PI * 2
    const speed = 4 + Math.random() * 4
    const words = TEXTS[Math.floor(Math.random() * TEXTS.length)]!.split(' ')
    shootingStars.push({
      x: (Math.random() - 0.5) * 2000,
      y: (Math.random() - 0.5) * 2000,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      text: words.slice(0, 2 + Math.floor(Math.random() * 3)).join(' '),
      life: 0,
      maxLife: 80 + Math.random() * 50,
    })
  }

  for (let i = shootingStars.length - 1; i >= 0; i--) {
    const s = shootingStars[i]!
    s.x += s.vx; s.y += s.vy; s.life++
    if (s.life > s.maxLife) { shootingStars.splice(i, 1); continue }

    const [sx, sy] = worldToScreen(s.x, s.y)
    const lifeRatio = s.life / s.maxLife
    const alpha = lifeRatio < 0.1 ? lifeRatio * 10 : (1 - lifeRatio)
    const angle = Math.atan2(s.vy, s.vx)

    // Simple tail line
    const tailLen = 40 * zoom
    ctx.strokeStyle = `hsla(40, 80%, 80%, ${alpha * 0.3})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx - Math.cos(angle) * tailLen, sy - Math.sin(angle) * tailLen)
    ctx.stroke()

    // Text
    ctx.font = `${Math.max(8, 11 * zoom)}px "Iowan Old Style", Palatino, serif`
    ctx.fillStyle = `hsla(40, 90%, 90%, ${alpha})`
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(angle)
    ctx.textAlign = 'left'
    ctx.fillText(s.text, 4, 0)
    ctx.restore()
  }
}

// ── Supernovae ──
function drawSupernovae(): void {
  for (let i = supernovae.length - 1; i >= 0; i--) {
    const sn = supernovae[i]!
    sn.t++
    if (sn.t > 100) { supernovae.splice(i, 1); continue }

    const progress = sn.t / 100
    const r = (1 - Math.pow(1 - progress, 3)) * 180 * zoom
    const alpha = (1 - progress) * 0.5

    // Ring
    ctx.strokeStyle = `hsla(${sn.hue}, 80%, 70%, ${alpha * 0.4})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(sn.x, sn.y, r, 0, Math.PI * 2)
    ctx.stroke()

    // Glow
    const grad = ctx.createRadialGradient(sn.x, sn.y, 0, sn.x, sn.y, r)
    grad.addColorStop(0, `hsla(${sn.hue}, 90%, 90%, ${alpha * 0.25})`)
    grad.addColorStop(0.6, `hsla(${sn.hue + 30}, 70%, 60%, ${alpha * 0.06})`)
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.fillRect(sn.x - r, sn.y - r, r * 2, r * 2)

    // Word fragments flying out (8 instead of 12)
    ctx.font = `${Math.max(7, 10 * zoom)}px "Iowan Old Style", Palatino, serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let f = 0; f < 8; f++) {
      const fa = (f / 8) * Math.PI * 2 + sn.t * 0.015
      const fd = r * (0.4 + (f % 3) * 0.2)
      ctx.fillStyle = `hsla(${sn.hue + f * 25}, 70%, 75%, ${alpha})`
      const word = TEXTS[f % TEXTS.length]!.split(' ')[f % 5] ?? '*'
      ctx.fillText(word, sn.x + Math.cos(fa) * fd, sn.y + Math.sin(fa) * fd)
    }
  }
}

// ── Cursor glow ──
function drawCursorGlow(): void {
  if (!mouse.active) return
  const r = 60 * zoom
  const grad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, r)
  grad.addColorStop(0, 'hsla(220, 60%, 60%, 0.05)')
  grad.addColorStop(1, 'transparent')
  ctx.fillStyle = grad
  ctx.fillRect(mouse.x - r, mouse.y - r, r * 2, r * 2)
}

// ── Main loop ──
function loop(): void {
  time++
  ctx.clearRect(0, 0, W, H)

  // Background
  ctx.fillStyle = '#010108'
  ctx.fillRect(0, 0, W, H)

  // Subtle center glow
  const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 400 * zoom)
  bgGrad.addColorStop(0, 'hsla(240, 30%, 12%, 0.4)')
  bgGrad.addColorStop(1, 'transparent')
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, W, H)

  renderStarLayer()
  drawStarField()
  drawNebulae()
  drawOrbitalRings()

  for (let i = 0; i < planets.length; i++) {
    drawTextAlongOrbit(planets[i]!)
  }

  drawSun()

  for (let i = 0; i < planets.length; i++) {
    drawPlanet(planets[i]!, i)
  }

  drawShootingStars()
  drawSupernovae()
  drawCursorGlow()

  prevZoom = zoom
  requestAnimationFrame(loop)
}
