// Cloudflare Worker — Telegram-бот трекера КБЖУ (webhook-версия bot/bot.mjs).
// Telegram шлёт обновления POST'ом на /webhook; обработка идёт в ctx.waitUntil.
// Секреты (wrangler secret put): TELEGRAM_TOKEN, KIMI_API_KEY, WEBHOOK_SECRET.
// Vars (wrangler.toml): SUPABASE_URL, SUPABASE_KEY. KV-биндинг: PENDING_MEALS.

import { NORMS, MEALS, mealByHour, mealTitle, dayTypeKey } from '../../src/lib/nutrition.js'

const LLM_BASE_URL = 'https://api.kimi.ai/coding/v1'
const LLM_MODEL = 'kimi-for-coding' // мультимодальная модель (текст + фото)

// Время бота — московское (воркеры живут в UTC)
const todayLocal = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' })
const hourMsk = () =>
  Number(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow', hour: 'numeric', hour12: false }))

// fetch с повторами; бюджет времени воркера ~30 с, поэтому таймауты короче, чем в polling-боте
async function fetchRetry(url, opts = {}, tries = 2, timeoutMs = 8000) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) })
    } catch (err) {
      lastErr = err
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
    }
  }
  throw lastErr
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

const PROMPT = `Ты — нутрициолог, считающий КБЖУ строго по этикетке с упаковки.

Пользователь присылает фото (чаще всего упаковку продукта с таблицей «пищевая ценность на 100 г») и/или текст, где говорит, сколько он съел: «съем 2 пакетика», «2 котлеты из этой упаковки», «150 г» и т.п.

Алгоритм:
1. Если на фото есть этикетка с КБЖУ на 100 г — возьми значения ТОЛЬКО с неё, не выдумывай свои.
2. Определи съеденный вес:
   - указан вес («150 г») — бери его;
   - указаны штуки («2 котлеты», «2 пакетика») — найди на упаковке вес нетто и/или число штук/порций в упаковке и вычисли вес съеденного (упаковка 400 г, 4 котлеты → 2 котлеты = 200 г). Если точный вес штуки не определить — оцени типичный вес такой штуки;
   - количество не указано — считай на всю упаковку или среднюю порцию.
3. Итог = значение_на_100г × вес_съеденного / 100.
4. Если этикетки нет или она нечитаема — только тогда оцени КБЖУ сам, как нутрициолог.

Верни СТРОГО JSON без markdown и пояснений:
{"items":[{"name":"название + количество, напр. «котлеты из индейки, 2 шт (200 г)»","kcal":0,"protein":0,"fat":0,"carbs":0,"barcode":"4600000000000","weight_g":0,"meal":"breakfast","note":"основа расчёта"}]}
Правила:
- kcal/protein/fat/carbs — ИТОГ за съеденное количество, целые числа (БЖУ в граммах);
- meal — тип приёма пищи: breakfast (завтрак) / lunch (обед) / snack (перекус) / dinner (ужин), если понятно из текста («на завтрак…»); иначе null;
- barcode — штрихкод с упаковки (только цифры), если читается; если нет — null;
- weight_g — съеденный вес в граммах (по весу нетто/числу штук на упаковке или твоей оценке), число;
- note — кратко, откуда цифры: напр. «по этикетке: 330/7/1/74 на 100 г × 80 г» или «этикетка не читается, типичные значения для такого продукта»;
- несколько продуктов — каждый отдельным элементом массива;
- если еды нет или понять невозможно — {"items":[]}.`

async function estimateNutrition(env, { text, imageBase64 }) {
  const content = []
  if (imageBase64) {
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } })
  }
  content.push({ type: 'text', text: text ? `${PROMPT}\n\nОписание от пользователя: ${text}` : PROMPT })

  const res = await fetchRetry(
    `${LLM_BASE_URL}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.KIMI_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: 'user', content }],
        temperature: 1,
      }),
    },
    1,
    20000,
  )
  if (!res.ok) throw new Error(`LLM API: ${res.status} ${await res.text()}`)
  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content || ''
  const cleaned = raw.replace(/```json|```/g, '').trim()
  const jsonText = cleaned.startsWith('{') ? cleaned : cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1)
  const parsed = JSON.parse(jsonText)
  return (parsed.items || []).map((it) => ({
    name: String(it.name || 'Еда'),
    kcal: Math.round(Number(it.kcal) || 0),
    protein: Math.round(Number(it.protein) || 0),
    fat: Math.round(Number(it.fat) || 0),
    carbs: Math.round(Number(it.carbs) || 0),
    note: it.note ? String(it.note) : null,
    barcode: it.barcode ? String(it.barcode).replace(/\D/g, '') : null,
    weight_g: Math.round(Number(it.weight_g) || 0),
    meal: ['breakfast', 'lunch', 'snack', 'dinner'].includes(it.meal) ? it.meal : null,
  }))
}

// Тип дня (rest/gym) из таблицы settings; если таблицы нет — rest
async function getDayType(env, date) {
  try {
    const res = await fetchRetry(
      `${env.SUPABASE_URL}/rest/v1/settings?key=eq.${encodeURIComponent(dayTypeKey(date))}&select=value`,
      { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` } },
      2,
      6000,
    )
    if (!res.ok) return 'rest'
    const rows = await res.json()
    return rows[0]?.value === 'gym' ? 'gym' : 'rest'
  } catch {
    return 'rest'
  }
}

