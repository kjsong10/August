# August Chat (React + TS + Vite + Supabase + OpenRouter)

Minimal ChatGPT-style app using Supabase for auth/DB and Edge Functions for calling OpenRouter.

### 1) Environment

Create `.env` in project root:

```
VITE_SUPABASE_URL=YOUR_PROJECT_URL
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

### 2) Database

Run `supabase/migrations/0001_init.sql` in SQL Editor to create tables (`profiles`, `conversations`, `messages`), RLS, and triggers.

### 3) Edge Function

Create function `openrouter-chat` from `supabase/functions/openrouter-chat/index.ts`.
Set secrets:
- `OPENROUTER_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 4) Dev

```
npm install
npm run dev
```

### Notes
- Frontend never touches `OPENROUTER_API_KEY`.
- Change model in the function (`openai/gpt-4o-mini`).
