import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function SupabaseStatus() {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let alive = true

    const check = async () => {
      const { error } = await supabase.from('meals').select('id', { count: 'exact', head: true })
      if (alive) setStatus(error ? 'error' : 'ok')
    }

    check()
    const id = setInterval(check, 30000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const styles = {
    ok: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200',
    error: 'border-red-300/20 bg-red-400/10 text-red-200',
    checking: 'border-white/10 bg-white/[0.04] text-white/50',
  }
  const dot = {
    ok: 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]',
    error: 'bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.8)]',
    checking: 'bg-white/40 animate-pulse',
  }
  const label = {
    ok: 'Подключено к Supabase',
    error: 'Нет подключения к Supabase',
    checking: 'Подключение к Supabase…',
  }

  return (
    <div
      className={`fixed bottom-20 right-3 z-30 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs backdrop-blur-md lg:bottom-4 lg:right-4 ${styles[status]}`}
    >
      <span className={`h-2 w-2 rounded-full ${dot[status]}`} />
      {label[status]}
    </div>
  )
}
