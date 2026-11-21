"""GOD PREDITOR V3: canonical server forecasts, durable Telegram delivery.

The server and the website own the same immutable forecast IDs. This client never
creates a replacement window or substitutes a local forecast when the API fails.
Importing this module does not start a bot or send messages.
"""
import argparse
import json
import math
import os
import re
import time
from pathlib import Path
from html import escape

import requests
import runtime as legacy_runtime
from runtime import Journal, Telegram, DeliveryError, SourceError, chats, secure_url, photo_bytes, safe_log, numeric, stamp, ms, kyiv, formatted, CONTACTS

VERSION = 'god-complete-v3-20261121'
DEFAULT_CHANNELS = ('premium_live', 'vip_10', 'vip_40', 'vip_200', 'vip_500')
TERMINAL = ('hit', 'miss', 'unknown')
MAX_SQLITE_TIME = 9223372036854775807


def parse_channels(config):
    raw = config.get('PUBLISH_CHANNELS', ','.join(DEFAULT_CHANNELS))
    if isinstance(raw, (list, tuple)):
        parts = [str(x).strip() for x in raw]
    else:
        parts = re.split(r'[,;\s]+', str(raw).strip())
    if parts == ['all']:
        return None
    result = tuple(dict.fromkeys(p for p in parts if p))
    if not result or any(not re.fullmatch(r'[A-Za-z0-9_:.-]{1,100}', p) for p in result):
        raise ValueError('Неверный список PUBLISH_CHANNELS')
    return result


def first(d, *keys, default=None):
    for key in keys:
        if key in d and d[key] is not None:
            return d[key]
    return default


def canonical_signal(raw, now):
    """Read flat API records or SQL records without inventing identifiers/times."""
    if not isinstance(raw, dict):
        raise ValueError('Неверная запись сигнала')
    metadata = raw.get('metadata', {})
    if isinstance(metadata, str):
        metadata = json.loads(metadata)
    if not isinstance(metadata, dict):
        metadata = {}
    d = {**metadata, **{k: v for k, v in raw.items() if k != 'metadata'}}
    ident = str(first(d, 'id', 'signalId', 'signal_id', default=''))
    channel = str(d.get('channel', ''))
    target = numeric(first(d, 'target', 'targetX', 'target_x', 'estimatedCoef'))
    start = stamp(first(d, 'start', 'startAt', 'start_at', 'starts_at'))
    end = stamp(first(d, 'end', 'endAt', 'end_at', 'ends_at'))
    issued = stamp(first(d, 'issuedAt', 'issued_at', 'generatedAt', 'created_at'))
    status = str(d.get('status', 'pending')).lower()
    kind = str(first(d, 'windowKind', 'window_kind', default='time'))
    required = numeric(first(d, 'roundsRequired', 'plannedRounds', 'rounds'))
    if kind == 'rounds' or required is not None and end is None:
        kind = 'rounds'
    else:
        kind = 'time'
    if not ident or len(ident) > 250 or not re.fullmatch(r'[A-Za-z0-9_:.-]{1,100}', channel):
        raise ValueError('Нет канонического ID/канала')
    if target is None or target < 1 or start is None or issued is None or issued > now + 10000:
        raise ValueError('Неверные параметры канонического сигнала')
    if status not in ('pending', *TERMINAL):
        raise ValueError('Неверный статус канонического сигнала')
    if kind == 'time' and (end is None or end <= start):
        raise ValueError('Неверные границы окна')
    if kind == 'rounds' and (required is None or required < 1 or required != int(required) or required > 10000000):
        raise ValueError('Неверное количество раундов')
    d.update(id=ident, channel=channel, target=target, start=start, end=end if kind == 'time' else None,
             issuedAt=issued, status=status, windowKind=kind, canonical=True)
    if kind == 'rounds':
        observed = numeric(first(d, 'roundsObserved', 'roundCount', 'count', default=0))
        remaining = numeric(first(d, 'roundsRemaining', 'remainingRounds'))
        d['roundsRequired'] = int(required)
        d['roundsObserved'] = max(0, int(observed or 0))
        d['roundsRemaining'] = max(0, int(remaining if remaining is not None else required - d['roundsObserved']))
        d['estimatedEnd'] = stamp(d.get('estimatedEnd'))
    d['actual'] = numeric(first(d, 'actual', 'hit', 'best', 'actual_coefficient'))
    d['resultAt'] = stamp(first(d, 'resultAt', 'result_at', 'endedAt', 'resolved_at'))
    return d


