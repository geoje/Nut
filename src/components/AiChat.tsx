import { Bot, User } from "lucide-react"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

interface AiChatProps {
  messages: ChatMessage[]
}

export function AiChat({ messages }: AiChatProps) {
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
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
