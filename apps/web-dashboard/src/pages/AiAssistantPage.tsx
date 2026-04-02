import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { MessageSquare, Send, Bot, User, AlertCircle, Sparkles } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { PageContent } from '@/components/layout/AppShell'
import { Spinner } from '@/components/shared/ui'
import { api } from '@/lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function AiAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sessionId] = useState(() => crypto.randomUUID())
  const bottomRef = useRef<HTMLDivElement>(null)

  const { mutate: sendMessage, isPending, error } = useMutation({
    mutationFn: (message: string) => api.ai.chat(message, sessionId),
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
    },
  })

  function handleSend() {
    const text = input.trim()
    if (!text || isPending) return
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setInput('')
    sendMessage(text)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isPending])

  return (
    <AppShell>
      <PageContent>
        <div className="flex h-[calc(100vh-4rem)] max-w-3xl flex-col mx-auto">
          <div className="flex flex-shrink-0 items-center gap-3 border-b border-gray-800 pb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15">
              <MessageSquare className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-100">AI Security Assistant</h1>
              <p className="text-sm text-gray-500">Ask about threats, investigations, or security guidance</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-6 space-y-5">
            {messages.length === 0 && !isPending && (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10">
                  <Sparkles className="h-7 w-7 text-blue-400" />
                </div>
                <div>
                  <p className="mb-1 font-medium text-gray-300">ZonForge AI Assistant</p>
                  <p className="max-w-xs text-sm text-gray-600">
                    Ask about alerts, threat hunting, compliance, incident response, or general security topics.
                  </p>
                </div>
                <div className="mt-2 grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    'Explain lateral movement techniques',
                    'What does a ransomware kill chain look like?',
                    'How do I investigate a suspicious login?',
                    'Summarize NIST CSF controls',
                  ].map(suggestion => (
                    <button
                      key={suggestion}
                      onClick={() => { setInput(suggestion) }}
                      className="rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2.5 text-left text-xs text-gray-400 transition-colors hover:bg-gray-800"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={clsx('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                {msg.role === 'assistant' && (
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/15">
                    <Bot className="h-4 w-4 text-blue-400" />
                  </div>
                )}
                <div
                  className={clsx(
                    'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'rounded-tr-sm bg-blue-600 text-white'
                      : 'rounded-tl-sm border border-gray-700/50 bg-gray-800 text-gray-200',
                  )}
                >
                  <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                </div>
                {msg.role === 'user' && (
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-700">
                    <User className="h-4 w-4 text-gray-400" />
                  </div>
                )}
              </div>
            ))}

            {isPending && (
              <div className="flex justify-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/15">
                  <Bot className="h-4 w-4 text-blue-400" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-gray-700/50 bg-gray-800 px-4 py-3">
                  <Spinner size="sm" />
                  <span className="text-sm text-gray-500">Thinking…</span>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                Failed to get a response. Please try again.
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <div className="flex-shrink-0 border-t border-gray-800 pb-2 pt-4">
            <div className="flex items-end gap-3 rounded-2xl border border-gray-700 bg-gray-800/60 px-4 py-3">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isPending}
                rows={1}
                placeholder="Ask a security question… (Enter to send, Shift+Enter for newline)"
                className="max-h-32 flex-1 resize-none overflow-y-auto bg-transparent text-sm leading-relaxed text-gray-200 outline-none placeholder:text-gray-600"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isPending}
                title="Send message"
                aria-label="Send message"
                className={clsx(
                  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition-all',
                  input.trim() && !isPending
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'cursor-not-allowed bg-gray-700 text-gray-600',
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-gray-700">
              AI responses may contain inaccuracies. Verify before acting.
            </p>
          </div>
        </div>
      </PageContent>
    </AppShell>
  )
}