def immutable_identity(s):
    return (s['id'], s['channel'], s['target'], s['start'], s.get('end'), s['issuedAt'],
            s.get('windowKind', 'time'), s.get('roundsRequired'), s.get('modelVersion'),
            numeric(s.get('confidence')), s.get('scoreKind'))


def forecast_eligible(s, now, fresh, channels, max_age_ms=120000):
    if not fresh or s['status'] != 'pending' or channels is not None and s['channel'] not in channels:
        return False
    if now - s['issuedAt'] > max_age_ms or s['issuedAt'] > now + 10000:
        return False
    if s.get('windowKind') == 'rounds':
        # A forecast for the last remaining round is already too late to announce.
        return s.get('roundsRemaining', 0) >= min(2, s['roundsRequired'])
    if s['end'] - now < 60000:
        return False
    if s.get('liveWindow') or s['channel'] == 'premium_live' or s['channel'].startswith('duration_'):
        return s['start'] <= now + 5000
    return s['start'] - now >= 40000


class CanonicalJournal(Journal):
    def __init__(self, path):
        super().__init__(path)
        with self.lock:
            self.db.executescript('''
            CREATE TABLE IF NOT EXISTS canonical_progress(signal_id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS canonical_events(seq INTEGER PRIMARY KEY,payload TEXT NOT NULL);
            ''')
            self.db.commit()

    def import_signal(self, s, chat_ids, now, announce=False):
        """Persist server metadata once, retaining outcome/progress separately."""
        payload = json.dumps(s, ensure_ascii=False, separators=(',', ':'))
        with self.lock:
            row = self.db.execute('SELECT metadata,status FROM signals WHERE id=?', (s['id'],)).fetchone()
            if row:
                old = json.loads(row['metadata'])
                if immutable_identity(old) != immutable_identity(s):
                    raise ValueError('Сервер изменил сохранённые параметры сигнала')
            else:
                # SQLite needs a non-null index value; this sentinel is never rendered
                # as a real deadline for a round-count forecast.
                end = s['end'] if s.get('end') is not None else MAX_SQLITE_TIME
                self.db.execute('INSERT INTO signals(id,channel,start,end,issued,metadata) VALUES(?,?,?,?,?,?)',
                                (s['id'], s['channel'], s['start'], end, s['issuedAt'], payload))
                self.db.execute('INSERT INTO events(signal_id,at,kind,payload) VALUES(?,?,?,?)',
                                (s['id'], now, 'canonical_created', payload))
            self.db.execute('INSERT OR REPLACE INTO canonical_progress VALUES(?,?,?)', (s['id'], payload, now))
            current = self.db.execute('SELECT status FROM signals WHERE id=?', (s['id'],)).fetchone()[0]
            if announce and current == 'pending':
                for chat in chat_ids:
                    for step in ('photo', 'text'):
                        self.db.execute("INSERT OR IGNORE INTO deliveries(signal_id,chat,phase,step) VALUES(?,?,'forecast',?)", (s['id'], chat, step))
            self.db.commit()
        return s

    def signal(self, ident):
        with self.lock:
            row = self.db.execute('SELECT metadata FROM signals WHERE id=?', (ident,)).fetchone()
            return json.loads(row[0]) if row else None

    def progress(self, ident, fallback):
        with self.lock:
            row = self.db.execute('SELECT payload FROM canonical_progress WHERE signal_id=?', (ident,)).fetchone()
            return json.loads(row[0]) if row else fallback

    def canonical_event(self, event):
        seq = event.get('seq')
        if isinstance(seq, int) and not isinstance(seq, bool) and seq >= 0:
            with self.lock:
                self.db.execute('INSERT OR IGNORE INTO canonical_events VALUES(?,?)', (seq, json.dumps(event, ensure_ascii=False)))
                self.db.commit()

    def outcome(self, s, now, chat_ids):
        with self.lock:
            old = self.db.execute('SELECT status FROM signals WHERE id=?', (s['id'],)).fetchone()
            if not old or s['status'] not in TERMINAL:
                return
            # Do not rewind a resolved canonical record because an old event page
            # was replayed after a newer snapshot.
            if old[0] in ('hit', 'miss'):
                return
        result = {'status': s['status'], 'actual': s.get('actual'), 'resultAt': s.get('resultAt'),
                  'verifiedAt': first(s, 'verifiedAt', 'checkedAt'), 'canonical': True}
        self.record_outcome(s, result, now, chat_ids)

    def queued(self, now):
        with self.lock:
            query = '''SELECT d.*,s.metadata,s.status,s.actual,s.result_at
            FROM deliveries d JOIN signals s ON s.id=d.signal_id
            WHERE d.state='ready' AND d.available<=?
            ORDER BY CASE WHEN d.phase!='forecast' THEN 0 ELSE 1 END,
            CASE WHEN s.channel='premium_live' THEN 0 ELSE 1 END,
            s.end,s.issued,d.chat,CASE WHEN d.step='photo' THEN 0 ELSE 1 END LIMIT 100'''
            return [dict(r) for r in self.db.execute(query, (now,))]


