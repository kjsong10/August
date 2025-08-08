export type DbConversation = {
  id: string
  user_id: string
  title: string | null
  created_at: string
  updated_at: string
}

export type DbMessage = {
  id: string
  conversation_id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  created_at: string
}


