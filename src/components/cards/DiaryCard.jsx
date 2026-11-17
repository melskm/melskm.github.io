import { useCallback, useEffect, useMemo, useState } from 'react'
import Card from '../Card'
import { supabase } from '../../lib/supabaseClient'
import {
  NORMS,
  BURN_KCAL,
  MEALS,
  PROTEIN_MIN,
  EVENING_HOUR,
  CARBS_CUTOFF_HOUR,
  mealByHour,
  dayTypeKey,
} from '../../lib/nutrition'

const todayStr = () => new Date().toLocaleDateString('sv-SE')

const shiftDate = (date, days) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('sv-SE')
}

const fmtDate = (date) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`))

const inputClass =
  'w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-sm text-white/90 placeholder-white/30 outline-none focus:border-violet-300/40'

function MacroBar({ label, value, target }) {
  const over = value > target
  return (
    <div>
      <div className="text-xs text-white/70">{label}</div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full rounded-full transition-all ${over ? 'bg-red-400' : 'bg-emerald-300'}`}
          style={{ width: `${Math.min((value / target) * 100, 100)}%` }}
        />
      </div>
      <div className={`mt-1 text-sm font-medium ${over ? 'text-red-300' : 'text-white/90'}`}>
        {value} / {target} г
      </div>
    </div>
  )
}

function KcalRing({ eaten, norm }) {
  const over = eaten > norm
  const pct = norm ? Math.min(eaten / norm, 1) : 0
  const R = 54
  const C = 2 * Math.PI * R
  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 140 140" className="h-full w-full">
        <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="10" />
        <circle
          cx="70"
          cy="70"
          r={R}
          fill="none"
          stroke={over ? '#f87171' : '#ffffff'}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${C * pct} ${C}`}
          transform="rotate(-90 70 70)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-semibold ${over ? 'text-red-300' : 'text-white'}`}>{eaten}</span>
        <span className="text-xs text-white/60">ккал съедено</span>
      </div>
    </div>
  )
}

