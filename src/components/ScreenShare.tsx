import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Monitor,
  StopCircle,
  CircleDot,
  Hash,
  X,
  DollarSign,
  Zap,
  User,
  Type,
  Layers,
} from "lucide-react"
import type { OcrRegions, Region } from "@/lib/poker-ocr"

const MAX_PLAYERS = 8

interface ScreenShareProps {
  onCapture?: (canvas: HTMLCanvasElement) => void
  onRegionsChange?: (regions: OcrRegions) => void
}

type SelectMode =
  | "dealer"
  | "bb"
  | "total"
  | "action"
  | "name"
  | "cardRank"
  | "cardSuit"
  | "communityRank"
  | "communitySuit"
  | null

const MAX_CARDS = 2
const MAX_COMMUNITY = 5

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

function loadRegions(): {
  dealerRegions: Region[]
  bbRegions: Region[]
  totalRegion: Region | null
  actionRegions: Region[]
  nameRegions: Region[]
  cardRankRegions: Region[]
  cardSuitRegions: Region[]
  communityRankRegions: Region[]
  communitySuitRegions: Region[]
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw)
      return {
        dealerRegions: [],
        bbRegions: [],
        totalRegion: null,
        actionRegions: [],
        nameRegions: [],
        cardRankRegions: [],
        cardSuitRegions: [],
        communityRankRegions: [],
        communitySuitRegions: [],
      }
    const parsed = JSON.parse(raw)
    return {
      dealerRegions: Array.isArray(parsed.dealerRegions)
        ? parsed.dealerRegions
        : [],
      bbRegions: Array.isArray(parsed.bbRegions) ? parsed.bbRegions : [],
      totalRegion: parsed.totalRegion ?? null,
      actionRegions: Array.isArray(parsed.actionRegions)
        ? parsed.actionRegions
        : [],
      nameRegions: Array.isArray(parsed.nameRegions) ? parsed.nameRegions : [],
      cardRankRegions: Array.isArray(parsed.cardRankRegions)
        ? parsed.cardRankRegions
        : [],
      cardSuitRegions: Array.isArray(parsed.cardSuitRegions)
        ? parsed.cardSuitRegions
        : [],
      communityRankRegions: Array.isArray(parsed.communityRankRegions)
        ? parsed.communityRankRegions
        : [],
      communitySuitRegions: Array.isArray(parsed.communitySuitRegions)
        ? parsed.communitySuitRegions
        : [],
    }
  } catch {
    return {
      dealerRegions: [],
      bbRegions: [],
      totalRegion: null,
      actionRegions: [],
      nameRegions: [],
      cardRankRegions: [],
      cardSuitRegions: [],
      communityRankRegions: [],
      communitySuitRegions: [],
    }
  }
}

function saveRegions(
  dealers: Region[],
  bbs: Region[],
  total: Region | null,
  actions: Region[],
  names: Region[],
  cardRanks: Region[],
  cardSuits: Region[],
  communityRanks: Region[],
  communitySuits: Region[]
) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      dealerRegions: dealers,
      bbRegions: bbs,
      totalRegion: total,
      actionRegions: actions,
      nameRegions: names,
      cardRankRegions: cardRanks,
      cardSuitRegions: cardSuits,
      communityRankRegions: communityRanks,
      communitySuitRegions: communitySuits,
    })
  )
}

