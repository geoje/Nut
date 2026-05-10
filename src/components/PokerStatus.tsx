import type { PlayerInfo } from "@/lib/poker-ocr"

interface PokerStatusProps {
  players?: PlayerInfo[]
  isAnalyzing?: boolean
}

function PlayerTable({ players }: { players: PlayerInfo[] }) {
  if (players.length === 0) return null
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border bg-muted/50">
          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
            Position
          </th>
          <th className="px-3 py-2 text-right font-medium text-muted-foreground">
            Stack
          </th>
        </tr>
      </thead>
      <tbody>
        {players.map((p, i) => (
          <tr key={i} className="border-b border-border/50 last:border-0">
            <td className="px-3 py-2 font-medium">
              {p.position === "BTN" ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-bold text-black ring-1 ring-border">
                    D
                  </span>
                  {p.position}
                </span>
              ) : (
                p.position
              )}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {p.bb !== null ? `${p.bb} BB` : "—"}
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
}: PokerStatusProps) {
  const left = players.slice(0, 4)
  const right = players.slice(4, 8)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Poker Status
        </span>
        {isAnalyzing && (
          <span className="animate-pulse text-xs text-muted-foreground">
            Scanning…
          </span>
        )}
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
