import { useState } from "react"
import { ScreenShare } from "@/components/ScreenShare"
import { PokerStatus } from "@/components/PokerStatus"
import { AiChat, type ChatMessage } from "@/components/AiChat"
import { PromptInput } from "@/components/PromptInput"

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const handleSend = (text: string) => {
    setMessages((prev) => [...prev, { role: "user", content: text }])
    // AI response to be implemented later
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* 왼쪽: 화면 공유 */}
      <div className="flex h-full max-w-[50%] min-w-0 flex-1 flex-col p-3">
        <ScreenShare />
      </div>

      {/* 구분선 */}
      <div className="w-px shrink-0 bg-border" />

      {/* 오른쪽: 포커 상태 / AI 대화 / 프롬프트 입력 */}
      <div className="flex h-full w-0 flex-1 flex-col gap-0 overflow-hidden">
        {/* 포커 상태 */}
        <div className="min-h-0 shrink-0 basis-[30%] overflow-hidden border-b border-border p-3">
          <PokerStatus />
        </div>

        {/* AI 대화 */}
        <div className="min-h-0 flex-1 overflow-hidden border-b border-border p-3">
          <AiChat messages={messages} />
        </div>

        {/* 프롬프트 입력 */}
        <div className="shrink-0 p-3">
          <PromptInput onSend={handleSend} />
        </div>
      </div>
    </div>
  )
}

export default App
