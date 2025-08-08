import './App.css'
import AuthGate from './components/AuthGate'
import Chat from './components/Chat'

export default function App() {
  return (
    <AuthGate>
      <Chat />
    </AuthGate>
  )
}
