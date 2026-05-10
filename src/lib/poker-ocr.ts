import { createWorker, PSM } from "tesseract.js"

export interface PlayerInfo {
  position: string
  bb: number | null
  bbStale?: boolean // true when showing a previously detected value
  action: "fold" | number | null // "fold", bet amount, or null (not yet acted)
  isMe: boolean
  isTurn: boolean
  hasActed: boolean // turn has already passed this player this street
}

export type CardRank =
  | "A"
  | "K"
  | "Q"
  | "J"
  | "T"
  | "9"
  | "8"
  | "7"
  | "6"
  | "5"
  | "4"
  | "3"
  | "2"
  | null
export type CardSuit = "\u2660" | "\u2665" | "\u2666" | "\u2663" | null

export interface HoleCard {
  rank: CardRank
  suit: CardSuit
}

export interface Region {
  x: number // left edge, fraction of video width (0–1)
  y: number // top edge, fraction of video height (0–1)
  w: number // width fraction
  h: number // height fraction
}

// Each index is one seat slot (clockwise order, index 0–7)
export interface OcrRegions {
  dealerRegions: Region[] // up to 8, detect dealer button color
  bbRegions: Region[] // up to 8, OCR stack size
  totalRegion?: Region // single region, OCR total pot
  actionRegions: Region[] // up to 8, OCR current bet per player
  nameRegions: Region[] // up to 8, detect whose turn (countdown timer)
  cardRankRegions: Region[] // up to 2, OCR hole card rank (R1, R2)
  cardSuitRegions: Region[] // up to 2, pixel-analysis hole card suit (S1, S2)
  communityRankRegions: Region[] // up to 5, OCR community card rank (R3-R7)
  communitySuitRegions: Region[] // up to 5, pixel-analysis community card suit (S3-S7)
}

export type Street = "preflop" | "flop" | "turn" | "river"

export interface ExtractResult {
  players: PlayerInfo[]
  totalPot: number | null
  holeCards: [HoleCard, HoleCard]
  communityCards: HoleCard[]
  street: Street
}

// ---------------------------------------------------------------------------
// Dealer button color detection (no OCR needed)
// Button background: R 191 G 198 B 179  tolerance ±25
// ---------------------------------------------------------------------------
const DEALER_BG = { r: 191, g: 198, b: 179 }
const COLOR_TOLERANCE = 25
const MATCH_THRESHOLD = 0.12 // at least 12% of pixels must match

function isDealerButton(frame: HTMLCanvasElement, region: Region): boolean {
  const x = Math.max(0, Math.round(region.x * frame.width))
  const y = Math.max(0, Math.round(region.y * frame.height))
  const w = Math.min(
    frame.width - x,
    Math.max(1, Math.round(region.w * frame.width))
  )
  const h = Math.min(
    frame.height - y,
    Math.max(1, Math.round(region.h * frame.height))
  )
  const ctx = frame.getContext("2d")
  if (!ctx) return false
  const { data } = ctx.getImageData(x, y, w, h)
  let match = 0
  for (let i = 0; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - DEALER_BG.r) <= COLOR_TOLERANCE &&
      Math.abs(data[i + 1] - DEALER_BG.g) <= COLOR_TOLERANCE &&
      Math.abs(data[i + 2] - DEALER_BG.b) <= COLOR_TOLERANCE
    ) {
      match++
    }
  }
  return match / (w * h) >= MATCH_THRESHOLD
}

// ---------------------------------------------------------------------------
// Position labels by number of seats (clockwise from BTN)
// ---------------------------------------------------------------------------
const POSITIONS: Record<number, string[]> = {
  2: ["BTN", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "UTG"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "MP", "CO"],
  7: ["BTN", "SB", "BB", "UTG", "MP", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"],
}

// ---------------------------------------------------------------------------
// BB OCR worker singleton
// ---------------------------------------------------------------------------
let _workerBB: Awaited<ReturnType<typeof createWorker>> | null = null

async function getBBWorker() {
  if (_workerBB) return _workerBB
  _workerBB = await createWorker(["eng"], 1, { logger: () => {} })
  await _workerBB.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_WORD,
    tessedit_char_whitelist: "0123456789.B",
    user_defined_dpi: "150",
  })
  return _workerBB
}

let _workerRank: Awaited<ReturnType<typeof createWorker>> | null = null

