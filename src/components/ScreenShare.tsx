import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Monitor, StopCircle, CircleDot, Hash, X } from "lucide-react"
import type { OcrRegions, Region } from "@/lib/poker-ocr"

const MAX_PLAYERS = 8

interface ScreenShareProps {
  onCapture?: (canvas: HTMLCanvasElement) => void
  onRegionsChange?: (regions: OcrRegions) => void
}

type SelectMode = "dealer" | "bb" | null

interface DragState {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

const STORAGE_KEY = "poker-ocr-regions"

function loadRegions(): { dealerRegions: Region[]; bbRegions: Region[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { dealerRegions: [], bbRegions: [] }
    const parsed = JSON.parse(raw)
    return {
      dealerRegions: Array.isArray(parsed.dealerRegions)
        ? parsed.dealerRegions
        : [],
      bbRegions: Array.isArray(parsed.bbRegions) ? parsed.bbRegions : [],
    }
  } catch {
    return { dealerRegions: [], bbRegions: [] }
  }
}

function saveRegions(dealers: Region[], bbs: Region[]) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ dealerRegions: dealers, bbRegions: bbs })
  )
}

/**
 * Sort regions clockwise starting from the one closest to the bottom-left
 * direction from the centroid (= "me", seat 1).
 *
 * Coordinate system: normalized (0-1), y increases downward (screen coords).
 * atan2(dy, dx) with y-down gives clockwise angles:
 *   right=0°, down=90°, left=180°, up=270°
 * "Me" = first seat encountered clockwise from 6 o'clock (90°, straight down).
 */
const SWEEP_START_DEG = 90 // 6 o'clock — sweep clockwise from here

function sortClockwise(regions: Region[]): Region[] {
  if (regions.length <= 1) return [...regions]
  const cx = regions.reduce((s, r) => s + r.x + r.w / 2, 0) / regions.length
  const cy = regions.reduce((s, r) => s + r.y + r.h / 2, 0) / regions.length
  const withAngle = regions.map((r) => {
    const dx = r.x + r.w / 2 - cx
    const dy = r.y + r.h / 2 - cy
    let deg = Math.atan2(dy, dx) * (180 / Math.PI)
    if (deg < 0) deg += 360
    return { r, deg }
  })
  // Sort ascending = clockwise in screen coords
  withAngle.sort((a, b) => a.deg - b.deg)
  // "Me" = first seat clockwise from SWEEP_START_DEG.
  // Remap each angle to a [0, 360) value relative to the sweep start,
  // then the smallest remapped value is the first seat past 6 o'clock.
  const remapped = withAngle.map(({ r, deg }) => ({
    r,
    rel: (deg - SWEEP_START_DEG + 360) % 360,
  }))
  remapped.sort((a, b) => a.rel - b.rel)
  return remapped.map(({ r }) => r)
}