export default function DiaryCard({ className = '' }) {
  const [date, setDate] = useState(todayStr())
  const [dayType, setDayType] = useState('rest')
  const [meals, setMeals] = useState([])
  const [saving, setSaving] = useState(false)
  const [carbWarn, setCarbWarn] = useState(false)
  const [settingsOk, setSettingsOk] = useState(true)
  const [form, setForm] = useState({
    name: '',
    kcal: '',
    protein: '',
    fat: '',
    carbs: '',
    meal: mealByHour(new Date().getHours()),
  })

  const norm = NORMS[dayType]
  const isToday = date === todayStr()

  const load = useCallback(async () => {
    const { data } = await supabase.from('meals').select('*').eq('date', date).order('created_at', { ascending: true })
    if (data) setMeals(data)

    const { data: st, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', dayTypeKey(date))
      .maybeSingle()
    if (error) {
      setSettingsOk(false) // таблица settings ещё не создана — работаем в режиме «отдых»
      setDayType('rest')
    } else {
      setSettingsOk(true)
      setDayType(st?.value === 'gym' ? 'gym' : 'rest')
    }
  }, [date])

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  const totals = useMemo(
    () =>
      meals.reduce(
        (acc, m) => ({
          kcal: acc.kcal + Number(m.kcal || 0),
          protein: acc.protein + Number(m.protein || 0),
          fat: acc.fat + Number(m.fat || 0),
          carbs: acc.carbs + Number(m.carbs || 0),
        }),
        { kcal: 0, protein: 0, fat: 0, carbs: 0 },
      ),
    [meals],
  )

  const byMeal = useMemo(() => {
    const grouped = Object.fromEntries(MEALS.map((m) => [m.id, []]))
    for (const m of meals) {
      const key = grouped[m.meal] ? m.meal : mealByHour(new Date(m.created_at).getHours())
      grouped[key].push(m)
    }
    return grouped
  }, [meals])

  const carbsAfter16 = meals.reduce(
    (a, m) => (new Date(m.created_at).getHours() >= CARBS_CUTOFF_HOUR ? a + Number(m.carbs || 0) : a),
    0,
  )
  const proteinLow = isToday && new Date().getHours() >= EVENING_HOUR && totals.protein < PROTEIN_MIN

  const toggleDayType = async () => {
    const next = dayType === 'gym' ? 'rest' : 'gym'
    setDayType(next)
    const { error } = await supabase.from('settings').upsert({ key: dayTypeKey(date), value: next })
    if (error) setSettingsOk(false)
  }

  const addMeal = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    if (new Date().getHours() >= CARBS_CUTOFF_HOUR && Number(form.carbs) > 0) setCarbWarn(true)
    const row = {
      name: form.name.trim(),
      kcal: Number(form.kcal) || 0,
      protein: Number(form.protein) || 0,
      fat: Number(form.fat) || 0,
      carbs: Number(form.carbs) || 0,
      meal: form.meal,
      date,
    }
    let { error } = await supabase.from('meals').insert(row)
    if (error?.message?.includes("'meal' column")) {
      // колонки meal ещё нет (не выполнен SQL) — вставляем без неё
      const { meal, ...withoutMeal } = row
      ;({ error } = await supabase.from('meals').insert(withoutMeal))
    }
    if (error) console.error(error)
    setForm({ name: '', kcal: '', protein: '', fat: '', carbs: '', meal: mealByHour(new Date().getHours()) })
    setSaving(false)
    await load()
  }

  const removeMeal = async (id) => {
    await supabase.from('meals').delete().eq('id', id)
    await load()
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <Card className={`flex flex-col overflow-y-auto ${className}`}>
      {/* Шапка-дневник, как на макете */}
      <div className="bg-gradient-to-b from-violet-600/50 via-purple-700/35 to-transparent p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Дневник</h2>
          <div className="flex rounded-full border border-white/15 bg-white/10 p-0.5 text-xs">
            {[
              { id: 'rest', label: 'День отдыха' },
              { id: 'gym', label: 'День зала' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={toggleDayType}
                className={`rounded-full px-3 py-1 transition-colors ${
                  dayType === t.id ? 'bg-white/90 font-medium text-purple-900' : 'text-white/70 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <MacroBar label="Белки" value={totals.protein} target={norm.protein} />
          <MacroBar label="Жиры" value={totals.fat} target={norm.fat} />
          <MacroBar label="Углеводы" value={totals.carbs} target={norm.carbs} />
        </div>

        <div className="mt-4 flex items-center justify-around">
          <div className="w-20 text-center">
            <div className="text-xl font-semibold text-white">{norm.kcal}</div>
            <div className="text-xs text-white/60">норма</div>
          </div>
          <KcalRing eaten={totals.kcal} norm={norm.kcal} />
          <div className="w-20 text-center">
            <div className="text-xl font-semibold text-white">{BURN_KCAL[dayType]}</div>
            <div className="text-xs text-white/60">сожжено</div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-sm text-white/80">
          <button onClick={() => setDate(shiftDate(date, -1))} className="px-2 py-1 text-white/60 hover:text-white">
            ‹
          </button>
          <span>{isToday ? `Сегодня, ${fmtDate(date)}` : fmtDate(date)}</span>
          <button
            onClick={() => setDate(shiftDate(date, 1))}
            disabled={isToday}
            className="px-2 py-1 text-white/60 hover:text-white disabled:opacity-20"
          >
            ›
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {proteinLow && (
            <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-1 text-amber-200">
              Белок недобран ({totals.protein}/{PROTEIN_MIN} г)
            </span>
          )}
          {(carbWarn || carbsAfter16 > 0) && (
            <span className="rounded-full border border-orange-300/30 bg-orange-400/10 px-2.5 py-1 text-orange-200">
              Углеводы после 16:00{carbsAfter16 > 0 ? `: ${carbsAfter16} г` : ''}
            </span>
          )}
          {!settingsOk && (
            <span className="rounded-full border border-red-300/30 bg-red-400/10 px-2.5 py-1 text-red-200">
              Нет таблицы settings — выполни SQL из чата
            </span>
          )}
        </div>
      </div>

      {/* Приёмы пищи */}
      <div className="p-4 pt-2 sm:p-5 sm:pt-2">
        <h3 className="mb-3 text-sm font-medium text-white/70">Приёмы пищи</h3>
        <div className="grid grid-cols-2 gap-3">
          {MEALS.map((m) => {
            const items = byMeal[m.id]
            const kcal = items.reduce((a, i) => a + Number(i.kcal || 0), 0)
            const over = kcal > m.targetKcal
            return (
              <div key={m.id} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white/90">{m.title}</span>
                  <span className="rounded-full bg-violet-400/15 px-2 py-0.5 text-[10px] text-violet-200">{m.time}</span>
                </div>
                <div className={`mt-2 text-lg font-semibold ${over ? 'text-red-300' : 'text-white'}`}>
                  {kcal} <span className="text-xs font-normal text-white/50">ккал</span>
                  <span className="ml-1 text-2xl leading-none">{m.emoji}</span>
                </div>
                <div className="text-xs text-white/40">из {m.targetKcal} ккал</div>
                <ul className="mt-2 space-y-1">
                  {items.map((i) => (
                    <li key={i.id} className="group flex items-center justify-between gap-1 text-xs text-white/60">
                      <span className="truncate">{i.name}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {i.kcal}
                        <button
                          onClick={() => removeMeal(i.id)}
                          className="text-white/25 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
                          title="Удалить"
                        >
                          ×
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        {/* Форма добавления */}
        <form onSubmit={addMeal} className="mt-4 flex flex-col gap-2">
          <div className="flex gap-2">
            <select value={form.meal} onChange={set('meal')} className={`${inputClass} w-28 shrink-0`}>
              {MEALS.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#101415]">
                  {m.title}
                </option>
              ))}
            </select>
            <input className={inputClass} placeholder="Название еды" value={form.name} onChange={set('name')} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <input className={inputClass} type="number" min="0" placeholder="ккал" value={form.kcal} onChange={set('kcal')} />
            <input className={inputClass} type="number" min="0" placeholder="Б" value={form.protein} onChange={set('protein')} />
            <input className={inputClass} type="number" min="0" placeholder="Ж" value={form.fat} onChange={set('fat')} />
            <input className={inputClass} type="number" min="0" placeholder="У" value={form.carbs} onChange={set('carbs')} />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg border border-violet-300/25 bg-violet-400/15 py-1.5 text-sm text-violet-100 transition-colors hover:bg-violet-400/25 disabled:opacity-50"
          >
            Добавить
          </button>
        </form>
      </div>
    </Card>
  )
}