async function getRankWorker() {
  if (_workerRank) return _workerRank
  _workerRank = await createWorker(["eng"], 1, { logger: () => {} })
  await _workerRank.setParameters({
    // SINGLE_WORD is more reliable for 1-2 character strings like card ranks
    tessedit_pageseg_mode: PSM.SINGLE_WORD,
    // Include 0 and 1 so "10" can be recognized before mapping to T
    tessedit_char_whitelist: "AKQJT0123456789",
    user_defined_dpi: "300",
  })
  return _workerRank
}

// ---------------------------------------------------------------------------
// Crop a region (no scaling) – scaling is handled per-use-case below
// ---------------------------------------------------------------------------
function cropToRegion(
  frame: HTMLCanvasElement,
  region: Region
): HTMLCanvasElement {
  const x = Math.max(0, Math.round(region.x * frame.width))
  const y = Math.max(0, Math.round(region.y * frame.height))
  const srcW = Math.min(
    frame.width - x,
    Math.max(1, Math.round(region.w * frame.width))
  )
  const srcH = Math.min(
    frame.height - y,
    Math.max(1, Math.round(region.h * frame.height))
  )
  // Scale up to at least 150 px tall for BB/action OCR
  const REGION_MIN_H = 150
  const scale = srcH < REGION_MIN_H ? REGION_MIN_H / srcH : 1
  const outW = Math.round(srcW * scale)
  const outH = Math.round(srcH * scale)
  const out = document.createElement("canvas")
  out.width = outW
  out.height = outH
  out.getContext("2d")!.drawImage(frame, x, y, srcW, srcH, 0, 0, outW, outH)
  return out
}

// ---------------------------------------------------------------------------
// Otsu's binarization threshold over a flat array of luminance values
// ---------------------------------------------------------------------------
function otsuThreshold(lums: number[]): number {
  if (lums.length === 0) return 128
  let min = Infinity,
    max = -Infinity
  for (const v of lums) {
    if (v < min) min = v
    if (v > max) max = v
  }
  if (max - min < 5) return (min + max) / 2

  const BINS = 256
  const hist = new Float32Array(BINS)
  const range = max - min
  for (const v of lums) {
    const bin = Math.min(BINS - 1, Math.floor(((v - min) / range) * (BINS - 1)))
    hist[bin]++
  }

  const total = lums.length
  let sum = 0
  for (let i = 0; i < BINS; i++) sum += i * hist[i]

  let sumB = 0,
    wB = 0
  let maxVar = 0,
    threshBin = 0
  for (let i = 0; i < BINS; i++) {
    wB += hist[i]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += i * hist[i]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const variance = wB * wF * (mB - mF) ** 2
    if (variance > maxVar) {
      maxVar = variance
      threshBin = i
    }
  }
  return min + (threshBin / (BINS - 1)) * range
}

// ---------------------------------------------------------------------------
// Crop + preprocess a rank region for Tesseract:
//   1. Scale up to at least RANK_TARGET_H pixels tall
//   2. Convert to grayscale
//   3. Otsu-threshold to clean B&W
//   4. Auto-invert so text is always dark on white
//   5. Add white padding so Tesseract doesn't clip characters
// ---------------------------------------------------------------------------
const RANK_TARGET_H = 300
const RANK_PAD = 24

