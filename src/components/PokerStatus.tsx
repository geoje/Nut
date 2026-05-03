export function PokerStatus() {
  return (
    <div className="flex h-full flex-col gap-2">
      <span className="text-sm font-medium text-muted-foreground">
        Poker Status
      </span>
      <div className="flex-1 overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Player
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Bet
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Chips
              </th>
              <th className="px-3 py-2 text-center font-medium text-muted-foreground">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/50">
              <td
                colSpan={4}
                className="px-3 py-6 text-center text-xs text-muted-foreground/50"
              >
                Game data will appear after screen sharing starts
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
