import Groq from "groq-sdk"

export const API_KEY_STORAGE_KEY = "groq_api_key"

export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE_KEY)
}

export function saveApiKey(key: string) {
  localStorage.setItem(API_KEY_STORAGE_KEY, key)
}

export function removeApiKey() {
  localStorage.removeItem(API_KEY_STORAGE_KEY)
}

export async function* streamChat(
  apiKey: string,
  messages: { role: "user" | "assistant"; content: string }[],
  newMessage: string
): AsyncGenerator<string> {
  const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true })

  const stream = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [...messages, { role: "user", content: newMessage }],
    stream: true,
  })

  for await (const chunk of stream) {
    yield chunk.choices[0]?.delta?.content ?? ""
  }
}