function cropAndPreprocessRank(
  frame: HTMLCanvasElement,
  region: Region
): HTMLCanvasElement {
  const x = Math.max(0, Math.round(region.x * frame.width))
  const y = Math.max(0, Math.round(region.y * frame.height))
  const srcW = Math.min(
    frame.width - x,
    Math.max(1, Math.round(region.w * frame.width))
  )
  const srcH = Math.min(
    frame.height - y,
    Math.max(1, Math.round(region.h * frame.height))
  )

  // Step 1 – scale up
  const scale = Math.max(2, RANK_TARGET_H / srcH)
  const dw = Math.round(srcW * scale)
  const dh = Math.round(srcH * scale)
  const tmp = document.createElement("canvas")
  tmp.width = dw
  tmp.height = dh
  tmp.getContext("2d")!.drawImage(frame, x, y, srcW, srcH, 0, 0, dw, dh)

  // Step 2+3 – grayscale + Otsu threshold
  const ctx = tmp.getContext("2d")!
  const imgData = ctx.getImageData(0, 0, dw, dh)
  const pix = imgData.data
  const grays: number[] = []
  for (let i = 0; i < pix.length; i += 4) {
    grays.push(0.299 * pix[i] + 0.587 * pix[i + 1] + 0.114 * pix[i + 2])
  }
  const t = otsuThreshold(grays)

  // Step 4 – decide if we need to invert (dark bg → light text → invert)
  // Median luminance below threshold means the bg is darker than the text
  const sorted = grays.slice().sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const needsInvert = median < t

  for (let i = 0, j = 0; i < pix.length; i += 4, j++) {
    let v = grays[j] > t ? 255 : 0
    if (needsInvert) v = 255 - v
    pix[i] = pix[i + 1] = pix[i + 2] = v
    pix[i + 3] = 255
  }

  // Step 4.5 – remove isolated noise pixels (≤1 foreground neighbor)
  // Builds a binary map first, then removes speckle in a second pass
  const fgBin = new Uint8Array(dw * dh)
  for (let j = 0; j < dw * dh; j++) fgBin[j] = pix[j * 4] === 0 ? 1 : 0
  for (let py = 1; py < dh - 1; py++) {
    for (let px = 1; px < dw - 1; px++) {
      const j = py * dw + px
      if (!fgBin[j]) continue
      let n = 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if ((dy || dx) && fgBin[(py + dy) * dw + (px + dx)]) n++
      if (n <= 1) pix[j * 4] = pix[j * 4 + 1] = pix[j * 4 + 2] = 255
    }
  }

  ctx.putImageData(imgData, 0, 0)

  // Step 5 – add white padding
  const out = document.createElement("canvas")
  out.width = dw + RANK_PAD * 2
  out.height = dh + RANK_PAD * 2
  const outCtx = out.getContext("2d")!
  outCtx.fillStyle = "white"
  outCtx.fillRect(0, 0, out.width, out.height)
  outCtx.drawImage(tmp, RANK_PAD, RANK_PAD)
  return out
}

// ---------------------------------------------------------------------------
// Parse "28.2BB" / "28.2 BB" / "28.2" → number
// ---------------------------------------------------------------------------
function parseBB(text: string): number | null {
  const m = text.trim().match(/^([\d.]+)\s*B*$/)
  if (!m) return null
  const v = parseFloat(m[1])
  return isNaN(v) ? null : v
}

// Returns the seat index whose name region has the lowest bright-pixel ratio.
// When NOT on turn: name text (~196,204,207 gray) is visible → high bright ratio.
// When ON turn: colored timer replaces the name → low bright ratio.
function detectActiveSeatByBrightness(
  frame: HTMLCanvasElement,
  nameRegions: Region[]
): number {
  if (nameRegions.length === 0) return -1
  const ratios: number[] = nameRegions.map((r) => {
    const canvas = cropToRegion(frame, r)
    const ctx = canvas.getContext("2d")
    if (!ctx) return 1
    const { width, height } = canvas
    const { data } = ctx.getImageData(0, 0, width, height)
    let bright = 0,
      total = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue
      total++
      if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] >= 150)
        bright++
    }
    return total === 0 ? 1 : bright / total
  })
  const min = Math.min(...ratios)
  const minIdx = ratios.indexOf(min)
  // Turn seat has near-zero bright pixels (<1%). Non-turn seats show name text (≥2%).
  return min < 0.01 ? minIdx : -1
}

// Parse rank OCR output → canonical card rank
function parseRank(raw: string): CardRank {
  // Strip everything except alphanumeric
  const s = raw
    .trim()
    .toUpperCase()
    .replace(/[^AKQJT0-9]/g, "")
  if (!s) return null
  // "10" or common OCR misreads of 10
  if (s === "10" || s === "IO" || s === "1O" || s === "l0" || s === "lO")
    return "T"
  // Single-char lookup
  const ch = s[0]
  if ("AKQJT98765432".includes(ch)) return ch as CardRank
  return null
}