export function ScreenShare({ onCapture, onRegionsChange }: ScreenShareProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState<SelectMode>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dealerRegions, setDealerRegions] = useState<Region[]>(
    () => loadRegions().dealerRegions
  )
  const [bbRegions, setBbRegions] = useState<Region[]>(
    () => loadRegions().bbRegions
  )
  const [videoOffset, setVideoOffset] = useState<{
    x: number
    y: number
    w: number
    h: number
  } | null>(null)

  const emitRegions = useCallback(
    (dealers: Region[], bbs: Region[]) => {
      saveRegions(dealers, bbs)
      onRegionsChange?.({ dealerRegions: dealers, bbRegions: bbs })
    },
    [onRegionsChange]
  )

  // Emit saved regions on mount so App.tsx ref is populated from the start
  useEffect(() => {
    onRegionsChange?.({ dealerRegions, bbRegions })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startShare = async () => {
    try {
      setError(null)
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      })
      mediaStream
        .getVideoTracks()[0]
        .addEventListener("ended", () => setStream(null))
      setStream(mediaStream)
    } catch (err) {
      if (err instanceof Error && err.name !== "NotAllowedError")
        setError(err.message)
    }
  }

  const stopShare = () => {
    stream?.getTracks().forEach((t) => t.stop())
    setStream(null)
  }

  const captureFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !onCapture) return
    const scale = Math.min(1, 1280 / (video.videoWidth || 1280))
    canvas.width = video.videoWidth * scale
    canvas.height = video.videoHeight * scale
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    onCapture(canvas)
  }

  const updateVideoOffset = useCallback(() => {
    const video = videoRef.current
    const container = containerRef.current
    if (!video || !container || !video.videoWidth) return
    const vr = video.getBoundingClientRect()
    const cr = container.getBoundingClientRect()
    setVideoOffset({
      x: vr.left - cr.left,
      y: vr.top - cr.top,
      w: vr.width,
      h: vr.height,
    })
  }, [])

  const toNorm = useCallback((clientX: number, clientY: number) => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return null
    const r = video.getBoundingClientRect()
    return {
      x: clamp01((clientX - r.left) / r.width),
      y: clamp01((clientY - r.top) / r.height),
    }
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!selectMode) return
      e.preventDefault()
      const c = toNorm(e.clientX, e.clientY)
      if (!c) return
      setDrag({ startX: c.x, startY: c.y, currentX: c.x, currentY: c.y })
    },
    [selectMode, toNorm]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drag) return
      const c = toNorm(e.clientX, e.clientY)
      if (!c) return
      setDrag((prev) =>
        prev ? { ...prev, currentX: c.x, currentY: c.y } : null
      )
    },
    [drag, toNorm]
  )

  const commitDrag = useCallback(() => {
    if (!drag || !selectMode) {
      setDrag(null)
      return
    }
    const x = Math.min(drag.startX, drag.currentX)
    const y = Math.min(drag.startY, drag.currentY)
    const w = Math.abs(drag.currentX - drag.startX)
    const h = Math.abs(drag.currentY - drag.startY)
    if (w > 0.005 && h > 0.005) {
      const region: Region = { x, y, w, h }
      if (selectMode === "dealer") {
        setDealerRegions((prev) => {
          const next = sortClockwise(
            prev.length < MAX_PLAYERS
              ? [...prev, region]
              : [...prev.slice(0, -1), region]
          )
          emitRegions(next, bbRegions)
          if (next.length >= MAX_PLAYERS) setSelectMode(null)
          return next
        })
      } else {
        setBbRegions((prev) => {
          const next = sortClockwise(
            prev.length < MAX_PLAYERS
              ? [...prev, region]
              : [...prev.slice(0, -1), region]
          )
          emitRegions(dealerRegions, next)
          if (next.length >= MAX_PLAYERS) setSelectMode(null)
          return next
        })
      }
    }
    setDrag(null)
  }, [drag, selectMode, dealerRegions, bbRegions, emitRegions])

  const removeRegion = useCallback(
    (type: "dealer" | "bb", idx: number) => {
      if (type === "dealer") {
        setDealerRegions((prev) => {
          const next = sortClockwise(prev.filter((_, i) => i !== idx))
          emitRegions(next, bbRegions)
          return next
        })
      } else {
        setBbRegions((prev) => {
          const next = sortClockwise(prev.filter((_, i) => i !== idx))
          emitRegions(dealerRegions, next)
          return next
        })
      }
    },
    [dealerRegions, bbRegions, emitRegions]
  )

  const clearAll = useCallback(() => {
    setDealerRegions([])
    setBbRegions([])
    onRegionsChange?.({ dealerRegions: [], bbRegions: [] })
    setSelectMode(null)
  }, [onRegionsChange])

  const regionPx = (
    r: Region,
    vo: { x: number; y: number; w: number; h: number }
  ) => ({
    left: vo.x + r.x * vo.w,
    top: vo.y + r.y * vo.h,
    width: r.w * vo.w,
    height: r.h * vo.h,
  })

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  useEffect(() => {
    if (stream && onCapture) {
      const timeout = setTimeout(captureFrame, 1000)
      intervalRef.current = setInterval(captureFrame, 1000)
      return () => {
        clearTimeout(timeout)
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, onCapture])

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [stream])

  useEffect(() => {
    const container = containerRef.current
    const video = videoRef.current
    if (!stream || !container || !video) {
      setVideoOffset(null)
      return
    }
    video.addEventListener("loadedmetadata", updateVideoOffset)
    const ro = new ResizeObserver(updateVideoOffset)
    ro.observe(container)
    updateVideoOffset()
    return () => {
      video.removeEventListener("loadedmetadata", updateVideoOffset)
      ro.disconnect()
    }
  }, [stream, updateVideoOffset])

  const dragPx =
    drag && videoOffset
      ? regionPx(
          {
            x: Math.min(drag.startX, drag.currentX),
            y: Math.min(drag.startY, drag.currentY),
            w: Math.abs(drag.currentX - drag.startX),
            h: Math.abs(drag.currentY - drag.startY),
          },
          videoOffset
        )
      : null

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Screen Share
        </span>
        <div className="flex items-center gap-2">
          {stream && (
            <>
              <Button
                size="sm"
                variant={selectMode === "dealer" ? "default" : "outline"}
                onClick={() =>
                  setSelectMode((m) => (m === "dealer" ? null : "dealer"))
                }
                disabled={dealerRegions.length >= MAX_PLAYERS}
                title="Drag to add a dealer button region"
              >
                <CircleDot className="mr-1.5 h-3.5 w-3.5" />
                Dealer {dealerRegions.length > 0 && `(${dealerRegions.length})`}
              </Button>
              <Button
                size="sm"
                variant={selectMode === "bb" ? "default" : "outline"}
                onClick={() => setSelectMode((m) => (m === "bb" ? null : "bb"))}
                disabled={bbRegions.length >= MAX_PLAYERS}
                title="Drag to add a BB region"
              >
                <Hash className="mr-1.5 h-3.5 w-3.5" />
                BB {bbRegions.length > 0 && `(${bbRegions.length})`}
              </Button>
              {(dealerRegions.length > 0 || bbRegions.length > 0) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearAll}
                  title="Clear all regions"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
          {!stream ? (
            <Button size="sm" onClick={startShare} variant="outline">
              <Monitor className="mr-1.5 h-3.5 w-3.5" />
              Start Sharing
            </Button>
          ) : (
            <Button size="sm" onClick={stopShare} variant="destructive">
              <StopCircle className="mr-1.5 h-3.5 w-3.5" />
              Stop Sharing
            </Button>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-black"
      >
        {stream ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="max-h-full max-w-full object-contain"
            />
            <div
              className={`absolute inset-0 ${selectMode ? "cursor-crosshair" : ""}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={commitDrag}
              onMouseLeave={commitDrag}
            >
              {videoOffset &&
                dealerRegions.map((r, i) => (
                  <div
                    key={`dealer-${i}`}
                    className="pointer-events-none absolute border-2 border-green-400 bg-green-400/10"
                    style={regionPx(r, videoOffset)}
                  >
                    <span className="absolute -top-5 left-0 flex items-center gap-0.5 rounded bg-green-400/90 px-1 text-[10px] font-semibold text-black">
                      D{i + 1}
                      <button
                        className="pointer-events-auto ml-0.5 opacity-70 hover:opacity-100"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          removeRegion("dealer", i)
                        }}
                      >
                        ×
                      </button>
                    </span>
                  </div>
                ))}
              {videoOffset &&
                bbRegions.map((r, i) => (
                  <div
                    key={`bb-${i}`}
                    className="pointer-events-none absolute border-2 border-yellow-400 bg-yellow-400/10"
                    style={regionPx(r, videoOffset)}
                  >
                    <span className="absolute -top-5 left-0 flex items-center gap-0.5 rounded bg-yellow-400/90 px-1 text-[10px] font-semibold text-black">
                      B{i + 1}
                      <button
                        className="pointer-events-auto ml-0.5 opacity-70 hover:opacity-100"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          removeRegion("bb", i)
                        }}
                      >
                        ×
                      </button>
                    </span>
                  </div>
                ))}
              {dragPx && (
                <div
                  className={`pointer-events-none absolute border-2 ${
                    selectMode === "dealer"
                      ? "border-green-400 bg-green-400/20"
                      : "border-yellow-400 bg-yellow-400/20"
                  }`}
                  style={dragPx}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground select-none">
            <Monitor className="h-10 w-10 opacity-30" />
            <span className="text-sm">Start screen sharing</span>
          </div>
        )}
        {error && (
          <p className="absolute right-2 bottom-2 left-2 text-center text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      {selectMode && (
        <p className="text-center text-xs text-muted-foreground">
          {selectMode === "dealer"
            ? `Dealer 버튼 영역 드래그 (${dealerRegions.length}/${MAX_PLAYERS})`
            : `BB 영역 드래그 (${bbRegions.length}/${MAX_PLAYERS})`}
        </p>
      )}
    </div>
  )
}
