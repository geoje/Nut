import { createWorker, PSM } from "tesseract.js"

export interface PlayerInfo {
  position: string // "BTN" | "SB" | "BB" | "UTG" | …
  bb: number | null
}

export interface Region {
  x: number // left edge, fraction of video width (0–1)
  y: number // top edge, fraction of video height (0–1)
  w: number // width fraction
  h: number // height fraction
}

// Each index is one seat slot (clockwise order, index 0–7)
export interface OcrRegions {
  dealerRegions: Region[] // up to 8 regions, one per seat, to detect dealer button
  bbRegions: Region[] // up to 8 regions, one per seat, to OCR stack size
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

// ---------------------------------------------------------------------------
// Crop + upscale a region for OCR
// ---------------------------------------------------------------------------
const REGION_MIN_H = 60

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
// Parse "28.2BB" / "28.2 BB" / "28.2" → number
// ---------------------------------------------------------------------------
function parseBB(text: string): number | null {
  const m = text.trim().match(/^([\d.]+)\s*B*$/)
  if (!m) return null
  const v = parseFloat(m[1])
  return isNaN(v) ? null : v
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function extractPokerPlayers(
  frame: HTMLCanvasElement,
  regions?: OcrRegions
): Promise<PlayerInfo[]> {
  if (!regions) return []

  const { dealerRegions, bbRegions } = regions
  if (bbRegions.length === 0) return []
  const n = bbRegions.length

  // Detect dealer seat (synchronous pixel scan — fast)
  let dealerIdx = -1
  const scanCount = Math.min(dealerRegions.length, n)
  for (let i = 0; i < scanCount; i++) {
    if (isDealerButton(frame, dealerRegions[i])) {
      dealerIdx = i
      break
    }
  }

  // OCR all BB regions in parallel
  const bbWorker = await getBBWorker()
  const bbValues = await Promise.all(
    bbRegions.map(async (r) => {
      const crop = cropToRegion(frame, r)
      const { data } = await bbWorker.recognize(crop)
      return parseBB(data.text)
    })
  )

  // Build player list in clockwise order starting from dealer (BTN)
  const posLabels =
    POSITIONS[n] ?? Array.from({ length: n }, (_, i) => `Seat ${i + 1}`)
  return Array.from({ length: n }, (_, offset) => {
    const seatIdx = dealerIdx >= 0 ? (dealerIdx + offset) % n : offset
    return { position: posLabels[offset], bb: bbValues[seatIdx] }
  })
}