class CanonicalSource:
    def __init__(self, config, session=None):
        self.config = config
        base = secure_url(config['SUPABASE_URL'])
        self.url = secure_url(config.get('CANONICAL_EDGE_URL') or base + '/functions/v1/god-complete-v3')
        token = config.get('EDGE_TOKEN') or (config['SUPABASE_KEY'] if str(config['SUPABASE_KEY']).startswith('eyJ') else '')
        if not token:
            raise ValueError('Для шлюза Supabase нужен EDGE_TOKEN (публичный anon JWT)')
        self.headers = {'apikey': config['SUPABASE_KEY'], 'Authorization': 'Bearer ' + token,
                        'Accept': 'application/json', 'Content-Type': 'application/json'}
        self.session = session or requests.Session()
        self.offset = 0
        self.last_poll = 0
        self.latency = None
        self.snapshot = None

    def now(self):
        return ms() + self.offset

    def poll(self, after_event_id=0):
        before = ms()
        try:
            r = self.session.post(self.url, json={'action': 'snapshot', 'zone': 'Europe/Kyiv',
                                                 'afterEventId': int(after_event_id)},
                                  headers=self.headers, timeout=(5, 40), allow_redirects=False)
            if r.status_code != 200:
                raise SourceError('Канонический сервер: HTTP ' + str(r.status_code))
            body = r.json()
        except (requests.RequestException, ValueError):
            raise SourceError('Не удалось получить канонический снимок Supabase') from None
        if not isinstance(body, dict) or not isinstance(body.get('signals'), list):
            raise SourceError('Канонический сервер вернул неверный формат')
        server = stamp(body.get('serverNow'))
        if server is None:
            raise SourceError('Сервер не передал время снимка')
        self.offset = server - (before + ms()) / 2
        self.last_poll = self.now()
        self.latency = round(ms() - before)
        self.snapshot = body
        return body

    def close(self):
        self.session.close()


