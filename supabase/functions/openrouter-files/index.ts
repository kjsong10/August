import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

function corsHeaders(origin?: string) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

type UploadFileInput = { name: string; type: string; base64: string }

serve(async (req) => {
  const origin = req.headers.get('Origin') ?? undefined
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })

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

  let body: { files?: UploadFileInput[] }
  try {
    body = await req.json()
  } catch (_) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  }
  const files = body.files || []
  const results: Array<{ name: string; type: string; id?: string; error?: string }> = []

  for (const f of files) {
    try {
      const binary = atob(f.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: f.type || 'application/octet-stream' })
      const form = new FormData()
      form.append('file', new File([blob], f.name || 'file'))

      const resp = await fetch('https://openrouter.ai/api/v1/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://example.com',
          'X-Title': 'August Chat',
        },
        body: form,
      })
      if (!resp.ok) {
        const t = await resp.text()
        results.push({ name: f.name, type: f.type, error: t })
        continue
      }
      const json = await resp.json()
      const id = json?.id || json?.data?.id || json?.file?.id
      results.push({ name: f.name, type: f.type, id })
    } catch (e) {
      results.push({ name: f.name, type: f.type, error: String(e) })
    }
  }

  return new Response(JSON.stringify({ files: results }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
})


