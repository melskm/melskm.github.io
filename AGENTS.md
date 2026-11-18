# Dark Dashboard + трекер КБЖУ

React + Vite + Tailwind CSS v4. Dev-сервер: `npm run dev` (порт 5173).

## Деплой

Прод: GitHub Pages, https://melskm.github.io — репозиторий `melskm/melskm.github.io`, Pages публикует ветку `gh-pages` (собранный `dist`), исходники в ветке `main`. В `vite.config.js` стоит `base: '/'`.
Обновление сайта: закоммитить изменения в `main`, затем `npm run build` и запушить содержимое `dist` в ветку `gh-pages` (в `dist/` отдельный git-репозиторий с remote origin). Если сборка Pages не стартует сама — POST на `https://api.github.com/repos/melskm/melskm.github.io/pages/builds`.
`bot/` в репозиторий не коммитить (в `.gitignore`) — там токены Telegram и Kimi в открытом виде.

## Supabase

Клиент: `src/lib/supabaseClient.js` (URL и publishable-ключ уже в файле).

Таблица `meals`: `id uuid`, `created_at timestamptz`, `name text`, `kcal`, `protein`, `fat`, `carbs` (numeric), `date date`, `meal text` (breakfast/lunch/snack/dinner).
Таблица `settings`: `key text` PK, `value text` — тип дня по ключу `daytype:YYYY-MM-DD` (rest/gym).
Анонимные select/insert/delete разрешены (RLS-политика открыта для publishable-ключа).

Нормы КБЖУ и правила — в `src/lib/nutrition.js` (NORMS, MEALS, пороги предупреждений); используются и сайтом, и ботом.
Интерфейс дневника — `src/components/cards/DiaryCard.jsx`.

## Telegram-бот

Прод: Cloudflare Worker `kbzhu-bot` (@ccalkimi_bot), webhook на `https://kbzhu-bot.melskm.workers.dev/webhook` — работает 24/7, бесплатный тариф. Код: `worker/src/worker.js`, конфиг `worker/wrangler.toml`. Деплой: `cd worker && npx wrangler deploy` (логин через `npx wrangler login`).
Секреты воркера (`npx wrangler secret put ИМЯ --name kbzhu-bot`): TELEGRAM_TOKEN, KIMI_API_KEY, WEBHOOK_SECRET (лежит в `worker/.webhook_secret`, не коммитить). KV-биндинг PENDING_MEALS: дедупликация update_id (24 ч) и маппинг сообщение→id записей для кнопок (7 дней).
Время воркера — Europe/Moscow (в UTC не переводить обратно). Webhook привязан с `ip_address` (104.21.88.106), т.к. резолвер Telegram не резолвил workers.dev; если воркер переедет — перевыпустить setWebhook.
Локальная polling-версия: `bot/bot.mjs` (НЕ коммитить — токены в коде). Пока установлен webhook, локальный запуск бесполезен: getUpdates вернёт 409.
Логи воркера: `cd worker && npx wrangler tail`.
Принимает текст или фото еды → считает КБЖУ через Kimi Code API (`https://api.kimi.ai/coding/v1`, модель `kimi-for-coding`, только `temperature: 1`) → пишет в `meals` → отвечает «Добавлено: …».
Если на фото упаковка — КБЖУ берётся с этикетки (за 100 г) и пересчитывается на количество из текста пользователя («2 пакетика», «2 котлеты»); вес штуки вычисляется из веса нетто/числа штук на упаковке. Если модель прочитала штрихкод и продукт есть в Open Food Facts (`world.openfoodfacts.org/api/v2/product/{ean}.json`) — КБЖУ пересчитывается точно по базе, приоритет над этикеткой.
Команда `/undo` — удаляет последнюю запись за сегодня; `/clear` — все записи за сегодня. Принимает фото и как картинку, и как файл-документ (документ не сжимается — этикетки читаются лучше). В ответе указывает основу расчёта (поле note из JSON модели, в базу не пишется).
Под каждым подтверждением — inline-кнопки Завтрак/Обед/Перекус/Ужин: переносят запись в другой приём (PATCH по id, маппинг messageId→ids в KV воркера, TTL 7 дней).
Из ответа модели вставлять только поля name/kcal/protein/fat/carbs/meal — лишние поля ломают insert. Ответ бота: «Добавлено: … | Ккал: X | Б: X | Ж: X | У: X» + строка «Осталось на сегодня: N ккал из нормы (день зала/отдыха)».

## Логирование еды через чат

Когда пользователь пишет, что он съел (в любой формулировке, напр. «съел два бутерброда с сыром» или «добавь еду: овсянка 350 ккал Б12 Ж6 У60»):

1. Если КБЖУ не указаны — оцени их сам по описанию (ккал, белки, жиры, углеводы).
2. Вставь запись в Supabase:
   ```
   curl -s -X POST "https://yjdjydxhsdibzyvxbhsj.supabase.co/rest/v1/meals" \
     -H "apikey: sb_publishable_9DXNbTciyBjV2CiORYIDdw_6KCzJTdu" \
     -H "Authorization: Bearer sb_publishable_9DXNbTciyBjV2CiORYIDdw_6KCzJTdu" \
     -H "Content-Type: application/json" \
     -d '{"name":"...","kcal":0,"protein":0,"fat":0,"carbs":0,"date":"YYYY-MM-DD"}'
   ```
   `date` — сегодняшняя дата (из system-reminder), формат ГГГГ-ММ-ДД.
3. Кратко подтверди пользователю, что записано (название + КБЖУ). На сайте запись появится в течение 30 секунд (автообновление).

Если пользователь присылает JSON-массив приёмов пищи (перенос истории) — вставь все записи одним POST с массивом в теле.