def probability_line(s):
    score = numeric(s.get('confidence'))
    kind = str(s.get('scoreKind', 'heuristic'))
    if score is None and numeric(s.get('probability')) is not None:
        score = float(s['probability']) * 100
    if score is None or not 0 <= score <= 100:
        return '📊 ОЦЕНКА: —'
    if 'probability' in kind or kind in ('model_estimate', 'probability'):
        shown = '99.99+' if 99.99 < score < 100 else f'{score:.2f}' if 99.9 < score < 100 else f'{score:.1f}'
        return f'📊 МОДЕЛЬНАЯ ОЦЕНКА: <b>{escape(shown)}%</b>'
    return f'📊 БАЛЛ АНАЛИЗА: <b>{score:.0f}/100</b>'


def render_forecast(s):
    title = 'ГЛАВНЫЙ ПРОГНОЗ' if s['channel'] == 'premium_live' else 'ОТДЕЛЬНОЕ ОКНО'
    if s.get('windowKind') == 'rounds':
        n = int(s['roundsRequired'])
        timing = f'⏰ НАЧАЛО: <b>{kyiv(s["start"])}</b>\n🔢 ГОРИЗОНТ: <b>{n} следующих раундов</b>\n'
        timing += f'⏳ ОСТАЛОСЬ ПРИ ПРОВЕРКЕ: <b>{int(s.get("roundsRemaining", n))} раундов</b>\n'
        if s.get('estimatedEnd'):
            timing += f'🕒 ОРИЕНТИРОВОЧНО ДО: <b>{kyiv(s["estimatedEnd"])}</b>\n'
        timing += 'Время ориентировочное; проверка идёт по числу раундов.\n'
    else:
        timing = f'⏰ НАЧАЛО: <b>{kyiv(s["start"])}</b>\n⌛ ЗАКРЫТИЕ: <b>{kyiv(s["end"])}</b>\n'
    return ('💀👾⚡🔥 <b>GOD PREDITOR</b>\n🟢 <b>HACKER ULTRA VIP</b>\n━━━━━━━━━━━━━━━━━━━━\n'
            + f'🎯 <b>{title}</b>\n🎮 ИГРА: <b>LUCKY JET</b>\n'
            + f'🎯 ЦЕЛЬ: <b>{escape(formatted(s["target"]))}×</b>\n{probability_line(s)}\n'
            + timing + '🌐 ВРЕМЯ: КИЕВ\n🟡 <b>ОЖИДАНИЕ ПРОВЕРКИ</b>\n\n'
            + 'Оценка по истории; результат отдельного будущего окна не гарантирован.\n'
            + f'🆔 <code>{escape(s["id"])}</code>\n👨‍💻 @V0xFF3')


def render_result(s, status, actual, result_at, revision=False):
    title = {'hit': '🟢 <b>ЦЕЛЬ ДОСТИГНУТА</b>', 'miss': '🔴 <b>ЦЕЛЬ НЕ ДОСТИГНУТА</b>',
             'unknown': '⚪ <b>РЕЗУЛЬТАТ НЕ ОПРЕДЕЛЁН</b>'}[status]
    if s.get('windowKind') == 'rounds':
        timing = f'⏰ НАЧАЛО: <b>{kyiv(s["start"])}</b>\n🔢 ГОРИЗОНТ: <b>{s["roundsRequired"]} раундов</b>\n'
        if result_at:
            timing += f'🕒 СОБЫТИЕ: <b>{kyiv(result_at)}</b>\n'
    else:
        timing = f'⏰ ОКНО: <b>{kyiv(s["start"])} → {kyiv(s["end"])}</b>\n'
    value = formatted(actual) + '×' if numeric(actual) is not None else 'нет подтверждённых данных'
    return ('🎯 <b>ПРОГНОЗ GOD PREDITOR</b>\n'
            + ('🔄 <b>УТОЧНЕНИЕ ПО ПОЛНОЙ ИСТОРИИ</b>\n' if revision else '')
            + title + f'\n🎯 ЦЕЛЬ: <b>{formatted(s["target"])}×</b>\n' + timing
            + f'📈 КОЭФФИЦИЕНТ ПРИ ПРОВЕРКЕ: <b>{value}</b>\n'
            + ('Проверка неполная: недостаточно подтверждённой истории.\n' if status == 'unknown' else '')
            + f'🆔 <code>{escape(s["id"])}</code>\n👨‍💻 @V0xFF3')


