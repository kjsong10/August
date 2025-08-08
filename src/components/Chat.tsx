import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type Conversation = {
  id: string
  user_id: string
  title: string | null
  created_at: string
  updated_at: string
}

type Message = {
  id: string
  conversation_id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  created_at: string
}

export default function Chat() {
  const [userId, setUserId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let isMounted = true
    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return
      setUserId(data.user?.id ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user.id ?? null)
    })
    return () => {
      isMounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    ;(async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
      if (!error && data) {
        setConversations(data as Conversation[])
        if (data.length && !activeId) setActiveId(data[0].id)
      }
    })()
  }, [userId])

  useEffect(() => {
    if (!activeId) return
    ;(async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', activeId)
        .order('created_at', { ascending: true })
      setMessages((data ?? []) as Message[])
    })()
  }, [activeId])

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  )

  async function ensureConversation(): Promise<string> {
    if (activeId) return activeId
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: userId })
      .select('id')
      .single()
    if (error || !data) throw error ?? new Error('Failed to create conversation')
    const newId = data.id as string
    setConversations((prev) => [
      { id: newId, user_id: userId!, title: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      ...prev,
    ])
    setActiveId(newId)
    return newId
  }

  async function handleSend() {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      const conversationId = await ensureConversation()

      // Insert user message
      const userMessageContent = input.trim()
      setInput('')
      const { data: insertedUser } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, role: 'user', content: userMessageContent })
        .select('*')
        .single()
      if (insertedUser) {
        setMessages((prev) => [...prev, insertedUser as Message])
      }

      // Title the conversation on first message
      if (!activeConversation?.title) {
        await supabase
          .from('conversations')
          .update({ title: userMessageContent.slice(0, 60) })
          .eq('id', conversationId)
      }

      // Prepare the prompt
      const messagesForLLM = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: userMessageContent },
      ]

      // Call Edge Function
      const { data: response, error } = await supabase.functions.invoke('openrouter-chat', {
        body: { messages: messagesForLLM },
      })
      if (error) throw error
      const assistantText = (response?.content as string) ?? ''

      if (assistantText) {
        const { data: insertedAssistant } = await supabase
          .from('messages')
          .insert({ conversation_id: conversationId, role: 'assistant', content: assistantText })
          .select('*')
          .single()
        if (insertedAssistant) {
          setMessages((prev) => [...prev, insertedAssistant as Message])
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err)
      alert('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  async function handleNewConversation() {
    setActiveId(null)
    setMessages([])
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: '100vh' }}>
      <aside style={{ borderRight: '1px solid #eee', padding: 12, overflow: 'auto' }}>
        <button onClick={handleNewConversation} style={{ width: '100%', marginBottom: 12 }}>
          + New chat
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              style={{
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #eee',
                background: c.id === activeId ? '#f5f5f5' : 'white',
              }}
            >
              {c.title || 'Untitled chat'}
            </button>
          ))}
        </div>
      </aside>
      <main style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {messages.length === 0 ? (
            <div style={{ color: '#666' }}>Start the conversation…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.map((m) => (
                <div key={m.id} style={{ whiteSpace: 'pre-wrap' }}>
                  <strong style={{ textTransform: 'capitalize' }}>{m.role}:</strong> {m.content}
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ borderTop: '1px solid #eee', padding: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              placeholder="Type your message…"
              style={{ flex: 1, resize: 'vertical' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
            <button onClick={handleSend} disabled={sending || !input.trim()}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}