// ---------------------------------------------------------------------------
// Suit detection via row-width zone analysis
//
// Algorithm:
//   1. Otsu-threshold to separate fg (suit symbol) from bg
//   2. Classify fg pixels as red vs dark
//   3. Find tight fg bounding box (ignoring stray noise rows)
//   4. Compute average row width in two zones:
//        topZone = top 30% of fg height
//        midZone = 30–70% of fg height
//   5. Decision:
//      Red suits  → ♥ topZone ≥ midZone (lobes near top, narrows to a point)
//                 → ♦ midZone >  topZone (widest in the center)
//      Dark suits → ♠ midZone / topZone < 0.5  (lobes then narrow stem)
//                 → ♣ midZone / topZone ≥ 0.5  (3rd circle keeps middle wide)
// ---------------------------------------------------------------------------
function detectSuit(canvas: HTMLCanvasElement): CardSuit {
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  const { width, height } = canvas
  if (width < 4 || height < 4) return null
  const { data } = ctx.getImageData(0, 0, width, height)

  // Collect luminance values for Otsu
  const lums: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    lums.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
  }
  if (lums.length < 10) return null
  const threshold = otsuThreshold(lums)

  // Build fg mask + count red vs dark pixels
  let redCount = 0,
    darkCount = 0
  const fgMask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (data[i + 3] < 128) continue
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2]
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      if (lum > threshold) continue // background
      fgMask[y * width + x] = 1
      // Red: R clearly dominant over G and B
      if (r >= 120 && r > g * 1.5 && r > b * 1.5) {
        redCount++
      } else {
        darkCount++
      }
    }
  }

  const totalFg = redCount + darkCount
  if (totalFg < 10) return null
  const isRed = redCount > totalFg * 0.35

  // Row width (fg pixel count per row)
  const rowW = new Float32Array(height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) if (fgMask[y * width + x]) rowW[y]++

  // Tight bounding box – require at least 2 fg pixels per row to suppress noise
  const MIN_ROW = 2
  let minY = -1,
    maxY = -1
  for (let y = 0; y < height; y++) {
    if (rowW[y] >= MIN_ROW) {
      if (minY === -1) minY = y
      maxY = y
    }
  }
  if (minY === -1 || maxY - minY < 4) return null
  const fgH = maxY - minY + 1

  // Zone averages within the fg bounding box
  const topEnd = Math.max(1, Math.floor(fgH * 0.3))
  const midStart = Math.floor(fgH * 0.3)
  const midEnd = Math.floor(fgH * 0.7)

  let topSum = 0,
    topN = 0
  for (let i = 0; i < topEnd; i++) {
    topSum += rowW[minY + i]
    topN++
  }
  let midSum = 0,
    midN = 0
  for (let i = midStart; i < midEnd; i++) {
    midSum += rowW[minY + i]
    midN++
  }

  const topAvg = topN > 0 ? topSum / topN : 0
  const midAvg = midN > 0 ? midSum / midN : 0
  if (topAvg + midAvg === 0) return null

  if (isRed) {
    // ♥: two lobes at top → topAvg ≥ midAvg
    // ♦: widest at center  → midAvg >  topAvg
    return topAvg >= midAvg ? "\u2665" : "\u2666"
  } else {
    // ♠ vs ♣ — key difference: the very top of the symbol
    //   ♠ has a sharp pointed tip → very narrow at top relative to max width
    //   ♣ has a round circle at top → relatively wide at top
    // Use top-15% average width normalised by overall peak width ("tip sharpness").
    let maxRowW = 0
    for (let y = minY; y <= maxY; y++) if (rowW[y] > maxRowW) maxRowW = rowW[y]

    const vtEnd = Math.max(1, Math.floor(fgH * 0.15))
    let vtSum = 0,
      vtN = 0
    for (let i = 0; i < vtEnd; i++) {
      vtSum += rowW[minY + i]
      vtN++
    }
    const vtAvg = vtN > 0 ? vtSum / vtN : 0
    // tipSharpness < 0.40 → pointed top → ♠
    // tipSharpness ≥ 0.40 → round top   → ♣
    const tipSharpness = maxRowW > 0 ? vtAvg / maxRowW : 0
    return tipSharpness < 0.4 ? "\u2660" : "\u2663"
  }
}

// ---------------------------------------------------------------------------
// Fold detection
// ---------------------------------------------------------------------------

// My fold: hole card background turns dark (~107 lum) when folded, white (~232) when active.
function detectMyFold(
  frame: HTMLCanvasElement,
  cardRankRegions: Region[]
): boolean {
  if (cardRankRegions.length === 0) return false
  const r = cardRankRegions[0]
  const x = Math.max(0, Math.round(r.x * frame.width))
  const y = Math.max(0, Math.round(r.y * frame.height))
  const w = Math.min(
    frame.width - x,
    Math.max(1, Math.round(r.w * frame.width))
  )
  const h = Math.min(
    frame.height - y,
    Math.max(1, Math.round(r.h * frame.height))
  )
  const ctx = frame.getContext("2d")
  if (!ctx) return false
  const { data } = ctx.getImageData(x, y, w, h)
  let sum = 0,
    count = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    count++
  }
  if (count === 0) return false
  // Active: avg lum ~232. Folded: avg lum ~107. Threshold at 150.
  return sum / count < 150
}

