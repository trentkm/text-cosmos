import { prepareWithSegments, layoutNextLine, type LayoutCursor } from '@chenglou/pretext'

// ── Device ──
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 0 && window.innerWidth < 900)

// ── DOM ──
const searchScreen = document.getElementById('search-screen')!
const searchInput = document.getElementById('search-input') as HTMLInputElement
const searchResults = document.getElementById('search-results')!
const searchLoading = document.getElementById('search-loading')!
const loadingOverlay = document.getElementById('loading-overlay')!
const loadingText = document.getElementById('loading-text')!
const bookReader = document.getElementById('book-reader')!
const tome = document.getElementById('tome')!
const tomeContent = document.getElementById('tome-content')!
const tomeBody = document.getElementById('tome-body')!
const tomePagenum = document.getElementById('tome-pagenum')!
const chapterTitle = document.getElementById('chapter-title')!
const pageIndicator = document.getElementById('page-indicator')!
const spawnZone = document.getElementById('spawn-zone')!
const artCanvas = document.getElementById('art-canvas') as HTMLCanvasElement
const artCtx = artCanvas.getContext('2d')!
const btnBack = document.getElementById('btn-back')!
const btnPrev = document.getElementById('btn-prev')!
const btnNext = document.getElementById('btn-next')!
const btnAuto = document.getElementById('btn-auto')!
const btnArt = document.getElementById('btn-art')!
const bentoGrid = document.getElementById('bento-grid')!
const suggestionsLabel = document.getElementById('suggestions-label')!

// ── State ──
let appState: 'search' | 'loading' | 'reading' = 'search'
let bookTitle = ''
let pages: string[][] = []
let currentPage = 0
let autoInterval: ReturnType<typeof setInterval> | null = null
let isAuto = false
let artMode = false

// ── ASCII Art System ──
const ASCII_ART = [
  // dragon
  `    /\\___/\\
   ( o   o )
   (  =^=  )
    )     (
   (       )
  ( |     | )
 (__|     |__)`,
  // skull
  `   .-.
  (O.O)
  |=O=|
   \\_/`,
  // bird
  `     _
   __/ \\__
  \\  . .  /
   \\_-_/
    / \\
   /   \\`,
  // sword
  `    /\\
   /  \\
  / || \\
  | || |
  | || |
   \\||/
    ||
    ||
   /||\\
   \\||/`,
  // star
  `    .
   / \\
  / _ \\
 |/ . \\|
  \\ _ /
   \\ /
    '`,
  // owl
  `  ,_,
 (O,O)
 (   )
 -"-"-`,
  // key
  `  o
 /|\\
  |
 -+-
  |
 |||
 |||`,
  // cat
  `/\\_/\\
( o.o )
 > ^ <
/|   |\\`,
  // crown
  ` /\\ /\\ /\\
|  V  V  |
|        |
 \\______/`,
  // potion
  `   _
  | |
 /   \\
|~~~~~|
|     |
 \\___/`,
]

type FlyingArt = {
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  rotSpeed: number
  lines: string[]
  alpha: number
  maxAlpha: number
  fadeIn: boolean
  life: number
  maxLife: number
  scale: number
  hue: number
}

const flyingArt: FlyingArt[] = []

function spawnArt(x?: number, y?: number): void {
  const art = ASCII_ART[Math.floor(Math.random() * ASCII_ART.length)]!
  const lines = art.split('\n')
  const W = artCanvas.width / (window.devicePixelRatio || 1)
  const H = artCanvas.height / (window.devicePixelRatio || 1)

  const spawnX = x ?? (Math.random() < 0.5 ? -60 : W + 60)
  const spawnY = y ?? (Math.random() * H * 0.7 + H * 0.1)

  flyingArt.push({
    x: spawnX,
    y: spawnY,
    vx: (x !== undefined ? (Math.random() - 0.5) * 1.5 : (spawnX < 0 ? 0.4 + Math.random() * 0.6 : -0.4 - Math.random() * 0.6)),
    vy: -0.2 + Math.random() * 0.4,
    rotation: (Math.random() - 0.5) * 0.3,
    rotSpeed: (Math.random() - 0.5) * 0.003,
    lines,
    alpha: 0,
    maxAlpha: 0.15 + Math.random() * 0.2,
    fadeIn: true,
    life: 0,
    maxLife: x !== undefined ? 300 + Math.random() * 200 : 600 + Math.random() * 400,
    scale: 0.7 + Math.random() * 0.6,
    hue: Math.random() * 60 + 20, // warm browns/golds
  })
}

