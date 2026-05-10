import { RefreshCw } from "lucide-react"
import type { PlayerInfo, HoleCard } from "@/lib/poker-ocr"

interface PokerStatusProps {
  players?: PlayerInfo[]
  isAnalyzing?: boolean
  totalPot?: number | null
  holeCards?: [HoleCard, HoleCard]
}

function PlayerTable({ players }: { players: PlayerInfo[] }) {
  if (players.length === 0) return null
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border bg-muted/50">
          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
            Pos
          </th>
          <th className="px-3 py-2 text-right font-medium text-muted-foreground">
            Stack
          </th>
          <th className="px-3 py-2 text-right font-medium text-muted-foreground">
            Action
          </th>
        </tr>
      </thead>
      <tbody>
        {players.map((p, i) => (
          <tr
            key={i}
            className={`border-b border-border/50 last:border-0 ${
              p.isTurn ? "bg-yellow-400/10" : p.isMe ? "bg-primary/5" : ""
            }`}
          >
            <td className="px-3 py-2 font-medium">
              <span className="inline-flex items-center gap-1">
                {p.isTurn && (
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-yellow-400/80 text-[9px] font-bold text-black ring-1 ring-yellow-400">
                    ★
                  </span>
                )}
                {!p.isTurn && p.isMe && (
                  <span className="text-[10px] text-muted-foreground">▷</span>
                )}
                {p.position === "BTN" ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-bold text-black ring-1 ring-border">
                      D
                    </span>
                    BTN
                  </span>
                ) : (
                  p.position
                )}
              </span>
            </td>
            <td
              className={`px-3 py-2 text-right tabular-nums${p.bbStale ? "text-muted-foreground/50" : ""}`}
            >
              {p.bb !== null ? `${p.bb} BB` : "—"}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {p.action === "fold" ? (
                <span className="text-muted-foreground/50">Fold</span>
              ) : p.action !== null ? (
                `${p.action} BB`
              ) : (
                ""
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function PokerStatus({
  players = [],
  isAnalyzing = false,
  totalPot,
  holeCards,
}: PokerStatusProps) {
  const left = players.slice(0, 4)
  const right = players.slice(4, 8)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          Poker Status
          {isAnalyzing && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
        </span>
        <div className="flex items-center gap-2">
          {holeCards &&
            (holeCards[0].rank ||
              holeCards[0].suit ||
              holeCards[1].rank ||
              holeCards[1].suit) && (
              <div className="flex items-center gap-1">
                {holeCards.map((card, i) => {
                  const isRed = card.suit === "\u2665" || card.suit === "\u2666"
                  return (
                    <span
                      key={i}
                      className="inline-flex h-8 min-w-[1.75rem] items-center justify-center rounded border border-border bg-white px-1 font-bold shadow-sm"
                      style={{
                        color: isRed ? "#dc2626" : "#111",
                        fontSize: "0.85rem",
                      }}
                    >
                      {card.rank === "T" ? "10" : (card.rank ?? "?")}
                      {card.suit ?? ""}
                    </span>
                  )
                })}
              </div>
            )}
          <span
            className="w-24 text-right text-xs font-semibold"
            style={{
              color:
                totalPot !== null && totalPot !== undefined
                  ? undefined
                  : "transparent",
            }}
          >
            <span className="rounded bg-orange-400/20 px-2 py-0.5 text-orange-600">
              Pot: {totalPot ?? 0} BB
            </span>
          </span>
        </div>
      </div>
      {players.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-border py-4">
          <span className="text-xs text-muted-foreground/50">
            Game data will appear after screen sharing starts
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border">
            <PlayerTable players={left} />
          </div>
          {right.length > 0 && (
            <div className="rounded-lg border border-border">
              <PlayerTable players={right} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
