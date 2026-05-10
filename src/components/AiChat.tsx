import { useEffect, useRef } from "react"
import { Bot, User } from "lucide-react"
import Markdown from "react-markdown"

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
                className={`max-w-[80%] min-w-0 rounded-lg px-3 py-2 text-sm break-words ${
                  msg.role === "user"
                    ? "bg-primary whitespace-pre-wrap text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {msg.role === "user" ? (
                  msg.content
                ) : (
                  <Markdown
                    components={{
                      p: ({ children }) => (
                        <p className="mb-1 last:mb-0">{children}</p>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold">{children}</strong>
                      ),
                      em: ({ children }) => (
                        <em className="italic">{children}</em>
                      ),
                      ul: ({ children }) => (
                        <ul className="mb-1 ml-4 list-disc">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="mb-1 ml-4 list-decimal">{children}</ol>
                      ),
                      li: ({ children }) => (
                        <li className="mb-0.5">{children}</li>
                      ),
                      code: ({ children }) => (
                        <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs dark:bg-white/10">
                          {children}
                        </code>
                      ),
                      h1: ({ children }) => (
                        <h1 className="mb-1 text-base font-bold">{children}</h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="mb-1 text-sm font-bold">{children}</h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="mb-1 text-sm font-semibold">
                          {children}
                        </h3>
                      ),
                    }}
                  >
                    {msg.content}
                  </Markdown>
                )}
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
