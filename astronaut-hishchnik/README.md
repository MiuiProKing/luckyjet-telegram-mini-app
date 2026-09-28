# ASTRONAUT ХИЩНИК

Отдельная русская страница для статистики Astronaut с собственной таблицей коэффициентов в Supabase. Файлы из LuckyJet не меняются. Ветка GitHub `astronaut-hishchnik-20260928` создана отдельно.

## Проверенный источник

`GET https://crash-gateway-grm-cr.100hp.app/history` с заголовками `customer-id`, `session-id`, `accept: application/json`, `Origin: https://allpredictor.com` и `Referer: https://allpredictor.com/` вернул HTTP 200. Ответ — массив из 20 объектов. У объектов есть стабильный `id`, `topCoefficient`, `finalValues`, `outcome`, `hash`, `salt`; времени раунда в ответе нет. Рабочие значения customer/session хранятся только в защищённых секретах Supabase, не в клиентском HTML, Python worker или Git.

## Поток сбора

1. `collector.py` вызывает Supabase Edge Function раз в 2 секунды по умолчанию. Интервал можно увеличить, если источник ограничит частоту.
2. Функция запрашивает `/history`, принимает `id` и `topCoefficient` (с запасным чтением `finalValues[0]`), сохраняет каждый round ID один раз и сохраняет порядок массива.
3. Ответ источника ограничен 20 последними раундами. Частый сбор уменьшает вероятность пропуска, но не может гарантировать восстановление раунда, который исчез из этого окна до опроса.
4. Источник не предоставляет точные временные метки. Поэтому `observed_at` — время, когда сборщик впервые заметил раунд; интерфейс и CSV должны называть это временем получения/наблюдения. Оно не является фактическим временем завершения раунда.
5. Страница читает отдельную таблицу раз в секунду. История, даты и время суток основаны на времени наблюдения и потому приблизительны. Интервальные модели по реальному времени для Astronaut отключены. Любые временные окна прогноза — экспериментальные статистические оценки, а не подтверждённый тайминг игры или гарантия выигрыша.

## Развёртывание Supabase

1. В SQL Editor выполнить `supabase/migrations/20260928_astronaut.sql`.
2. Развернуть `supabase/functions/astronaut-live/index.ts` как функцию `astronaut-live` (JWT verification выключена в `supabase/config.toml`; чтение публичное, запись закрыта секретным заголовком).
3. В Edge Functions → Secrets добавить:

```text
ASTRO_CUSTOMER_ID=<значение customer-id из запроса Astronaut>
ASTRO_SESSION_ID=<актуальное значение session-id>
ASTRO_SOURCE_CONFIRMED=true
ASTRO_COLLECTOR_TOKEN=<длинный случайный секрет только для worker>
```

Не сохраняйте эти значения в публичном репозитории, HTML, клиентском JavaScript, CSV, логах или сообщениях. Supabase автоматически предоставляет `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY`.

## Worker

В настройках фонового Python worker задать:

```text
ASTRO_COLLECTOR_URL=https://xrniwkvfrtchtxjrwwgd.supabase.co/functions/v1/astronaut-live
ASTRO_COLLECTOR_TOKEN=<то же значение ASTRO_COLLECTOR_TOKEN>
ASTRO_POLL_SECONDS=2
```

Запустить `collector.py` как постоянно работающий процесс. Python-файл не содержит игровых credential или токенов.

## Проверка после установки

- GET функции должен вернуть JSON `ok: true`, `game: "astronaut"` и `history`.
- Worker должен логировать `Astronaut received=20` и `accepted` без ошибок.
- В таблице `astronaut_rounds` появляются уникальные ID и коэффициенты; `observed_at` заполнен временем первого получения.
- `astronaut_collector_status` показывает последний HTTP-статус и число записей.
- Если функция отсутствует, страница честно показывает ошибку HTTP (например 404); это означает, что функцию ещё не развернули.

Архив не безлимитный: фактический срок и объём хранения зависят от тарифа и квот проекта Supabase.
