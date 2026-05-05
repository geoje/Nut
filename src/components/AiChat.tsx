import { useEffect, useRef } from "react"
import { Bot, User } from "lucide-react"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

interface AiChatProps {
  messages: ChatMessage[]
  isLoading?: boolean
}

export function AiChat({ messages, isLoading }: AiChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  return (
    <div className="flex h-full flex-col gap-2">
      <span className="text-sm font-medium text-muted-foreground">
        AI Analysis
      </span>
      <div className="flex flex-1 flex-col gap-3 overflow-auto rounded-lg border border-border p-3">
        {messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-xs text-muted-foreground/50">
              Enter a question below to get started
            </p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                {msg.role === "user" ? (
                  <User className="h-3 w-3" />
                ) : (
                  <Bot className="h-3 w-3" />
                )}
              </div>
              <div
                className={`max-w-[80%] min-w-0 rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {msg.content}
                {isLoading &&
                  i === messages.length - 1 &&
                  msg.role === "assistant" && (
                    <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-current opacity-70" />
                  )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