// Auto-spawn art periodically
setInterval(() => {
  if (appState === 'reading' && flyingArt.length < (isMobile ? 3 : 6)) {
    spawnArt()
  }
}, 3000)

// ── Dust particles ──
type Dust = { x: number; y: number; vx: number; vy: number; alpha: number; size: number }
const dustParticles: Dust[] = []

function spawnDust(): void {
  const W = artCanvas.width / (window.devicePixelRatio || 1)
  const H = artCanvas.height / (window.devicePixelRatio || 1)
  dustParticles.push({
    x: Math.random() * W,
    y: H + 5,
    vx: (Math.random() - 0.5) * 0.3,
    vy: -0.3 - Math.random() * 0.5,
    alpha: Math.random() * 0.15,
    size: 1 + Math.random() * 2,
  })
}

// ── Art canvas rendering ──
function resizeArtCanvas(): void {
  const dpr = window.devicePixelRatio || 1
  artCanvas.width = tome.clientWidth * dpr
  artCanvas.height = tome.clientHeight * dpr
  artCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function renderArt(): void {
  if (appState !== 'reading') return

  const W = artCanvas.width / (window.devicePixelRatio || 1)
  const H = artCanvas.height / (window.devicePixelRatio || 1)
  artCtx.clearRect(0, 0, W, H)

  // Dust
  if (Math.random() < 0.15) spawnDust()
  for (let i = dustParticles.length - 1; i >= 0; i--) {
    const d = dustParticles[i]!
    d.x += d.vx
    d.y += d.vy
    d.alpha -= 0.0003
    if (d.y < -10 || d.alpha <= 0) { dustParticles.splice(i, 1); continue }

    artCtx.fillStyle = `rgba(180, 160, 120, ${d.alpha})`
    artCtx.beginPath()
    artCtx.arc(d.x, d.y, d.size, 0, Math.PI * 2)
    artCtx.fill()
  }

  // Flying ASCII art
  for (let i = flyingArt.length - 1; i >= 0; i--) {
    const a = flyingArt[i]!
    a.x += a.vx
    a.y += a.vy
    a.rotation += a.rotSpeed
    a.life++

    // Fade in/out
    if (a.fadeIn) {
      a.alpha += 0.003
      if (a.alpha >= a.maxAlpha) { a.alpha = a.maxAlpha; a.fadeIn = false }
    }
    if (a.life > a.maxLife - 80) {
      a.alpha -= a.maxAlpha / 80
    }
    if (a.life > a.maxLife || a.alpha <= 0 || a.x < -200 || a.x > W + 200) {
      flyingArt.splice(i, 1)
      continue
    }

    artCtx.save()
    artCtx.translate(a.x, a.y)
    artCtx.rotate(a.rotation)
    artCtx.scale(a.scale, a.scale)
    artCtx.font = `${isMobile ? 10 : 13}px "Courier New", monospace`
    artCtx.fillStyle = `hsla(${a.hue}, 30%, 35%, ${a.alpha})`
    artCtx.textAlign = 'center'
    artCtx.textBaseline = 'middle'

    const lineH = isMobile ? 12 : 15
    const startY = -(a.lines.length * lineH) / 2
    for (let l = 0; l < a.lines.length; l++) {
      artCtx.fillText(a.lines[l]!, 0, startY + l * lineH)
    }
    artCtx.restore()
  }

  requestAnimationFrame(renderArt)
}

// ── Suggestions ──
const SUGGESTIONS = [
  { id: 84, title: 'Frankenstein', author: 'Mary Shelley', head: 'Gothic Horror', quote: '"I beheld the wretch — the miserable monster whom I had created."', tall: true },
  { id: 11, title: 'Alice in Wonderland', author: 'Lewis Carroll', head: 'Fantasy', quote: '"Curiouser and curiouser!"', tall: false },
  { id: 345, title: 'Dracula', author: 'Bram Stoker', head: 'Horror', quote: '"The blood is the life!"', tall: false },
  { id: 1342, title: 'Pride and Prejudice', author: 'Jane Austen', head: 'Romance', quote: '"It is a truth universally acknowledged..."', tall: true },
  { id: 1661, title: 'Sherlock Holmes', author: 'Arthur Conan Doyle', head: 'Mystery', quote: '', tall: false },
  { id: 2701, title: 'Moby Dick', author: 'Herman Melville', head: 'Adventure', quote: '"Call me Ishmael."', tall: false },
  { id: 1232, title: 'The Prince', author: 'Machiavelli', head: 'Philosophy', quote: '', tall: false },
  { id: 98, title: 'A Tale of Two Cities', author: 'Charles Dickens', head: 'Historical', quote: '"It was the best of times, it was the worst of times..."', tall: true },
  { id: 174, title: 'Dorian Gray', author: 'Oscar Wilde', head: 'Gothic Fiction', quote: '', tall: false },
]

function showSuggestions(): void {
  bentoGrid.innerHTML = ''
  suggestionsLabel.style.display = ''
  bentoGrid.style.display = ''
  for (const s of SUGGESTIONS) {
    const div = document.createElement('div')
    div.className = `bento-card${s.tall ? ' tall' : ''}`
    div.innerHTML = `
      <div class="card-head">${esc(s.head)}</div>
      <div class="card-title">${esc(s.title)}</div>
      <div class="card-author">${esc(s.author)}</div>
      ${s.quote ? `<div class="card-quote">${esc(s.quote)}</div>` : ''}
    `
    div.addEventListener('click', () => selectBook({
      id: s.id, title: s.title,
      formats: { 'text/plain; charset=utf-8': `https://www.gutenberg.org/ebooks/${s.id}.txt.utf-8` },
    }))
    bentoGrid.appendChild(div)
  }
}

function hideSuggestions(): void {
  suggestionsLabel.style.display = 'none'
  bentoGrid.style.display = 'none'
}

showSuggestions()

// ── Search ──
let searchTimeout: ReturnType<typeof setTimeout> | null = null
searchInput.addEventListener('input', () => {
  if (searchTimeout) clearTimeout(searchTimeout)
  const q = searchInput.value.trim()
  if (q.length < 2) {
    searchResults.innerHTML = ''; searchResults.classList.remove('active')
    searchLoading.textContent = ''; showSuggestions(); return
  }
  hideSuggestions(); searchResults.classList.add('active')
  searchLoading.textContent = 'Searching...'
  searchTimeout = setTimeout(() => searchBooks(q), 350)
})

searchScreen.addEventListener('touchstart', e => e.stopPropagation())
searchScreen.addEventListener('touchmove', e => e.stopPropagation())
searchScreen.addEventListener('touchend', e => e.stopPropagation())

async function searchBooks(query: string): Promise<void> {
  try {
    const res = await fetch(`https://gutendex.com/books/?search=${encodeURIComponent(query)}&languages=en`)
    const data = await res.json()
    searchLoading.textContent = ''; searchResults.innerHTML = ''
    const books = data.results?.slice(0, 12) ?? []
    if (books.length === 0) { searchLoading.textContent = 'No books found.'; return }
    for (const book of books) {
      const authors = (book.authors ?? []).map((a: any) => a.name).join(', ')
      const div = document.createElement('div')
      div.className = 'result-item'
      div.innerHTML = `<div class="result-title">${esc(book.title)}</div>
        <div class="result-author">${esc(authors || 'Unknown')}</div>`
      div.addEventListener('click', () => selectBook(book))
      searchResults.appendChild(div)
    }
  } catch { searchLoading.textContent = 'Search failed.' }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Book loading ──
async function selectBook(book: any): Promise<void> {
  appState = 'loading'
  searchScreen.classList.add('hiding')
  setTimeout(() => searchScreen.classList.add('hidden'), 500)
  loadingOverlay.classList.add('active')
  loadingText.textContent = `Summoning "${book.title}"...`

  try {
    const formats = book.formats ?? {}
    let textUrl = formats['text/plain; charset=utf-8'] ?? formats['text/plain']
      ?? formats['text/plain; charset=us-ascii']
    if (!textUrl) textUrl = `https://www.gutenberg.org/ebooks/${book.id}.txt.utf-8`

    const res = await fetch(`/api/text?url=${encodeURIComponent(textUrl)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    let text = await res.text()

    for (const m of ['*** START OF THE PROJECT GUTENBERG', '*** START OF THIS PROJECT GUTENBERG']) {
      const idx = text.indexOf(m)
      if (idx !== -1) { text = text.slice(text.indexOf('\n', idx) + 1); break }
    }
    for (const m of ['*** END OF THE PROJECT GUTENBERG', '*** END OF THIS PROJECT GUTENBERG', '***END OF THE PROJECT GUTENBERG']) {
      const idx = text.indexOf(m)
      if (idx !== -1) { text = text.slice(0, idx); break }
    }

    bookTitle = book.title
    paginateBook(text.trim())
    openReader()
  } catch {
    loadingText.textContent = 'The tome resists. Try another.'
    setTimeout(() => {
      loadingOverlay.classList.remove('active')
      searchScreen.classList.remove('hiding', 'hidden')
      appState = 'search'
    }, 2000)
  }
}

// ── Pagination ──
const FONT_FAMILY = '"Cormorant Garamond", "IM Fell English", Georgia, serif'

function paginateBook(text: string): void {
  const fontSize = isMobile ? 15 : 18
  const lineHeight = fontSize * 1.75
  const font = `${fontSize}px ${FONT_FAMILY}`

  const contentW = Math.min(580, window.innerWidth - 80)
  const contentH = tome.clientHeight - 90 // top + bottom padding
  const linesPerPage = Math.floor(contentH / lineHeight)

  // Clean paragraphs
  const paragraphs = text.split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(p => p.length > 0)
  const fullText = paragraphs.join('\n\n')

  const prepared = prepareWithSegments(fullText, font)
  pages = []

  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let safety = 0

  while (safety < 10000) {
    safety++
    const pageLines: string[] = []
    let linesUsed = 0

    while (linesUsed < linesPerPage) {
      const line = layoutNextLine(prepared, cursor, contentW)
      if (!line) { cursor = { segmentIndex: -1, graphemeIndex: 0 }; break }
      pageLines.push(line.text)
      cursor = line.end
      linesUsed++
    }

    if (pageLines.length === 0) break
    pages.push(pageLines)
    if (cursor.segmentIndex === -1) break
  }
}

function openReader(): void {
  loadingOverlay.classList.remove('active')
  bookReader.classList.add('active')
  currentPage = 0
  resizeArtCanvas()
  renderPage()
  appState = 'reading'
  requestAnimationFrame(renderArt)

  // Spawn initial art
  setTimeout(() => spawnArt(), 500)
  setTimeout(() => spawnArt(), 1500)
}

function renderPage(): void {
  if (currentPage >= pages.length) return
  const lines = pages[currentPage]!

  chapterTitle.textContent = bookTitle
  tomeBody.innerHTML = ''

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i]!

    // Drop cap on first page first line
    if (currentPage === 0 && i === 0 && lineText.length > 0) {
      const match = lineText.match(/^\s*(\S)([\s\S]*)$/)
      if (match) {
        const span = document.createElement('span')
        span.className = 'line'
        const dc = document.createElement('span')
        dc.className = 'drop-cap'
        dc.textContent = match[1]!
        span.appendChild(dc)
        span.appendChild(document.createTextNode(match[2]!))
        tomeBody.appendChild(span)
        continue
      }
    }

    const span = document.createElement('span')
    span.className = 'line'
    span.textContent = lineText
    tomeBody.appendChild(span)
  }

  // Page number with ornament
  tomePagenum.textContent = `— ${currentPage + 1} —`
  pageIndicator.textContent = `${currentPage + 1} / ${pages.length}`
}

// ── Navigation ──
function nextPage(): void {
  if (currentPage < pages.length - 1) { currentPage++; renderPage() }
}
function prevPage(): void {
  if (currentPage > 0) { currentPage--; renderPage() }
}

btnNext.addEventListener('click', nextPage)
btnPrev.addEventListener('click', prevPage)

// Click zones on page
spawnZone.addEventListener('click', e => {
  const rect = spawnZone.getBoundingClientRect()
  const x = e.clientX - rect.left
  const half = rect.width / 2

  if (artMode) {
    // Spawn art at click point
    spawnArt(x, e.clientY - rect.top)
  } else {
    if (x > half) nextPage()
    else prevPage()
  }
})

// Swipe
let touchStartX = 0
spawnZone.addEventListener('touchstart', e => {
  touchStartX = e.touches[0]!.clientX
}, { passive: true })
spawnZone.addEventListener('touchend', e => {
  const dx = (e.changedTouches[0]?.clientX ?? touchStartX) - touchStartX
  if (artMode && Math.abs(dx) < 20) {
    const rect = spawnZone.getBoundingClientRect()
    const t = e.changedTouches[0]!
    spawnArt(t.clientX - rect.left, t.clientY - rect.top)
    return
  }
  if (Math.abs(dx) > 50) {
    if (dx < 0) nextPage(); else prevPage()
  }
}, { passive: true })

// Keyboard
window.addEventListener('keydown', e => {
  if (appState !== 'reading') return
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); nextPage() }
  else if (e.key === 'ArrowLeft') prevPage()
  else if (e.key === 'Escape') goBack()
  else if (e.key === 'a') toggleArtMode()
})

// Auto-flip
btnAuto.addEventListener('click', () => {
  if (isAuto) { stopAuto() } else {
    isAuto = true; btnAuto.classList.add('active'); btnAuto.textContent = 'Stop'
    autoInterval = setInterval(() => {
      if (currentPage < pages.length - 1) nextPage(); else stopAuto()
    }, 3500)
  }
})
function stopAuto(): void {
  isAuto = false; btnAuto.classList.remove('active'); btnAuto.textContent = 'Auto'
  if (autoInterval) { clearInterval(autoInterval); autoInterval = null }
}

// Art mode toggle
function toggleArtMode(): void {
  artMode = !artMode
  btnArt.classList.toggle('active', artMode)
  spawnZone.style.cursor = artMode ? 'cell' : 'crosshair'
}
btnArt.addEventListener('click', toggleArtMode)

// Back
function goBack(): void {
  stopAuto(); artMode = false; btnArt.classList.remove('active')
  appState = 'search'
  bookReader.classList.remove('active')
  searchScreen.classList.remove('hiding', 'hidden')
  pages = []; currentPage = 0; flyingArt.length = 0; dustParticles.length = 0
  searchInput.value = ''; searchResults.innerHTML = ''
  searchResults.classList.remove('active'); showSuggestions(); searchInput.focus()
}
btnBack.addEventListener('click', goBack)

// Resize
window.addEventListener('resize', () => {
  if (appState === 'reading') resizeArtCanvas()
})

searchInput.focus()
