# LuckyJet MultiEngine Bot

Файл: `telegram_multiengine_bot.py`

## Что работает

- `BABEL` — отдельный реконструированный движок.
- `ALLPREDICTOR` — реконструированная публичная схема: история → цель → confidence → timing → проверка до 3 следующих завершённых раундов.
- `ALLPREDICTOR KILLER` — отдельный переключатель, но без выдуманной логики. Сигналы не создаются, пока не найден подтверждённый код/алгоритм.
- По умолчанию включён только `ALLPREDICTOR`.
- `/bots` — кнопки управления.
- `/signal` — запрос сигнала у включённых движков.
- `/stats` — статистика WIN/LOSE каждого движка.

## Кнопки

- ВКЛ/ВЫКЛ BABEL
- ВКЛ/ВЫКЛ ALLPREDICTOR
- ВКЛ/ВЫКЛ ALLPREDICTOR KILLER
- Только BABEL
- Только ALLPREDICTOR
- Выключить все
- Получить сигнал
- Статистика

## Переменные окружения

```bash
export TELEGRAM_BOT_TOKEN='...'
export TELEGRAM_CHAT_ID='...'
export LJ_SESSION_ID='...'
export LJ_CUSTOMER_ID='...'
python3 research-luckyjet/telegram_multiengine_bot.py
```

Опционально:

```bash
export LJ_HISTORY_URL='https://crash-gateway-grm-cr.100hp.app/history'
export POLL_SECONDS='2.5'
export BOT_STATE_FILE='multiengine_state.json'
```

Токены, session-id и customer-id в репозиторий не записываются.
