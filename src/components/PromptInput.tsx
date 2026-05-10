import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { SendHorizontal, Zap } from "lucide-react"

interface PromptInputProps {
  onSend: (text: string) => void
  onAnalyze?: () => void
  disabled?: boolean
}

export function PromptInput({ onSend, onAnalyze, disabled }: PromptInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    const value = textareaRef.current?.value.trim()
    if (!value) return
    onSend(value)
    if (textareaRef.current) textareaRef.current.value = ""
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-muted-foreground">Prompt</span>
      <div className="flex gap-2 rounded-lg border border-border bg-background p-2">
        <textarea
          ref={textareaRef}
          rows={3}
          disabled={disabled}
          placeholder="Ask the AI anything... (Shift+Enter: new line, Enter: send)"
          onKeyDown={handleKeyDown}
          className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 disabled:opacity-50"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={disabled}
          className="h-8 w-8 shrink-0 self-end"
        >
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </div>
      {onAnalyze && (
        <Button
          variant="secondary"
          onClick={onAnalyze}
          disabled={disabled}
          className="w-full gap-2"
        >
          <Zap className="h-4 w-4" />
          Analyze Current Hand
        </Button>
      )}
    </div>
  )
}