class CanonicalBot:
    def __init__(self, config, source=None, telegram=None, photo=None, clock=None):
        self.config = config
        self.chats = chats(config)
        self.channels = parse_channels(config)
        path = Path(config.get('DATABASE_PATH') or 'god_complete_v3.sqlite3')
        path.parent.mkdir(parents=True, exist_ok=True)
        self.journal = CanonicalJournal(str(path))
        self.source = source or CanonicalSource(config)
        self.telegram = telegram or Telegram(config['TELEGRAM_BOT_TOKEN'])
        self.photo = photo if photo is not None else photo_bytes(config)
        self.clock = clock or self.source.now
        self.paused_until = self.journal.get('telegram_paused_until', 0)
        self.snapshot = None
        self.last_success = 0

    def sync(self, body, now):
        """Ingest the canonical snapshot/events. No local model generates a signal."""
        fresh = body.get('sourceFresh') is True
        max_age = max(1000, int(self.config.get('FORECAST_MAX_AGE_SECONDS', 120)) * 1000)
        # Apply older event pages first, then the current snapshot. In particular,
        # an old 'created' event must not restore a stale remaining-round count.
        for event in body.get('events', []):
            if not isinstance(event, dict):
                continue
            payload = event.get('payload') or {}
            if not isinstance(payload, dict):
                continue
            raw = payload.get('signal')
            s = None
            if isinstance(raw, dict):
                s = canonical_signal(raw, now)
                self.journal.import_signal(s, self.chats, now, False)
            ident = str(first(event, 'signalId', 'signal_id', default=''))
            outcome = payload.get('outcome')
            if isinstance(outcome, dict):
                base = s or self.journal.signal(ident)
                if base:
                    s = canonical_signal({**base, **outcome, 'id': base['id']}, now)
            if s:
                self.journal.outcome(s, now, self.chats)
            self.journal.canonical_event(event)
        for raw in body.get('signals', []):
            s = canonical_signal(raw, now)
            self.journal.import_signal(s, self.chats, now, forecast_eligible(s, now, fresh, self.channels, max_age))
            self.journal.outcome(s, now, self.chats)
        cursor = body.get('eventCursor')
        old_cursor = self.journal.get('canonical_event_cursor', 0)
        if isinstance(cursor, int) and not isinstance(cursor, bool) and cursor >= old_cursor:
            self.journal.set('canonical_event_cursor', cursor)
        self.journal.set('last_canonical_snapshot', {'at': now, 'version': body.get('version'),
                         'sourceFresh': fresh, 'sourceCutoff': body.get('sourceCutoff'),
                         'sampleSize': len(body.get('rounds', [])), 'eventCursor': cursor,
                         'analyticsTotal': (body.get('analytics') or {}).get('total')})
        analysis_basis = [body.get('sourceCutoff'), body.get('version')]
        if self.journal.get('last_analysis_basis') != analysis_basis:
            self.journal.set('last_analysis', {'at': now, 'sourceCutoff': body.get('sourceCutoff'),
                             'analytics': body.get('analytics'), 'diagnostics': body.get('diagnostics'),
                             'canonical': True})
            self.journal.set('last_analysis_basis', analysis_basis)
        self.snapshot = body
        self.last_success = now

    def _chat_available(self, chat, now):
        key = 'chat_send_times:' + chat
        times = [v for v in self.journal.get(key, []) if isinstance(v, (int, float)) and v > now - 60000]
        if len(times) >= 19:
            return max(now + 100, times[0] + 60050)
        return max(now, (times[-1] + 1200) if times else now)

    def _sent(self, chat, now):
        key = 'chat_send_times:' + chat
        times = [v for v in self.journal.get(key, []) if isinstance(v, (int, float)) and v > now - 60000]
        self.journal.set(key, times + [now])

    def flush(self, now):
        if now < self.paused_until:
            return
        count = 0
        for item in self.journal.queued(now):
            stored = json.loads(item['metadata'])
            s = self.journal.progress(item['signal_id'], stored)
            forecast = item['phase'] == 'forecast'
            if forecast:
                if item['status'] != 'pending':
                    self.journal.delivery(item, 'expired', error='window_already_resolved')
                    continue
                # An API outage never authorizes a divergent or stale forecast.
                if not self.snapshot or not self.snapshot.get('sourceFresh') or now - self.last_success > 15000:
                    continue
                if s.get('windowKind') == 'rounds':
                    expired = s.get('roundsRemaining', 0) < min(2, s['roundsRequired'])
                else:
                    live = s.get('liveWindow') or s['channel'] == 'premium_live' or s['channel'].startswith('duration_')
                    deadline = s['end'] - 30000 if live else s['start'] - 5000
                    expired = now >= deadline
                if expired:
                    self.journal.delivery(item, 'expired', error='forecast_deadline_passed')
                    continue
                if item['step'] == 'text' and not self.journal.step_sent(item, 'photo'):
                    continue
            available = self._chat_available(item['chat'], now)
            if available > now:
                # Do not increment attempts when merely waiting for a rate budget.
                with self.journal.lock:
                    self.journal.db.execute("UPDATE deliveries SET available=? WHERE signal_id=? AND chat=? AND phase=? AND step=?",
                                            (available, item['signal_id'], item['chat'], item['phase'], item['step']))
                    self.journal.db.commit()
                continue
            self.journal.delivery(item, 'sending')
            try:
                if item['step'] == 'photo':
                    cached = self.journal.get('telegram_photo_file_id')
                    payload = {'chat_id': item['chat'], 'caption': '💀 GOD PREDITOR | HACKER ULTRA VIP\n🎯 ' + formatted(s['target']) + '×'}
                    if cached:
                        payload['photo'] = cached
                    result = self.telegram.call('sendPhoto', payload, photo=None if cached else self.photo)
                    photos = result.get('photo', [])
                    if photos and isinstance(photos[-1], dict) and photos[-1].get('file_id'):
                        self.journal.set('telegram_photo_file_id', photos[-1]['file_id'])
                else:
                    text = render_forecast(s) if forecast else render_result(s, item['status'], item['actual'], item['result_at'], item['phase'] == 'revision')
                    result = self.telegram.call('sendMessage', {'chat_id': item['chat'], 'text': text, 'parse_mode': 'HTML',
                                                               'reply_markup': CONTACTS, 'disable_web_page_preview': True})
                self.journal.delivery(item, 'sent', message_id=result['message_id'])
                self._sent(item['chat'], now)
            except DeliveryError as error:
                if error.code == 429:
                    self.paused_until = now + max(1, error.retry_after) * 1000
                    self.journal.set('telegram_paused_until', self.paused_until)
                    self.journal.delivery(item, 'ready', available=self.paused_until, error='rate_limit')
                    break
                self.journal.delivery(item, 'ambiguous' if error.ambiguous else 'failed', error=str(error.code))
            count += 1
            if count >= 8:
                break
            now = self.clock()

    def tick(self):
        try:
            body = self.source.poll(self.journal.get('canonical_event_cursor', 0))
            self.sync(body, self.clock())
        except Exception as error:
            safe_log('Канонический источник: ' + type(error).__name__ + ': ' + str(error), self.config)
        self.flush(self.clock())

    def check(self):
        body = self.source.poll(self.journal.get('canonical_event_cursor', 0))
        now = stamp(body.get('serverNow')) or self.clock()
        me = self.telegram.call('getMe')
        group_reports = []
        for i, chat in enumerate(self.chats, 1):
            member = self.telegram.call('getChatMember', {'chat_id': chat, 'user_id': me['id']})
            role = member.get('status')
            allowed = role in ('creator', 'administrator', 'member') or role == 'restricted' and member.get('can_send_messages')
            group_reports.append({'группа': i, 'роль': role, 'доступ': bool(allowed)})
        cutoff = stamp(body.get('sourceCutoff'))
        return {'канонический_сервер': True, 'supabase': bool(body.get('rounds')),
                'история_всего': (body.get('analytics') or {}).get('total'),
                'свежие_раунды': body.get('sourceFresh') is True,
                'задержка_сек': round((now - cutoff) / 1000, 1) if cutoff else None,
                'активных_каналов': len({s.get('channel') for s in body.get('signals', []) if s.get('status') == 'pending'}),
                'публикуемые_каналы': 'all' if self.channels is None else list(self.channels),
                'фото_байт': len(self.photo), 'telegram_токен': True, 'группы': group_reports,
                'сообщения_отправлены': False}

    def close(self):
        self.source.close()
        if getattr(self.telegram, 'session', None):
            self.telegram.session.close()
        self.journal.close()