// Итоги КБЖУ за день
async function getDayTotals(env, date) {
  const res = await fetchRetry(
    `${env.SUPABASE_URL}/rest/v1/meals?date=eq.${date}&select=kcal,protein,fat,carbs`,
    { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` } },
    2,
    6000,
  )
  if (!res.ok) throw new Error(`Supabase: ${res.status}`)
  const rows = await res.json()
  return rows.reduce(
    (a, m) => ({
      kcal: a.kcal + Number(m.kcal || 0),
      protein: a.protein + Number(m.protein || 0),
      fat: a.fat + Number(m.fat || 0),
      carbs: a.carbs + Number(m.carbs || 0),
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  )
}

// Точные КБЖУ по штрихкоду из открытой базы Open Food Facts (на 100 г)
async function lookupByBarcode(barcode) {
  const res = await fetchRetry(
    `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,nutriments`,
    {},
    2,
    6000,
  )
  if (!res.ok) return null
  const data = await res.json()
  if (data.status !== 1) return null
  const n = data.product?.nutriments || {}
  const kcal = n['energy-kcal_100g']
  if (kcal == null) return null
  return {
    kcal100: Math.round(Number(kcal)),
    protein100: Math.round(Number(n.proteins_100g) || 0),
    fat100: Math.round(Number(n.fat_100g) || 0),
    carbs100: Math.round(Number(n.carbohydrates_100g) || 0),
  }
}

// Если у продукта прочитан штрихкод и он есть в базе — пересчитываем КБЖУ точно по базе
async function enrichFromBarcode(items) {
  await Promise.all(
    items.map(async (it) => {
      if (!it.barcode || !it.weight_g) return
      try {
        const p = await lookupByBarcode(it.barcode)
        if (!p) return
        it.kcal = Math.round((p.kcal100 * it.weight_g) / 100)
        it.protein = Math.round((p.protein100 * it.weight_g) / 100)
        it.fat = Math.round((p.fat100 * it.weight_g) / 100)
        it.carbs = Math.round((p.carbs100 * it.weight_g) / 100)
        it.note = `по базе Open Food Facts: ${p.kcal100}/${p.protein100}/${p.fat100}/${p.carbs100} на 100 г × ${it.weight_g} г`
      } catch (err) {
        console.error('OFF lookup failed:', err.message)
      }
    }),
  )
  return items
}

async function saveMeals(env, items) {
  const rows = items.map((it) => ({
    name: it.name,
    kcal: it.kcal,
    protein: it.protein,
    fat: it.fat,
    carbs: it.carbs,
    meal: it.meal,
    date: todayLocal(),
  }))
  const post = async (body) => {
    const res = await fetchRetry(
      `${env.SUPABASE_URL}/rest/v1/meals`,
      {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_KEY,
          Authorization: `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(body),
      },
      2,
      8000,
    )
    if (!res.ok) throw new Error(`Supabase: ${res.status} ${await res.text()}`)
    return res.json()
  }
  try {
    return await post(rows)
  } catch (err) {
    // колонки meal ещё нет (не выполнен SQL) — вставляем без неё
    if (err.message.includes("'meal' column")) return post(rows.map(({ meal, ...r }) => r))
    throw err
  }
}

