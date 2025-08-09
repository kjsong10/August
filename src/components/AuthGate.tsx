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
      <div
        style={{
          minHeight: '100vh',
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div style={{ width: '100%', maxWidth: 420 }}>
          <Auth
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: '#111827',
                    brandAccent: '#111827',
                    defaultButtonBackground: '#ffffff',
                    defaultButtonBackgroundHover: '#f9fafb',
                    defaultButtonBorder: '#e5e7eb',
                    defaultButtonText: '#111827',
                    inputBackground: '#ffffff',
                    inputBorder: '#e5e7eb',
                    inputBorderHover: '#cbd5e1',
                    inputText: '#111827',
                    messageText: '#111827',
                  },
                },
              },
            }}
          />
        </div>
      </div>
    )
  }

  return <>{children}</>
}