def main():
    parser = argparse.ArgumentParser(description='GOD PREDITOR V3 • общие серверные сигналы и автоотправка')
    parser.add_argument('--check', action='store_true', help='Проверить подключения без отправки сообщений')
    parser.add_argument('--once', action='store_true', help='Один рабочий цикл с реальной отправкой')
    parser.add_argument('--offline-analysis', metavar='JSON', help='Только локальный отчёт по файлу истории; без Telegram')
    args = parser.parse_args()
    if args.offline_analysis:
        rows = json.loads(Path(args.offline_analysis).read_text())
        print(json.dumps(legacy_runtime.analyze_report(rows, ms()), ensure_ascii=False, indent=2))
        return 0
    config = dict(globals().get('CONFIG', {}))
    if not config:
        config = json.loads(Path(os.getenv('GOD_CONFIG', 'private-config.json')).read_text())
    config.setdefault('PUBLISH_CHANNELS', ','.join(DEFAULT_CHANNELS))
    config.setdefault('FORECAST_MAX_AGE_SECONDS', 120)
    config.setdefault('POLL_SECONDS', 5)
    config.setdefault('CANONICAL_EDGE_URL', str(config['SUPABASE_URL']).rstrip('/') + '/functions/v1/god-complete-v3')
    for key in list(config):
        if key in os.environ:
            config[key] = os.environ[key]
    config['DATABASE_PATH'] = os.getenv('DATABASE_PATH') or str(Path(__file__).with_name('god_complete_v3.sqlite3'))
    config['PHOTO_CACHE_PATH'] = os.getenv('PHOTO_CACHE_PATH') or str(Path(__file__).with_name('god-drive-photo.png'))
    lock = open(config['DATABASE_PATH'] + '.lock', 'a+')
    try:
        import fcntl
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Этот экземпляр бота уже запущен') from None
        bot = CanonicalBot(config)
        try:
            if args.check:
                print(json.dumps(bot.check(), ensure_ascii=False, indent=2))
                return 0
            safe_log('GOD PREDITOR V3 запущен: общие сигналы сайта и бота, групп: ' + str(len(bot.chats)), config)
            while True:
                started = time.monotonic()
                bot.tick()
                if args.once:
                    break
                time.sleep(max(.5, float(config.get('POLL_SECONDS', 5)) - (time.monotonic() - started)))
        finally:
            bot.close()
    except KeyboardInterrupt:
        return 0
    except Exception as error:
        safe_log('Запуск V3: ' + type(error).__name__ + ': ' + str(error), config)
        return 2
    finally:
        lock.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