const SWEEP_START_DEG = 90

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
  withAngle.sort((a, b) => a.deg - b.deg)
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
  const [totalRegion, setTotalRegion] = useState<Region | null>(
    () => loadRegions().totalRegion
  )
  const [actionRegions, setActionRegions] = useState<Region[]>(
    () => loadRegions().actionRegions
  )
  const [nameRegions, setNameRegions] = useState<Region[]>(
    () => loadRegions().nameRegions
  )
  const [cardRankRegions, setCardRankRegions] = useState<Region[]>(
    () => loadRegions().cardRankRegions
  )
  const [cardSuitRegions, setCardSuitRegions] = useState<Region[]>(
    () => loadRegions().cardSuitRegions
  )
  const [communityRankRegions, setCommunityRankRegions] = useState<Region[]>(
    () => loadRegions().communityRankRegions
  )
  const [communitySuitRegions, setCommunitySuitRegions] = useState<Region[]>(
    () => loadRegions().communitySuitRegions
  )
  const [videoOffset, setVideoOffset] = useState<{
    x: number
    y: number
    w: number
    h: number
  } | null>(null)

  const emitRegions = useCallback(
    (
      dealers: Region[],
      bbs: Region[],
      total: Region | null,
      actions: Region[],
      names: Region[],
      cardRanks: Region[],
      cardSuits: Region[],
      communityRanks: Region[],
      communitySuits: Region[]
    ) => {
      saveRegions(
        dealers,
        bbs,
        total,
        actions,
        names,
        cardRanks,
        cardSuits,
        communityRanks,
        communitySuits
      )
      onRegionsChange?.({
        dealerRegions: dealers,
        bbRegions: bbs,
        totalRegion: total ?? undefined,
        actionRegions: actions,
        nameRegions: names,
        cardRankRegions: cardRanks,
        cardSuitRegions: cardSuits,
        communityRankRegions: communityRanks,
        communitySuitRegions: communitySuits,
      })
    },
    [onRegionsChange]
  )

  // Emit saved regions on mount so App.tsx ref is populated from the start
  useEffect(() => {
    onRegionsChange?.({
      dealerRegions,
      bbRegions,
      totalRegion: totalRegion ?? undefined,
      actionRegions,
      nameRegions,
      cardRankRegions,
      cardSuitRegions,
      communityRankRegions,
      communitySuitRegions,
    })
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
          emitRegions(
            next,
            bbRegions,
            totalRegion,
            actionRegions,
            nameRegions,
            cardRankRegions,
            cardSuitRegions,
            communityRankRegions,
            communitySuitRegions
          )
          if (next.length >= MAX_PLAYERS) setSelectMode(null)
          return next
        })
      } else if (selectMode === "bb") {
        setBbRegions((prev) => {
          const next = sortClockwise(
            prev.length < MAX_PLAYERS
              ? [...prev, region]
              : [...prev.slice(0, -1), region]
          )
          emitRegions(
            dealerRegions,
            next,
            totalRegion,
            actionRegions,
            nameRegions,
            cardRankRegions,
            cardSuitRegions,
            communityRankRegions,
            communitySuitRegions
          )
          if (next.length >= MAX_PLAYERS) setSelectMode(null)
          return next
        })
      } else if (selectMode === "total") {
        setTotalRegion(region)
        emitRegions(
          dealerRegions,
          bbRegions,
          region,
          actionRegions,
          nameRegions,
          cardRankRegions,
          cardSuitRegions,
          communityRankRegions,
          communitySuitRegions
        )
        setSelectMode(null)
      } else if (selectMode === "action") {
        setActionRegions((prev) => {
          const next = sortClockwise(
            prev.length < MAX_PLAYERS
              ? [...prev, region]
              : [...prev.slice(0, -1), region]
          )
          emitRegions(
            dealerRegions,
            bbRegions,
            totalRegion,
            next,
            nameRegions,
            cardRankRegions,
            cardSuitRegions,
            communityRankRegions,
            communitySuitRegions
          )
          if (next.length >= MAX_PLAYERS) setSelectMode(null)
          return next
        })
      } else if (selectMode === "name") {
        setNameRegions((prev) => {
          const next = sortClockwise(
            prev.length < MAX_PLAYERS
              ? [...prev, region]
              : [...prev.slice(0, -1), region]
          )
          emitRegions(
            dealerRegions,
            bbRegions,
            totalRegion,
            actionRegions,
            next,
            cardRankRegions,
            cardSuitRegions,
            communityRankRegions,
            communitySuitRegions
          )
          if (next.length >= MAX_PLAYERS) setSelectMode(null)
          return next
        })
      } else if (selectMode === "cardRank") {
        setCardRankRegions((prev) => {
          const next =
            prev.length < MAX_CARDS
              ? [...prev, region]
              : [...prev.slice(0, -1), region]
          emitRegions(
            dealerRegions,
            bbRegions,
            totalRegion,
            actionRegions,
            nameRegions,
            next,
            cardSuitRegions,
            communityRankRegions,
            communitySuitRegions
          )
          if (next.length >= MAX_CARDS) setSelectMode(null)
          return next
        })
      } else if (selectMode === "cardSuit") {
        setCardSuitRegions((prev) => {
          const next =
            prev.length < MAX_CARDS
              ? [...prev, region]
              : [...prev.slice(0, -1), region]
          emitRegions(
            dealerRegions,
            bbRegions,
            totalRegion,
            actionRegions,
            nameRegions,
            cardRankRegions,
            next,
            communityRankRegions,
            communitySuitRegions
          )
          if (next.length >= MAX_CARDS) setSelectMode(null)
          return next
        })
      } else if (selectMode === "communityRank") {
        setCommunityRankRegions((prev) => {
          const next =
            prev.length < MAX_COMMUNITY
              ? [...prev, region]
              : [...prev.slice(0, -1), region]
          emitRegions(
            dealerRegions,
            bbRegions,
            totalRegion,
            actionRegions,
            nameRegions,
            cardRankRegions,
            cardSuitRegions,
            next,
            communitySuitRegions
          )
          if (next.length >= MAX_COMMUNITY) setSelectMode(null)
          return next
        })
      } else if (selectMode === "communitySuit") {
        setCommunitySuitRegions((prev) => {
          const next =
            prev.length < MAX_COMMUNITY
              ? [...prev, region]
              : [...prev.slice(0, -1), region]
          emitRegions(
            dealerRegions,
            bbRegions,
            totalRegion,
            actionRegions,
            nameRegions,
            cardRankRegions,
            cardSuitRegions,
            communityRankRegions,
            next
          )
          if (next.length >= MAX_COMMUNITY) setSelectMode(null)
          return next
        })
      }
    }
    setDrag(null)
  }, [
    drag,
    selectMode,
    dealerRegions,
    bbRegions,
    totalRegion,
    actionRegions,
    nameRegions,
    cardRankRegions,
    cardSuitRegions,
    communityRankRegions,
    communitySuitRegions,
    emitRegions,
  ])

  const removeRegion = useCallback(
    (
      type:
        | "dealer"
        | "bb"
        | "total"
        | "action"
        | "name"
        | "cardRank"
        | "cardSuit"
        | "communityRank"
        | "communitySuit",
      idx?: number
    ) => {
      if (type === "total") {
        setTotalRegion(null)
        emitRegions(
          dealerRegions,
          bbRegions,
          null,
          actionRegions,
          nameRegions,
          cardRankRegions,
          cardSuitRegions,
          communityRankRegions,
          communitySuitRegions
        )
      } else if (type === "dealer") {
        setDealerRegions((prev) => {
          const next = sortClockwise(prev.filter((_, i) => i !== idx))
          emitRegions(
            next,
            bbRegions,
            totalRegion,
            actionRegions,
            nameRegions,
            cardRankRegions,
            cardSuitRegions,
            communityRankRegions,
            communitySuitRegions
          )
          return next
        })
      } else if (type === "bb") {
        setBbRegions((prev) => {
          const next = sortClockwise(prev.filter((_, i) => i !== idx))
          emitRegions(
            dealerRegions,
            next,
            totalRegion,
            actionRegions,
            nameRegions,
            cardRankRegions,
            cardSuitRegions,
            communityRankRegions,
            communitySuitRegions
          )
          return next
        })
      } else if (type === "action") {
        setActionRegions((prev) => {
          const next = sortClockwise(prev.filter((_, i) => i !== idx))
          emitRegions(
            dealerRegions,
            bbRegions,
            totalRegion,
            next,
            nameRegions,
            cardRankRegions,
            cardSuitRegions,
            communityRankRegions,
            communitySuitRegions
          )
          return next
        })
      } else if (type === "name") {
        setNameRegions((prev) => {
          const next = sortClockwise(prev.filter((_, i) => i !== idx))
          emitRegions(
            dealerRegions,
            bbRegions,
            totalRegion,
            actionRegions,
            next,
            cardRankRegions,
            cardSuitRegions,
            communityRankRegions,
            communitySuitRegions
          )
          return next
        })
      } else if (type === "cardRank") {
        setCardRankRegions((prev) => {
          const next = prev.filter((_, i) => i !== idx)
          emitRegions(
            dealerRegions,
            bbRegions,
            totalRegion,
            actionRegions,
            nameRegions,
            next,
            cardSuitRegions,
            communityRankRegions,
            communitySuitRegions
          )
          return next
        })
      } else if (type === "cardSuit") {
        setCardSuitRegions((prev) => {
          const next = prev.filter((_, i) => i !== idx)
          emitRegions(
            dealerRegions,
            bbRegions,
            totalRegion,
            actionRegions,
            nameRegions,
            cardRankRegions,
            next,
            communityRankRegions,
            communitySuitRegions
          )
          return next
        })
      } else if (type === "communityRank") {
        setCommunityRankRegions((prev) => {
          const next = prev.filter((_, i) => i !== idx)
          emitRegions(
            dealerRegions,
            bbRegions,
            totalRegion,
            actionRegions,
            nameRegions,
            cardRankRegions,
            cardSuitRegions,
            next,
            communitySuitRegions
          )
          return next
        })
      } else if (type === "communitySuit") {
        setCommunitySuitRegions((prev) => {
          const next = prev.filter((_, i) => i !== idx)
          emitRegions(
            dealerRegions,
            bbRegions,
            totalRegion,
            actionRegions,
            nameRegions,
            cardRankRegions,
            cardSuitRegions,
            communityRankRegions,
            next
          )
          return next
        })
      }
    },
    [
      dealerRegions,
      bbRegions,
      totalRegion,
      actionRegions,
      nameRegions,
      cardRankRegions,
      cardSuitRegions,
      communityRankRegions,
      communitySuitRegions,
      emitRegions,
    ]
  )

  const clearAll = useCallback(() => {
    setDealerRegions([])
    setBbRegions([])
    setTotalRegion(null)
    setActionRegions([])
    setNameRegions([])
    setCardRankRegions([])
    setCardSuitRegions([])
    setCommunityRankRegions([])
    setCommunitySuitRegions([])
    onRegionsChange?.({
      dealerRegions: [],
      bbRegions: [],
      totalRegion: undefined,
      actionRegions: [],
      nameRegions: [],
      cardRankRegions: [],
      cardSuitRegions: [],
      communityRankRegions: [],
      communitySuitRegions: [],
    })
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

  const dragBorderColor =
    selectMode === "dealer"
      ? "border-green-400 bg-green-400/20"
      : selectMode === "total"
        ? "border-orange-400 bg-orange-400/20"
        : selectMode === "action"
          ? "border-purple-400 bg-purple-400/20"
          : selectMode === "name"
            ? "border-blue-400 bg-blue-400/20"
            : selectMode === "cardRank"
              ? "border-rose-400 bg-rose-400/20"
              : selectMode === "cardSuit"
                ? "border-cyan-400 bg-cyan-400/20"
                : selectMode === "communityRank"
                  ? "border-amber-400 bg-amber-400/20"
                  : selectMode === "communitySuit"
                    ? "border-teal-400 bg-teal-400/20"
                    : "border-yellow-400 bg-yellow-400/20"

  const anyRegion =
    dealerRegions.length > 0 ||
    bbRegions.length > 0 ||
    totalRegion !== null ||
    actionRegions.length > 0 ||
    nameRegions.length > 0 ||
    cardRankRegions.length > 0 ||
    cardSuitRegions.length > 0 ||
    communityRankRegions.length > 0 ||
    communitySuitRegions.length > 0

  // hintText removed (hints no longer shown)

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Screen Share
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {stream && (
            <>
              <Button
                size="sm"
                variant={selectMode === "dealer" ? "default" : "outline"}
                onClick={() =>
                  setSelectMode((m) => (m === "dealer" ? null : "dealer"))
                }
                disabled={dealerRegions.length >= MAX_PLAYERS}
                title="딜러 버튼 영역"
              >
                <CircleDot className="mr-1.5 h-3.5 w-3.5" />
                Dealer{dealerRegions.length > 0 && ` (${dealerRegions.length})`}
              </Button>
              <Button
                size="sm"
                variant={selectMode === "bb" ? "default" : "outline"}
                onClick={() => setSelectMode((m) => (m === "bb" ? null : "bb"))}
                disabled={bbRegions.length >= MAX_PLAYERS}
                title="스택 BB 영역"
              >
                <Hash className="mr-1.5 h-3.5 w-3.5" />
                Stack{bbRegions.length > 0 && ` (${bbRegions.length})`}
              </Button>
              <Button
                size="sm"
                variant={selectMode === "total" ? "default" : "outline"}
                onClick={() =>
                  setSelectMode((m) => (m === "total" ? null : "total"))
                }
                disabled={!!totalRegion}
                title="Total Pot 영역"
              >
                <DollarSign className="mr-1.5 h-3.5 w-3.5" />
                Total{totalRegion && " ✓"}
              </Button>
              <Button
                size="sm"
                variant={selectMode === "action" ? "default" : "outline"}
                onClick={() =>
                  setSelectMode((m) => (m === "action" ? null : "action"))
                }
                disabled={actionRegions.length >= MAX_PLAYERS}
                title="배팅 액션 영역"
              >
                <Zap className="mr-1.5 h-3.5 w-3.5" />
                Action{actionRegions.length > 0 && ` (${actionRegions.length})`}
              </Button>
              <Button
                size="sm"
                variant={selectMode === "name" ? "default" : "outline"}
                onClick={() =>
                  setSelectMode((m) => (m === "name" ? null : "name"))
                }
                disabled={nameRegions.length >= MAX_PLAYERS}
                title="이름 영역 (타이머 감지)"
              >
                <User className="mr-1.5 h-3.5 w-3.5" />
                Name{nameRegions.length > 0 && ` (${nameRegions.length})`}
              </Button>
              <Button
                size="sm"
                variant={selectMode === "cardRank" ? "default" : "outline"}
                onClick={() =>
                  setSelectMode((m) => (m === "cardRank" ? null : "cardRank"))
                }
                disabled={cardRankRegions.length >= MAX_CARDS}
                title="내 카드 랭크 OCR"
              >
                <Type className="mr-1.5 h-3.5 w-3.5" />
                Rank
                {cardRankRegions.length > 0 && ` (${cardRankRegions.length})`}
              </Button>
              <Button
                size="sm"
                variant={selectMode === "cardSuit" ? "default" : "outline"}
                onClick={() =>
                  setSelectMode((m) => (m === "cardSuit" ? null : "cardSuit"))
                }
                disabled={cardSuitRegions.length >= MAX_CARDS}
                title="내 카드 문양 감지"
              >
                <Layers className="mr-1.5 h-3.5 w-3.5" />
                Suit
                {cardSuitRegions.length > 0 && ` (${cardSuitRegions.length})`}
              </Button>
              <Button
                size="sm"
                variant={selectMode === "communityRank" ? "default" : "outline"}
                onClick={() =>
                  setSelectMode((m) =>
                    m === "communityRank" ? null : "communityRank"
                  )
                }
                disabled={communityRankRegions.length >= MAX_COMMUNITY}
                title="커뮤니티 카드 랭크 (R3-R7)"
              >
                <Type className="mr-1.5 h-3.5 w-3.5" />
                Board R
                {communityRankRegions.length > 0 &&
                  ` (${communityRankRegions.length})`}
              </Button>
              <Button
                size="sm"
                variant={selectMode === "communitySuit" ? "default" : "outline"}
                onClick={() =>
                  setSelectMode((m) =>
                    m === "communitySuit" ? null : "communitySuit"
                  )
                }
                disabled={communitySuitRegions.length >= MAX_COMMUNITY}
                title="커뮤니티 카드 문양 (S3-S7)"
              >
                <Layers className="mr-1.5 h-3.5 w-3.5" />
                Board S
                {communitySuitRegions.length > 0 &&
                  ` (${communitySuitRegions.length})`}
              </Button>
              {anyRegion && (
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
              {/* Layer 1: rectangles only */}
              {videoOffset &&
                dealerRegions.map((r, i) => (
                  <div
                    key={`dealer-rect-${i}`}
                    className="pointer-events-none absolute border-2 border-green-400 bg-green-400/10"
                    style={regionPx(r, videoOffset)}
                  />
                ))}
              {videoOffset &&
                bbRegions.map((r, i) => (
                  <div
                    key={`bb-rect-${i}`}
                    className="pointer-events-none absolute border-2 border-yellow-400 bg-yellow-400/10"
                    style={regionPx(r, videoOffset)}
                  />
                ))}
              {videoOffset && totalRegion && (
                <div
                  className="pointer-events-none absolute border-2 border-orange-400 bg-orange-400/10"
                  style={regionPx(totalRegion, videoOffset)}
                />
              )}
              {videoOffset &&
                actionRegions.map((r, i) => (
                  <div
                    key={`action-rect-${i}`}
                    className="pointer-events-none absolute border-2 border-purple-400 bg-purple-400/10"
                    style={regionPx(r, videoOffset)}
                  />
                ))}
              {videoOffset &&
                nameRegions.map((r, i) => (
                  <div
                    key={`name-rect-${i}`}
                    className="pointer-events-none absolute border-2 border-blue-400 bg-blue-400/10"
                    style={regionPx(r, videoOffset)}
                  />
                ))}
              {videoOffset &&
                cardRankRegions.map((r, i) => (
                  <div
                    key={`cardRank-rect-${i}`}
                    className="pointer-events-none absolute border-2 border-rose-400 bg-rose-400/10"
                    style={regionPx(r, videoOffset)}
                  />
                ))}
              {videoOffset &&
                cardSuitRegions.map((r, i) => (
                  <div
                    key={`cardSuit-rect-${i}`}
                    className="pointer-events-none absolute border-2 border-cyan-400 bg-cyan-400/10"
                    style={regionPx(r, videoOffset)}
                  />
                ))}
              {videoOffset &&
                communityRankRegions.map((r, i) => (
                  <div
                    key={`communityRank-rect-${i}`}
                    className="pointer-events-none absolute border-2 border-amber-400 bg-amber-400/10"
                    style={regionPx(r, videoOffset)}
                  />
                ))}
              {videoOffset &&
                communitySuitRegions.map((r, i) => (
                  <div
                    key={`communitySuit-rect-${i}`}
                    className="pointer-events-none absolute border-2 border-teal-400 bg-teal-400/10"
                    style={regionPx(r, videoOffset)}
                  />
                ))}
              {dragPx && (
                <div
                  className={`pointer-events-none absolute border-2 ${dragBorderColor}`}
                  style={dragPx}
                />
              )}

              {/* Layer 2: labels on top of all rectangles */}
              {videoOffset &&
                dealerRegions.map((r, i) => {
                  const px = regionPx(r, videoOffset)
                  return (
                    <span
                      key={`dealer-label-${i}`}
                      className="absolute z-10 flex items-center gap-0.5 rounded bg-green-400/50 px-1 text-[10px] font-semibold text-black backdrop-blur-[1px]"
                      style={{ left: px.left, top: px.top - 20 }}
                    >
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
                  )
                })}
              {videoOffset &&
                bbRegions.map((r, i) => {
                  const px = regionPx(r, videoOffset)
                  return (
                    <span
                      key={`bb-label-${i}`}
                      className="absolute z-10 flex items-center gap-0.5 rounded bg-yellow-400/50 px-1 text-[10px] font-semibold text-black backdrop-blur-[1px]"
                      style={{ left: px.left, top: px.top - 20 }}
                    >
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
                  )
                })}
              {videoOffset &&
                totalRegion &&
                (() => {
                  const px = regionPx(totalRegion, videoOffset)
                  return (
                    <span
                      className="absolute z-10 flex items-center gap-0.5 rounded bg-orange-400/50 px-1 text-[10px] font-semibold text-black backdrop-blur-[1px]"
                      style={{ left: px.left, top: px.top - 20 }}
                    >
                      Total
                      <button
                        className="pointer-events-auto ml-0.5 opacity-70 hover:opacity-100"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          removeRegion("total")
                        }}
                      >
                        ×
                      </button>
                    </span>
                  )
                })()}
              {videoOffset &&
                actionRegions.map((r, i) => {
                  const px = regionPx(r, videoOffset)
                  return (
                    <span
                      key={`action-label-${i}`}
                      className="absolute z-10 flex items-center gap-0.5 rounded bg-purple-400/50 px-1 text-[10px] font-semibold text-white backdrop-blur-[1px]"
                      style={{ left: px.left, top: px.top - 20 }}
                    >
                      A{i + 1}
                      <button
                        className="pointer-events-auto ml-0.5 opacity-70 hover:opacity-100"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          removeRegion("action", i)
                        }}
                      >
                        ×
                      </button>
                    </span>
                  )
                })}
              {videoOffset &&
                nameRegions.map((r, i) => {
                  const px = regionPx(r, videoOffset)
                  return (
                    <span
                      key={`name-label-${i}`}
                      className="absolute z-10 flex items-center gap-0.5 rounded bg-blue-400/50 px-1 text-[10px] font-semibold text-white backdrop-blur-[1px]"
                      style={{ left: px.left, top: px.top - 20 }}
                    >
                      N{i + 1}
                      <button
                        className="pointer-events-auto ml-0.5 opacity-70 hover:opacity-100"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          removeRegion("name", i)
                        }}
                      >
                        ×
                      </button>
                    </span>
                  )
                })}
              {videoOffset &&
                cardRankRegions.map((r, i) => {
                  const px = regionPx(r, videoOffset)
                  return (
                    <span
                      key={`cardRank-label-${i}`}
                      className="absolute z-10 flex items-center gap-0.5 rounded bg-rose-400/50 px-1 text-[10px] font-semibold text-white backdrop-blur-[1px]"
                      style={{ left: px.left, top: px.top - 20 }}
                    >
                      R{i + 1}
                      <button
                        className="pointer-events-auto ml-0.5 opacity-70 hover:opacity-100"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          removeRegion("cardRank", i)
                        }}
                      >
                        ×
                      </button>
                    </span>
                  )
                })}
              {videoOffset &&
                cardSuitRegions.map((r, i) => {
                  const px = regionPx(r, videoOffset)
                  return (
                    <span
                      key={`cardSuit-label-${i}`}
                      className="absolute z-10 flex items-center gap-0.5 rounded bg-cyan-400/50 px-1 text-[10px] font-semibold text-black backdrop-blur-[1px]"
                      style={{ left: px.left, top: px.top - 20 }}
                    >
                      S{i + 1}
                      <button
                        className="pointer-events-auto ml-0.5 opacity-70 hover:opacity-100"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          removeRegion("cardSuit", i)
                        }}
                      >
                        ×
                      </button>
                    </span>
                  )
                })}
              {videoOffset &&
                communityRankRegions.map((r, i) => {
                  const px = regionPx(r, videoOffset)
                  return (
                    <span
                      key={`communityRank-label-${i}`}
                      className="absolute z-10 flex items-center gap-0.5 rounded bg-amber-400/50 px-1 text-[10px] font-semibold text-black backdrop-blur-[1px]"
                      style={{ left: px.left, top: px.top - 20 }}
                    >
                      R{i + 3}
                      <button
                        className="pointer-events-auto ml-0.5 opacity-70 hover:opacity-100"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          removeRegion("communityRank", i)
                        }}
                      >
                        ×
                      </button>
                    </span>
                  )
                })}
              {videoOffset &&
                communitySuitRegions.map((r, i) => {
                  const px = regionPx(r, videoOffset)
                  return (
                    <span
                      key={`communitySuit-label-${i}`}
                      className="absolute z-10 flex items-center gap-0.5 rounded bg-teal-400/50 px-1 text-[10px] font-semibold text-black backdrop-blur-[1px]"
                      style={{ left: px.left, top: px.top - 20 }}
                    >
                      S{i + 3}
                      <button
                        className="pointer-events-auto ml-0.5 opacity-70 hover:opacity-100"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          removeRegion("communitySuit", i)
                        }}
                      >
                        ×
                      </button>
                    </span>
                  )
                })}
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
    </div>
  )
}
