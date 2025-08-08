import { useEffect, useState } from 'react'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '../lib/supabaseClient'

type Props = { children: React.ReactNode }

export default function AuthGate({ children }: Props) {
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthed, setIsAuthed] = useState(false)

  useEffect(() => {
    let isMounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setIsAuthed(!!data.session)
      setIsLoading(false)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setIsAuthed(!!session)
      }
    )
    return () => {
      isMounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  if (isLoading) return <div style={{ padding: 24 }}>Loading…</div>

  if (!isAuthed) {
    return (
      <div style={{ maxWidth: 420, margin: '48px auto' }}>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={['google']}
        />
      </div>
    )
  }

  return <>{children}</>
}


