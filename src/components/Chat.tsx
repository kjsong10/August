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
  const [searchQuery, setSearchQuery] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [pendingQuery, setPendingQuery] = useState<string | null>(null)
  const [hoveredConversationId, setHoveredConversationId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const MODEL_OPTIONS = [
    { value: 'openai/gpt-oss-20b:free', label: 'GPT-OSS-20B (free)' },
    { value: 'z-ai/glm-4.5-air:free', label: 'GLM-4.5 Air (free)' },
    { value: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder (free)' },
    { value: 'moonshotai/kimi-k2:free', label: 'Kimi K2 (free)' },
    {
      value: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
      label: 'Dolphin Mistral 24B Venice (free)',
    },
  ] as const
  const [selectedModel, setSelectedModel] = useState<string>(MODEL_OPTIONS[0].value)

  useEffect(() => {
    let isMounted = true
    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return
      const user = data.user
      setUserId(user?.id ?? null)
      setUserEmail(user?.email ?? null)
      const meta: any = user?.user_metadata ?? {}
      const nameFromMeta = meta.full_name || meta.name || meta.user_name
      const fallbackFromEmail = user?.email ? String(user.email).split('@')[0] : null
      setDisplayName(nameFromMeta || fallbackFromEmail)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const user = session?.user
      setUserId(user?.id ?? null)
      setUserEmail(user?.email ?? null)
      const meta: any = user?.user_metadata ?? {}
      const nameFromMeta = meta.full_name || meta.name || meta.user_name
      const fallbackFromEmail = user?.email ? String(user.email).split('@')[0] : null
      setDisplayName(nameFromMeta || fallbackFromEmail)
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

  // Homepage prompt disabled: do not ingest ?q anymore
  useEffect(() => {
    setPendingQuery(null)
  }, [])

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

  // Persist model choice in localStorage
  useEffect(() => {
    const saved = localStorage.getItem('august:selectedModel')
    if (saved) setSelectedModel(saved)
  }, [])
  useEffect(() => {
    localStorage.setItem('august:selectedModel', selectedModel)
  }, [selectedModel])

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  )

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return conversations
    return conversations.filter((c) => (c.title || 'Untitled chat').toLowerCase().includes(query))
  }, [conversations, searchQuery])

  function formatRelativeGroup(dateIso: string): string {
    const now = new Date()
    const d = new Date(dateIso)
    // Normalize both to local midnight to avoid off-by-one
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfThatDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const diffDays = Math.round((startOfToday - startOfThatDay) / (1000 * 60 * 60 * 24))

    if (diffDays <= 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 14) return 'Last week'
    if (diffDays < 21) return '2 weeks ago'
    if (diffDays < 28) return '3 weeks ago'
    // 4+ weeks ago: show Month Year
    const month = d.toLocaleString(undefined, { month: 'long' })
    return `${month} ${d.getFullYear()}`
  }

  const groupedConversations = useMemo(() => {
    const groups: { label: string; items: Conversation[] }[] = []
    let currentLabel: string | null = null
    let currentItems: Conversation[] = []
    for (const c of filteredConversations) {
      const label = formatRelativeGroup(c.updated_at || c.created_at)
      if (label !== currentLabel) {
        if (currentLabel) groups.push({ label: currentLabel, items: currentItems })
        currentLabel = label
        currentItems = [c]
      } else {
        currentItems.push(c)
      }
    }
    if (currentLabel) groups.push({ label: currentLabel, items: currentItems })
    return groups
  }, [filteredConversations])

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
    const text = (pendingQuery ?? input).trim()
    if (!text || sending) return
    setSending(true)
    try {
      const conversationId = await ensureConversation()

      // Insert user message
      const userMessageContent = text
      setInput('')
      if (pendingQuery) setPendingQuery(null)
      const { data: insertedUser } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, role: 'user', content: userMessageContent })
        .select('*')
        .single()
      if (insertedUser) {
        setMessages((prev) => [...prev, insertedUser as Message])
      }

      // Title the conversation on first message using a compact summary
      if (!activeConversation?.title) {
        const summarized = userMessageContent.length > 60 ? `${userMessageContent.slice(0, 57)}…` : userMessageContent
        await supabase
          .from('conversations')
          .update({ title: summarized })
          .eq('id', conversationId)
      }

      // Prepare the prompt
      const messagesForLLM = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: userMessageContent },
      ]

      // Call Edge Function with user access token
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      const { data: response, error } = await supabase.functions.invoke('openrouter-chat', {
        body: { messages: messagesForLLM, model: selectedModel },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      })
      if (error) throw error
      const assistantText = (response?.content as string) ?? ''

      if (assistantText) {
        // Typing effect: show assistant text progressively, then persist
        const tempId = `temp-${Date.now()}`
        setMessages((prev) => [
          ...prev,
          {
            id: tempId,
            conversation_id: conversationId,
            role: 'assistant',
            content: '',
            created_at: new Date().toISOString(),
          } as Message,
        ])

        await new Promise<void>((resolve) => {
          const total = assistantText.length
          let i = 0
          const step = Math.max(1, Math.floor(total / 120)) // ~120 steps
          const interval = setInterval(() => {
            i = Math.min(total, i + step)
            const partial = assistantText.slice(0, i)
            setMessages((prev) =>
              prev.map((m) => (m.id === tempId ? { ...m, content: partial } : m))
            )
            if (i >= total) {
              clearInterval(interval)
              resolve()
            }
          }, 20)
        })

        const { data: insertedAssistant } = await supabase
          .from('messages')
          .insert({ conversation_id: conversationId, role: 'assistant', content: assistantText })
          .select('*')
          .single()
        if (insertedAssistant) {
          const finalMsg = insertedAssistant as Message
          setMessages((prev) => prev.map((m) => (m.id === tempId ? finalMsg : m)))
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

  async function handleSignOut() {
    try {
      await supabase.auth.signOut()
      setAccountOpen(false)
      // AuthGate will switch back to login automatically
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e)
      alert('Failed to sign out')
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#ffffff' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: sidebarCollapsed ? 64 : 260,
          transition: 'width 200ms ease',
          background: '#ffffff',
          borderRight: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          padding: 12,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          {!sidebarCollapsed && (
            <button
              onClick={handleNewConversation}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                background: '#111827',
                color: 'white',
                transition: 'background 150ms ease',
              }}
            >
              + New chat
            </button>
          )}
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: '#ffffff',
              color: '#111827',
              width: sidebarCollapsed ? '100%' : undefined,
              transition: 'background 150ms ease',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {sidebarCollapsed ? (
              // Chevron right
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Expand">
                <path d="M6 3L11 8L6 13" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              // Chevron left
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Collapse">
                <path d="M10 3L5 8L10 13" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
        {!sidebarCollapsed && (
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#6b7280',
                pointerEvents: 'none',
              }}
            >
              <path
                d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"
                stroke="#6b7280"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M21 21l-3.5-3.5"
                stroke="#6b7280"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats"
              style={{
                width: '100%',
                padding: '10px 12px 10px 36px',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                background: '#ffffff',
                color: '#111827',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}
        {!sidebarCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, transition: 'opacity 200ms ease' }}>
            {groupedConversations.map((group) => (
              <div key={group.label}>
                <div style={{ fontSize: 12, color: '#6b7280', margin: '8px 4px' }}>{group.label}</div>
                {group.items.map((c) => (
                  <div
                    key={c.id}
                    onMouseEnter={() => setHoveredConversationId(c.id)}
                    onMouseLeave={() => setHoveredConversationId((prev) => (prev === c.id ? null : prev))}
                  >
                    <button
                      onClick={() => setActiveId(c.id)}
                      style={{
                        position: 'relative',
                        textAlign: 'left',
                        padding: '10px 36px 10px 12px',
                        borderRadius: 8,
                        border: 'none',
                        background:
                          c.id === activeId
                            ? '#f3f4f6'
                            : hoveredConversationId === c.id
                            ? '#f9fafb'
                            : '#ffffff',
                        color: '#111827',
                        width: '100%',
                        transition: 'background 150ms ease',
                      }}
                      title={c.title || 'Untitled chat'}
                    >
                      <span style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.title || 'Untitled chat'}
                      </span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDeleteId(c.id)
                        }}
                        title="Delete"
                        style={{
                          position: 'absolute',
                          right: 8,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          display: hoveredConversationId === c.id ? 'inline-flex' : 'none',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                          <path d="M3 6h18" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="#6b7280" strokeWidth="2" />
                          <path d="M10 11v6M14 11v6" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
                          <path d="M9 6l1-2h4l1 2" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Chat area */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar with model selector */}
        <div style={{ borderBottom: '1px solid #e5e7eb', background: '#ffffff' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <select
              id="model"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                border: 'none',
                borderRadius: 8,
                padding: '8px 12px',
                background: '#ffffff',
                color: '#111827',
                outline: 'none',
                boxShadow: 'none',
                cursor: 'pointer',
                fontSize: '1.5em',
              }}
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <div style={{ marginLeft: 'auto', position: 'relative' }}>
              <button
                onClick={() => setAccountOpen((v) => !v)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid #e5e7eb',
                  background: '#ffffff',
                  color: '#111827',
                  cursor: 'pointer',
                }}
                title={userEmail || ''}
              >
                {displayName || userEmail || 'Account'}
              </button>
              {accountOpen && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    marginTop: 8,
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: '10px 12px',
                    minWidth: 220,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    zIndex: 10,
                  }}
                >
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Email</div>
                  <div style={{ fontSize: 14, color: '#111827', wordBreak: 'break-all' }}>{userEmail || '—'}</div>
                  <div style={{ height: 1, background: '#e5e7eb', margin: '10px -12px' }} />
                  <button
                    onClick={handleSignOut}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid #e5e7eb',
                      background: '#ffffff',
                      color: '#b91c1c',
                      cursor: 'pointer',
                    }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Messages scroll area */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
            {messages.length === 0 ? (
              <div style={{ color: '#6b7280', textAlign: 'center', marginTop: 40 }}>
                Start the conversation…
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.map((m) => {
                  const isUser = m.role === 'user'
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                      <div
                        style={{
                          maxWidth: '85%',
                          whiteSpace: 'pre-wrap',
                          background: isUser ? '#93c5fd' : '#ffffff',
                          border: '1px solid #e5e7eb',
                          color: '#111827',
                          padding: '10px 12px',
                          borderRadius: 12,
                          borderTopRightRadius: isUser ? 4 : 12,
                          borderTopLeftRadius: isUser ? 12 : 4,
                          boxShadow: '0 1px 1px rgba(0,0,0,0.03)',
                        }}
                      >
                        {m.content}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div style={{ borderTop: '1px solid #e5e7eb', padding: 12, background: '#ffffff' }}>
          <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', gap: 8 }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              placeholder="Type your message…"
              style={{
                flex: 1,
                resize: 'vertical',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: '10px 12px',
                outline: 'none',
                color: '#111827',
                fontFamily: 'inherit',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              style={{
                padding: '0 16px',
                borderRadius: 10,
                background: sending || !input.trim() ? '#9ca3af' : '#111827',
                color: 'white',
                border: 'none',
              }}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </main>
      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 16,
              width: 420,
              maxWidth: '90%',
              boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            }}
          >
            <div style={{ fontSize: 18, color: '#111827', marginBottom: 8 }}>Delete this chat?</div>
            <div style={{ color: '#6b7280', marginBottom: 16 }}>This will permanently remove the conversation and its messages.</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setConfirmDeleteId(null)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  background: '#ffffff',
                  color: '#111827',
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const id = confirmDeleteId
                  if (!id) return
                  setConfirmDeleteId(null)
                  try {
                    await supabase.from('conversations').delete().eq('id', id)
                    setConversations((prev) => prev.filter((x) => x.id !== id))
                    if (activeId === id) {
                      const fallback = conversations.find((c) => c.id !== id)
                      setActiveId(fallback ? fallback.id : null)
                      setMessages([])
                    }
                  } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error(e)
                    alert('Failed to delete conversation')
                  }
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #ef4444',
                  background: '#ef4444',
                  color: 'white',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


