import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Monitor, StopCircle } from "lucide-react"

export function ScreenShare() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startShare = async () => {
    try {
      setError(null)
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      })
      mediaStream.getVideoTracks()[0].addEventListener("ended", () => {
        setStream(null)
      })
      setStream(mediaStream)
    } catch (err) {
      if (err instanceof Error && err.name !== "NotAllowedError") {
        setError(err.message)
      }
    }
  }

  const stopShare = () => {
    stream?.getTracks().forEach((t) => t.stop())
    setStream(null)
  }

  // Set srcObject after the video element is rendered (stream state drives rendering)
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [stream])

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Screen Share
        </span>
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

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-black">
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-h-full max-w-full object-contain"
          />
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
