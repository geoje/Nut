import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ExternalLink, KeyRound, Trash2 } from "lucide-react"
import { saveApiKey, removeApiKey } from "@/lib/gemini"

interface ApiKeyInputProps {
  hasKey: boolean
  onKeyChange: () => void
}

export function ApiKeyInput({ hasKey, onKeyChange }: ApiKeyInputProps) {
  const [inputValue, setInputValue] = useState("")
  const [open, setOpen] = useState(!hasKey)

  const handleSave = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    saveApiKey(trimmed)
    setInputValue("")
    setOpen(false)
    onKeyChange()
  }

  const handleRemove = () => {
    removeApiKey()
    setOpen(true)
    onKeyChange()
  }

  if (!open && hasKey) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          <KeyRound className="h-3 w-3" />
          API Key saved
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={handleRemove}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <KeyRound className="h-3 w-3" />
        <span>Enter your Groq API Key</span>
        <a
          href="https://console.groq.com/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 text-muted-foreground/70 hover:text-muted-foreground hover:underline"
        >
          Get API Key
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          placeholder="Enter Groq API Key..."
          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground/50 focus:border-primary"
        />
        <Button size="sm" className="h-7 text-xs" onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>
  )
}
