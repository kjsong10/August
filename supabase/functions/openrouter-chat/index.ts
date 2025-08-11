// Deno Deploy / Supabase Edge Function
// Invoked from client with the Supabase Access Token in Authorization header

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

function corsHeaders(origin?: string) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

serve(async (req) => {
  const origin = req.headers.get('Origin') ?? undefined
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }

  // Auth check
  const authHeader = req.headers.get('Authorization')
  const accessToken = authHeader?.replace('Bearer ', '')
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({ error: 'Missing server configuration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(accessToken)
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  }

  let body: { messages?: ChatMessage[]; model?: string; enableWeb?: boolean }
  try {
    body = await req.json()
  } catch (_) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  }

  const messages = body.messages ?? []
  const model = body.model || 'openai/gpt-oss-20b:free'
  const enableWeb = Boolean(body.enableWeb)
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages must be a non-empty array' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  }

  const headers = {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://example.com',
    'X-Title': 'August Chat',
  }

  // Try model-specific payloads first when web is enabled
  const attempts: Array<Record<string, unknown>> = []
  if (enableWeb) {
    if (model.startsWith('google/')) {
      attempts.push({ model, messages, stream: false, web_search: { enable: true } })
      attempts.push({ model, messages, stream: false, tools: [{ type: 'web_search' }] })
    } else {
      attempts.push({ model, messages, stream: false, tools: [{ type: 'web_search' }] })
    }
  }
  // Always include a no-tools fallback
  attempts.push({ model, messages, stream: false })

  let resp: Response | null = null
  let lastDetail: unknown = null
  for (const payload of attempts) {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    if (r.ok) {
      resp = r
      break
    }
    try {
      lastDetail = await r.json()
    } catch (_) {
      lastDetail = await r.text()
    }
  }

  if (!resp) {
    let detail: unknown
    detail = lastDetail
    return new Response(JSON.stringify({ error: 'OpenRouter error', detail }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  }

  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content ?? ''
  return new Response(JSON.stringify({ content }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
})