// Other player fold: max luminance in stack region drops when folded.
// Active max lum ≈ 153 (RGB 108,167,200). Folded max lum ≈ 104 (RGB 81,112,124).
function detectFoldByStackBrightness(
  frame: HTMLCanvasElement,
  bbRegion: Region
): boolean {
  const x = Math.max(0, Math.round(bbRegion.x * frame.width))
  const y = Math.max(0, Math.round(bbRegion.y * frame.height))
  const w = Math.min(
    frame.width - x,
    Math.max(1, Math.round(bbRegion.w * frame.width))
  )
  const h = Math.min(
    frame.height - y,
    Math.max(1, Math.round(bbRegion.h * frame.height))
  )
  const ctx = frame.getContext("2d")
  if (!ctx) return false
  const { data } = ctx.getImageData(x, y, w, h)
  let maxLum = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    if (lum > maxLum) maxLum = lum
  }
  // Folded: max ≈ 104. Active: max ≈ 153. Threshold at 130.
  return maxLum < 130
}

// ---------------------------------------------------------------------------
// Detect whether a region contains a visible card
// Criteria: avg luminance > 180 (white-ish bg) AND ≥5% foreground pixels
// ---------------------------------------------------------------------------
function detectCardPresence(frame: HTMLCanvasElement, region: Region): boolean {
  const canvas = cropToRegion(frame, region)
  const ctx = canvas.getContext("2d")
  if (!ctx) return false
  const { width, height } = canvas
  const { data } = ctx.getImageData(0, 0, width, height)

  let totalR = 0,
    totalG = 0,
    totalB = 0,
    count = 0
  const lums: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2]
    totalR += r
    totalG += g
    totalB += b
    count++
    lums.push(0.299 * r + 0.587 * g + 0.114 * b)
  }
  if (count === 0) return false

  const avgR = totalR / count
  const avgG = totalG / count
  const avgB = totalB / count
  const avgLum = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB

  // Must be reasonably bright (card face ~232,232,232)
  if (avgLum < 150) return false

  // Reject blue-dominant table backgrounds: blue clearly higher than red and green
  if (avgB > avgR + 20 && avgB > avgG + 10) return false

  // Check fg pixels (rank/pip character) exist above noise floor
  const t = otsuThreshold(lums)
  const fgCount = lums.filter((v) => v < t).length
  return fgCount / lums.length > 0.015
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function extractPokerPlayers(
  frame: HTMLCanvasElement,
  regions?: OcrRegions
): Promise<ExtractResult> {
  const empty: ExtractResult = {
    players: [],
    totalPot: null,
    holeCards: [
      { rank: null, suit: null },
      { rank: null, suit: null },
    ],
    communityCards: [],
    street: "preflop",
  }
  if (!regions) return empty

  const {
    dealerRegions,
    bbRegions,
    totalRegion,
    actionRegions = [],
    nameRegions = [],
    cardRankRegions = [],
    cardSuitRegions = [],
    communityRankRegions = [],
    communitySuitRegions = [],
  } = regions
  if (bbRegions.length === 0) return empty

  const n = bbRegions.length
  const bbWorker = await getBBWorker()

  // 1. Detect dealer seat (pixel scan — fast, no OCR)
  let dealerIdx = -1
  for (let i = 0; i < Math.min(dealerRegions.length, n); i++) {
    if (isDealerButton(frame, dealerRegions[i])) {
      dealerIdx = i
      break
    }
  }

  // 2. OCR all BB (stack) regions in parallel
  const bbValues = await Promise.all(
    bbRegions.map(async (r) => {
      const { data } = await bbWorker.recognize(cropToRegion(frame, r))
      return parseBB(data.text)
    })
  )

  // 3. OCR total pot region
  let totalPot: number | null = null
  if (totalRegion) {
    const { data } = await bbWorker.recognize(cropToRegion(frame, totalRegion))
    totalPot = parseBB(data.text)
  }

  // 4. OCR action regions (current bet per player)
  const actionValues: (number | null)[] = await Promise.all(
    actionRegions.slice(0, n).map(async (r) => {
      const { data } = await bbWorker.recognize(cropToRegion(frame, r))
      return parseBB(data.text)
    })
  )

  // 5. Detect whose turn via name regions:
  //    The active player's name region has a dark background (timer highlight).
  //    We find the seat with the lowest bright-pixel ratio.
  const currentSeatIdx =
    nameRegions.length > 0
      ? detectActiveSeatByBrightness(frame, nameRegions.slice(0, n))
      : -1

  // 6. Detect street via community rank regions R3,R4,R5 (indices 0,1,2)
  //    A region "has a card" if it shows a white-ish card face with fg symbol.
  const communityPresence = communityRankRegions.map((r) =>
    detectCardPresence(frame, r)
  )
  let street: Street = "preflop"
  if (communityPresence[0] && communityPresence[1] && communityPresence[2]) {
    if (communityPresence[4]) street = "river"
    else if (communityPresence[3]) street = "turn"
    else street = "flop"
  }
  // 7. Build ordered player list (clockwise from BTN)
  const posLabels =
    POSITIONS[n] ?? Array.from({ length: n }, (_, i) => `Seat ${i + 1}`)

  // currentOffset: position of the turn player in the output order (0=BTN)
  const currentOffset =
    currentSeatIdx >= 0
      ? dealerIdx >= 0
        ? (currentSeatIdx - dealerIdx + n) % n
        : currentSeatIdx
      : -1

  const players: PlayerInfo[] = Array.from({ length: n }, (_, offset) => {
    const seatIdx = dealerIdx >= 0 ? (dealerIdx + offset) % n : offset

    const detectedAmount =
      seatIdx < actionValues.length ? actionValues[seatIdx] : null
    let action: "fold" | number | null = null
    if (detectedAmount !== null) {
      action = detectedAmount
    } else {
      // Detect fold by pixel brightness:
      // Me (seat 0): card region turns dark when folded (~107 lum) vs active (~232)
      // Others: stack region max brightness drops when folded (~104) vs active (~153)
      const isFolded =
        seatIdx === 0
          ? detectMyFold(frame, cardRankRegions)
          : bbRegions[seatIdx]
            ? detectFoldByStackBrightness(frame, bbRegions[seatIdx])
            : false
      if (isFolded) action = "fold"
    }

    return {
      position: posLabels[offset],
      bb: bbValues[seatIdx],
      action,
      isMe: seatIdx === 0,
      isTurn: seatIdx === currentSeatIdx,
      hasActed: currentOffset >= 0 && offset < currentOffset,
    }
  })

  // 8. OCR hole card ranks + detect suits (R1, R2)
  const needRankWorker =
    cardRankRegions.length > 0 || communityRankRegions.length > 0
  const rankWorker = needRankWorker ? await getRankWorker() : null
  const holeCards: [HoleCard, HoleCard] = [
    { rank: null, suit: null },
    { rank: null, suit: null },
  ]
  for (let i = 0; i < 2; i++) {
    if (rankWorker && cardRankRegions[i]) {
      const preprocessed = cropAndPreprocessRank(frame, cardRankRegions[i])
      const { data } = await rankWorker.recognize(preprocessed)
      holeCards[i].rank = parseRank(data.text)
    }
    if (cardSuitRegions[i]) {
      holeCards[i].suit = detectSuit(cropToRegion(frame, cardSuitRegions[i]))
    }
  }

  // 9. OCR community card ranks + detect suits (R3-R7)
  //    Use rank OCR as the presence gate: if no valid rank is returned, stop.
  //    (detectCardPresence is used only for street detection above.)
  const communityCards: HoleCard[] = []
  for (let i = 0; i < communityRankRegions.length; i++) {
    const card: HoleCard = { rank: null, suit: null }
    if (rankWorker && communityRankRegions[i]) {
      const preprocessed = cropAndPreprocessRank(frame, communityRankRegions[i])
      const { data } = await rankWorker.recognize(preprocessed)
      card.rank = parseRank(data.text)
    }
    if (card.rank === null) break // no valid rank → card not dealt yet → stop
    if (communitySuitRegions[i]) {
      card.suit = detectSuit(cropToRegion(frame, communitySuitRegions[i]))
    }
    communityCards.push(card)
  }

  return { players, totalPot, holeCards, communityCards, street }
}
