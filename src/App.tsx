import { useState, useCallback, useRef } from "react"
import { ScreenShare } from "@/components/ScreenShare"
import { PokerStatus } from "@/components/PokerStatus"
import { AiChat, type ChatMessage } from "@/components/AiChat"
import { PromptInput } from "@/components/PromptInput"
import { ApiKeyInput } from "@/components/ApiKeyInput"
import { getApiKey, streamChat } from "@/lib/groq"
import {
  extractPokerPlayers,
  type PlayerInfo,
  type OcrRegions,
  type HoleCard,
} from "@/lib/poker-ocr"

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasKey, setHasKey] = useState(() => !!getApiKey())
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [totalPot, setTotalPot] = useState<number | null>(null)
  const [holeCards, setHoleCards] = useState<[HoleCard, HoleCard]>([
    { rank: null, suit: null },
    { rank: null, suit: null },
  ])
  const prevPlayersRef = useRef<PlayerInfo[]>([])
  const ocrRegionsRef = useRef<OcrRegions>({
    dealerRegions: [],
    bbRegions: [],
    totalRegion: undefined,
    actionRegions: [],
    nameRegions: [],
    cardRankRegions: [],
    cardSuitRegions: [],
  })

  const handleRegionsChange = useCallback((regions: OcrRegions) => {
    ocrRegionsRef.current = regions
  }, [])

  const handleCapture = useCallback(async (canvas: HTMLCanvasElement) => {
    setIsAnalyzing(true)
    try {
      const {
        players: result,
        totalPot: pot,
        holeCards: cards,
      } = await extractPokerPlayers(canvas, ocrRegionsRef.current)
      const prev = prevPlayersRef.current
      const merged = result.map((p, i) => {
        if (p.bb !== null) return p
        const prevBb = prev[i]?.bb ?? null
        return prevBb !== null ? { ...p, bb: prevBb, bbStale: true } : p
      })
      prevPlayersRef.current = merged
      setPlayers(merged)
      setTotalPot(pot)
      setHoleCards(cards)
    } catch (e) {
      void e
    } finally {
      setIsAnalyzing(false)
    }
  }, [])

  const handleSend = useCallback(
    async (text: string) => {
      const apiKey = getApiKey()
      if (!apiKey) return

      const userMessage: ChatMessage = { role: "user", content: text }
      const assistantMessage: ChatMessage = { role: "assistant", content: "" }

      setMessages((prev) => [...prev, userMessage, assistantMessage])
      setIsLoading(true)

      const history = messages.map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }))

      try {
        for await (const chunk of streamChat(apiKey, history, text)) {
          setMessages((prev) => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            updated[updated.length - 1] = {
              ...last,
              content: last.content + chunk,
            }
            return updated
          })
        }
      } catch (e) {
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: "assistant",
            content: `Error: ${e instanceof Error ? e.message : String(e)}`,
          }
          return updated
        })
      } finally {
        setIsLoading(false)
      }
    },
    [messages]
  )

  const buildPokerPrompt = useCallback(() => {
    const cardStr = (rank: string | null, suit: string | null) =>
      rank || suit ? `${rank ?? "?"}${suit ?? "?"}` : null

    const c1 = cardStr(holeCards[0].rank, holeCards[0].suit)
    const c2 = cardStr(holeCards[1].rank, holeCards[1].suit)
    const holeStr = c1 && c2 ? `${c1} ${c2}` : (c1 ?? c2 ?? "(unknown)")
    const potStr = totalPot !== null ? `${totalPot} BB` : "unknown"

    const playerLines = players
      .map((p) => {
        const stack = p.bb !== null ? `${p.bb} BB` : "?"
        const action =
          p.action === "fold"
            ? "folded"
            : p.action !== null
              ? `bet ${p.action} BB`
              : p.isTurn
                ? "(to act)"
                : "(waiting)"
        const tags = [p.isMe ? "[ME]" : "", p.isTurn ? "[TURN]" : ""]
          .filter(Boolean)
          .join(" ")
        return `  ${p.position}${tags ? " " + tags : ""}: stack=${stack}, ${action}`
      })
      .join("\n")

    return (
      `My hole cards: ${holeStr}\n` +
      `Pot: ${potStr}\n\n` +
      `Players (clockwise from BTN):\n${playerLines}\n\n` +
      `What is the optimal action and why? Consider pot odds, position, and hand strength.\n\n` +
      `Respond in this exact format:\n` +
      `**Action**: [Fold / Call / Raise X BB]\n` +
      `**Reason**: [1-2 sentences max]`
    )
  }, [players, totalPot, holeCards])

  const handleAnalyze = useCallback(() => {
    handleSend(buildPokerPrompt())
  }, [buildPokerPrompt, handleSend])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Left: Screen share */}
      <div className="flex h-full max-w-[50%] min-w-0 flex-1 flex-col p-3">
        <ScreenShare
          onCapture={handleCapture}
          onRegionsChange={handleRegionsChange}
        />
      </div>

      {/* Divider */}
      <div className="w-px shrink-0 bg-border" />

      {/* Right: Poker status / AI chat / Prompt input */}
      <div className="flex h-full w-0 flex-1 flex-col gap-0 overflow-hidden">
        {/* Poker status */}
        <div className="shrink overflow-hidden border-b border-border p-3">
          <PokerStatus
            players={players}
            isAnalyzing={isAnalyzing}
            totalPot={totalPot}
            holeCards={holeCards}
          />
        </div>

        {/* AI chat */}
        <div className="min-h-0 flex-1 overflow-hidden border-b border-border p-3">
          <AiChat messages={messages} isLoading={isLoading} />
        </div>

        {/* Prompt input + API key */}
        <div className="flex shrink-0 flex-col gap-2 p-3">
          <ApiKeyInput
            hasKey={hasKey}
            onKeyChange={() => setHasKey(!!getApiKey())}
          />
          <PromptInput
            onSend={handleSend}
            onAnalyze={handleAnalyze}
            disabled={isLoading || !hasKey}
          />
        </div>
      </div>
    </div>
  )
}

export default App