async function tg(env, method, body) {
  const res = await fetchRetry(
    `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    2,
    8000,
  )
  const data = await res.json()
  if (!data.ok) throw new Error(`Telegram ${method}: ${JSON.stringify(data)}`)
  return data.result
}

async function downloadPhotoBase64(env, fileId) {
  const file = await tg(env, 'getFile', { file_id: fileId })
  const res = await fetchRetry(`https://api.telegram.org/file/bot${env.TELEGRAM_TOKEN}/${file.file_path}`, {}, 2, 10000)
  if (!res.ok) throw new Error(`Telegram file: ${res.status}`)
  return toBase64(await res.arrayBuffer())
}

const mealKeyboard = (chosen) => ({
  inline_keyboard: [
    MEALS.slice(0, 2).map((m) => ({
      text: `${chosen === m.id ? '✅ ' : ''}${m.title}`,
      callback_data: `setmeal:${m.id}`,
    })),
    MEALS.slice(2).map((m) => ({
      text: `${chosen === m.id ? '✅ ' : ''}${m.title}`,
      callback_data: `setmeal:${m.id}`,
    })),
  ],
})

// Нажатие кнопки «Завтрак/Обед/Перекус/Ужин» под записью — переносит её в другой приём пищи.
// Маппинг сообщение → id записей лежит в KV (переживает рестарты и неограничен по времени)
async function handleCallback(env, q) {
  const data = q.data || ''
  if (!data.startsWith('setmeal:') || !q.message) {
    return tg(env, 'answerCallbackQuery', { callback_query_id: q.id }).catch(() => {})
  }
  const meal = data.slice('setmeal:'.length)
  const chatId = q.message.chat.id
  const ids = await env.PENDING_MEALS.get(`meals:${chatId}:${q.message.message_id}`, 'json')
  if (!ids) {
    return tg(env, 'answerCallbackQuery', {
      callback_query_id: q.id,
      text: 'Не помню эту запись (она старше 7 дней)',
      show_alert: true,
    }).catch(() => {})
  }
  const res = await fetchRetry(
    `${env.SUPABASE_URL}/rest/v1/meals?id=in.(${ids.join(',')})`,
    {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_KEY,
        Authorization: `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ meal }),
    },
  ).catch((err) => ({ ok: false, err }))

  if (!res.ok) {
    return tg(env, 'answerCallbackQuery', {
      callback_query_id: q.id,
      text: 'Не удалось перенести запись.',
      show_alert: true,
    }).catch(() => {})
  }
  await tg(env, 'editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: q.message.message_id,
    reply_markup: mealKeyboard(meal),
  }).catch(() => {})
  await tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text: `Перенесено в «${mealTitle(meal)}»` }).catch(() => {})
  console.log('перенесено в', meal, ids.length, 'записей')
}

async function handleMessage(env, msg) {
  const chatId = msg.chat.id
  const text = msg.text || msg.caption || ''
  const photo = msg.photo?.length ? msg.photo[msg.photo.length - 1] : null
  const docImage = msg.document?.mime_type?.startsWith('image/') ? msg.document : null
  const fileId = photo?.file_id || docImage?.file_id || null
  console.log('сообщение от', chatId, fileId ? '[фото]' : '', JSON.stringify(text).slice(0, 80))

  if (text.startsWith('/start')) {
    await tg(env, 'sendMessage', {
      chat_id: chatId,
      text: 'Привет! Пришли фото упаковки и напиши, сколько съел (например «2 пакетика» или «2 котлеты из этой упаковки») — я посчитаю точное КБЖУ по этикетке. Можно и просто текстом или фото блюда.\n\nПриём пищи определю сам, а под ответом будут кнопки — можно перенести запись в другой приём одним нажатием.\n\nСовет: если этикетка мелкая — отправь фото как файл (Скрепка → Файл), так текст читается лучше.\n\n/undo — удалить последнюю запись за сегодня.\n/clear — удалить все записи за сегодня.',
    })
    return
  }

  if (text.startsWith('/clear')) {
    try {
      const res = await fetchRetry(`${env.SUPABASE_URL}/rest/v1/meals?date=eq.${todayLocal()}`, {
        method: 'DELETE',
        headers: {
          apikey: env.SUPABASE_KEY,
          Authorization: `Bearer ${env.SUPABASE_KEY}`,
          Prefer: 'return=representation',
        },
      })
      if (!res.ok) throw new Error(`Supabase: ${res.status} ${await res.text()}`)
      const rows = await res.json()
      await tg(env, 'sendMessage', {
        chat_id: chatId,
        text: rows.length ? `Очищено: удалено записей за сегодня — ${rows.length}.` : 'За сегодня записей нет.',
      })
    } catch (err) {
      console.error(err)
      await tg(env, 'sendMessage', { chat_id: chatId, text: `Ошибка очистки: ${err.message}` }).catch(() => {})
    }
    return
  }

  if (text.startsWith('/undo')) {
    try {
      const sel = await fetchRetry(
        `${env.SUPABASE_URL}/rest/v1/meals?date=eq.${todayLocal()}&order=created_at.desc&limit=1`,
        { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` } },
      )
      if (!sel.ok) throw new Error(`Supabase: ${sel.status} ${await sel.text()}`)
      const rows = await sel.json()
      if (!rows.length) {
        await tg(env, 'sendMessage', { chat_id: chatId, text: 'За сегодня записей нет.' })
        return
      }
      const del = await fetchRetry(`${env.SUPABASE_URL}/rest/v1/meals?id=eq.${rows[0].id}`, {
        method: 'DELETE',
        headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` },
      })
      if (!del.ok) throw new Error(`Supabase: ${del.status} ${await del.text()}`)
      await tg(env, 'sendMessage', { chat_id: chatId, text: `Удалено: ${rows[0].name} — ${rows[0].kcal} ккал.` })
    } catch (err) {
      console.error(err)
      await tg(env, 'sendMessage', { chat_id: chatId, text: `Ошибка удаления: ${err.message}` }).catch(() => {})
    }
    return
  }

  if (!text && !fileId) return

  if (!env.KIMI_API_KEY) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: 'Бот не настроен: не задан KIMI_API_KEY.' })
    return
  }

  try {
    let imageBase64 = null
    if (fileId) {
      try {
        imageBase64 = await downloadPhotoBase64(env, fileId)
      } catch (err) {
        throw new Error(`скачивание фото: ${err.message}`)
      }
    }

    let items
    try {
      items = await estimateNutrition(env, { text, imageBase64 })
      items = await enrichFromBarcode(items)
    } catch (err) {
      throw new Error(`оценка КБЖУ: ${err.message}`)
    }

    if (!items.length) {
      await tg(env, 'sendMessage', { chat_id: chatId, text: 'Не смог распознать еду. Попробуй описать точнее или прислать другое фото.' })
      return
    }

    // Приём пищи: из текста или по текущему часу (МСК)
    for (const it of items) {
      if (!it.meal) it.meal = mealByHour(hourMsk())
    }

    let inserted
    try {
      inserted = await saveMeals(env, items)
    } catch (err) {
      throw new Error(`запись в базу: ${err.message}`)
    }

    const date = todayLocal()
    const [dayType, totals] = await Promise.all([getDayType(env, date), getDayTotals(env, date)])
    const remaining = NORMS[dayType].kcal - totals.kcal

    const lines = items.map(
      (it) =>
        `Добавлено: ${it.name} | Ккал: ${it.kcal} | Б: ${it.protein} | Ж: ${it.fat} | У: ${it.carbs}` +
        `\n(${mealTitle(it.meal)}${it.note ? ` · ${it.note}` : ''})`,
    )
    lines.push(`Осталось на сегодня: ${remaining} ккал из ${NORMS[dayType].kcal} (${dayType === 'gym' ? 'день зала' : 'день отдыха'})`)
    const sent = await tg(env, 'sendMessage', {
      chat_id: chatId,
      text: lines.join('\n'),
      reply_markup: mealKeyboard(),
    })
    if (Array.isArray(inserted)) {
      await env.PENDING_MEALS.put(
        `meals:${chatId}:${sent.message_id}`,
        JSON.stringify(inserted.map((r) => r.id)),
        { expirationTtl: 7 * 24 * 3600 },
      )
    }
    console.log('записано:', items.length, 'наимен.')
  } catch (err) {
    console.error(err)
    await tg(env, 'sendMessage', { chat_id: chatId, text: `Ошибка: ${err.message}. Попробуй ещё раз.` }).catch(() => {})
  }
}

async function processUpdate(env, update) {
  try {
    // Дедупликация: Telegram шлёт повторы, если webhook отвечал медленно
    const dedupKey = `upd:${update.update_id}`
    if (await env.PENDING_MEALS.get(dedupKey)) return
    await env.PENDING_MEALS.put(dedupKey, '1', { expirationTtl: 24 * 3600 })

    if (update.message) await handleMessage(env, update.message)
    if (update.callback_query) await handleCallback(env, update.callback_query)
  } catch (err) {
    console.error('processUpdate error:', err.message)
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (url.pathname !== '/webhook') return new Response('kbzhu-bot: ok')
    if (request.method !== 'POST') return new Response('ok')
    if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
      return new Response('forbidden', { status: 403 })
    }
    let update
    try {
      update = await request.json()
    } catch {
      return new Response('ok')
    }
    ctx.waitUntil(processUpdate(env, update))
    return new Response('ok')
  },
}
