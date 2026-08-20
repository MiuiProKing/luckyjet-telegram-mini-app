#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LuckyJet multi-engine Telegram bot.

Engines:
- BABEL: reconstructed heuristic from recovered/public BABEL-style logic.
- ALLPREDICTOR: reconstructed public architecture: history -> target -> confidence
  -> timing -> validation on up to 3 following completed rounds.
- KILLER: intentionally inactive until confirmed public logic/source is recovered.

Secrets are read only from environment variables and are never hardcoded.
"""
from __future__ import annotations

import json
import math
import os
import statistics
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()
SESSION_ID = os.getenv("LJ_SESSION_ID", "").strip()
CUSTOMER_ID = os.getenv("LJ_CUSTOMER_ID", "").strip()
HISTORY_URL = os.getenv("LJ_HISTORY_URL", "https://crash-gateway-grm-cr.100hp.app/history").strip()
POLL_SECONDS = max(1.5, float(os.getenv("POLL_SECONDS", "2.5")))
STATE_PATH = Path(os.getenv("BOT_STATE_FILE", "multiengine_state.json"))

ENGINE_LABELS = {
    "babel": "BABEL",
    "allpredictor": "ALLPREDICTOR",
    "killer": "ALLPREDICTOR KILLER",
}

DEFAULT_STATE = {
    "engines": {"babel": False, "allpredictor": True, "killer": False},
    "last_round_id": None,
    "pending": [],
    "stats": {
        "babel": {"win": 0, "lose": 0},
        "allpredictor": {"win": 0, "lose": 0},
        "killer": {"win": 0, "lose": 0},
    },
    "telegram_offset": 0,
    "last_signal_round": {"babel": None, "allpredictor": None, "killer": None},
}


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def mean(values: List[float]) -> float:
    return statistics.fmean(values) if values else 0.0


def stdev(values: List[float]) -> float:
    return statistics.pstdev(values) if len(values) >= 2 else 0.0


def load_state() -> dict:
    if not STATE_PATH.exists():
        return json.loads(json.dumps(DEFAULT_STATE))
    try:
        data = json.loads(STATE_PATH.read_text("utf-8"))
    except Exception:
        return json.loads(json.dumps(DEFAULT_STATE))
    out = json.loads(json.dumps(DEFAULT_STATE))
    for key in out:
        if key in data:
            out[key] = data[key]
    for eng in ENGINE_LABELS:
        out["engines"].setdefault(eng, DEFAULT_STATE["engines"][eng])
        out["stats"].setdefault(eng, {"win": 0, "lose": 0})
        out["last_signal_round"].setdefault(eng, None)
    return out


def save_state(state: dict) -> None:
    tmp = STATE_PATH.with_suffix(STATE_PATH.suffix + ".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), "utf-8")
    tmp.replace(STATE_PATH)


@dataclass
class Round:
    id: str
    coefficient: float


@dataclass
class Forecast:
    engine: str
    target: float
    confidence: int
    wait_rounds: int
    validation_rounds: int
    created_after_round_id: str
    reason: str


def normalize_round(row: dict) -> Optional[Round]:
    if not isinstance(row, dict):
        return None
    value = row.get("topCoefficient")
    try:
        coef = float(value)
    except (TypeError, ValueError):
        coef = 0.0
    if coef <= 0:
        vals = row.get("finalValues")
        if isinstance(vals, list):
            for item in reversed(vals):
                try:
                    n = float(item)
                except (TypeError, ValueError):
                    continue
                if n > 0:
                    coef = n
                    break
    if coef <= 0:
        for key in ("coefficient", "coef", "crash", "value", "multiplier"):
            try:
                n = float(row.get(key, 0))
            except (TypeError, ValueError):
                continue
            if n > 0:
                coef = n
                break
    if coef <= 0 or not math.isfinite(coef):
        return None
    if coef == 1:
        coef = 1.01
    rid = str(row.get("id") or row.get("roundId") or row.get("round_id") or row.get("hash") or "")
    if not rid:
        rid = f"{coef:.2f}:{row.get('createdAt') or row.get('time') or ''}"
    return Round(rid, round(coef, 2))


def fetch_history(limit: int = 500) -> List[Round]:
    if not SESSION_ID or not CUSTOMER_ID:
        raise RuntimeError("Нужно задать LJ_SESSION_ID и LJ_CUSTOMER_ID")
    req = urllib.request.Request(
        HISTORY_URL,
        headers={
            "customer-id": CUSTOMER_ID,
            "session-id": SESSION_ID,
            "accept": "application/json",
            "user-agent": "LuckyJet-MultiEngine/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, list):
        raise RuntimeError("LIVE history вернул неверный формат")
    out: List[Round] = []
    seen = set()
    for raw in payload:
        r = normalize_round(raw)
        if r and r.id not in seen:
            seen.add(r.id)
            out.append(r)
            if len(out) >= limit:
                break
    if not out:
        raise RuntimeError("LIVE history пуст")
    return out


def zone(x: float) -> str:
    if x < 1.50:
        return "B"
    if x < 3.00:
        return "M"
    return "H"


def pattern_probabilities(values_chrono: List[float]) -> Dict[str, float]:
    zones = [zone(x) for x in values_chrono]
    if len(zones) < 10:
        return {"B": 1 / 3, "M": 1 / 3, "H": 1 / 3}
    key = tuple(zones[-4:])
    counts = {"B": 0, "M": 0, "H": 0}
    matches = 0
    for i in range(0, len(zones) - 4):
        if tuple(zones[i:i + 4]) == key:
            counts[zones[i + 4]] += 1
            matches += 1
    if matches < 2:
        return {"B": 1 / 3, "M": 1 / 3, "H": 1 / 3}
    return {k: counts[k] / matches for k in counts}


def ten_x_intervals(values_chrono: List[float]) -> Tuple[List[int], int]:
    idx = [i for i, x in enumerate(values_chrono) if x >= 10.0]
    intervals = [idx[i] - idx[i - 1] for i in range(1, len(idx))]
    gap = len(values_chrono) - 1 - idx[-1] if idx else len(values_chrono)
    return intervals, gap


def allpredictor_forecast(rows: List[Round]) -> Optional[Forecast]:
    # Reconstructed architecture, NOT claimed to be the proprietary formula.
    chrono = [r.coefficient for r in reversed(rows[:120])]
    if len(chrono) < 12:
        return None
    recent = chrono[-50:]
    clipped = [min(x, 25.0) for x in recent]
    avg = mean(clipped) or 1.0
    volatility = stdev(clipped) / max(avg, 1.0)
    pat = pattern_probabilities(chrono)
    intervals, gap10 = ten_x_intervals(chrono)
    typical_gap = mean(intervals[-12:]) if intervals else 18.0

    low_ratio = sum(x < 1.5 for x in recent[-16:]) / min(16, len(recent))
    mid_ratio = sum(1.5 <= x < 3 for x in recent[-16:]) / min(16, len(recent))
    high_ratio = sum(x >= 3 for x in recent[-16:]) / min(16, len(recent))

    pressure10 = clamp(gap10 / max(typical_gap, 5.0), 0.0, 1.8) / 1.8
    calm = 1.0 - clamp(volatility / 1.25, 0.0, 1.0)
    high_score = 0.44 * pat["H"] + 0.28 * pressure10 + 0.16 * high_ratio + 0.12 * (1 - calm)
    mid_score = 0.46 * pat["M"] + 0.24 * mid_ratio + 0.18 * calm + 0.12 * (1 - abs(pressure10 - 0.55))
    low_score = 0.48 * pat["B"] + 0.30 * low_ratio + 0.22 * calm

    scores = {"B": low_score, "M": mid_score, "H": high_score}
    best = max(scores, key=scores.get)
    ordered = sorted(scores.values(), reverse=True)
    margin = ordered[0] - ordered[1]
    confidence = int(round(clamp(42 + scores[best] * 42 + margin * 70, 35, 88)))
    if confidence < 52:
        return None

    if best == "H":
        target = 5.0 if pressure10 > 0.72 and confidence >= 74 else 3.0
    elif best == "M":
        target = 2.0
    else:
        target = 1.5

    wait = 0 if confidence >= 72 else (1 if confidence >= 60 else 2)
    reason = f"pattern={pat[best]:.2f}; vol={volatility:.2f}; gap10={gap10}/{typical_gap:.1f}; zone={best}"
    return Forecast("allpredictor", target, confidence, wait, 3, rows[0].id, reason)


def babel_forecast(rows: List[Round]) -> Optional[Forecast]:
    values = [r.coefficient for r in rows[:40]]
    if len(values) < 10:
        return None
    recent = values[:12]
    low = sum(x < 1.5 for x in recent)
    medium = sum(1.5 <= x < 3 for x in recent)
    gap10 = next((i for i, x in enumerate(values) if x >= 10), len(values))
    clipped = [min(x, 20.0) for x in recent]
    vol = stdev(clipped) / max(mean(clipped), 1.0)
    score = 48 + low * 2.0 + min(gap10, 18) * 0.8 - max(0.0, vol - 0.9) * 10
    confidence = int(round(clamp(score, 40, 82)))
    if confidence < 57:
        return None
    if gap10 >= 12 and low >= 5:
        target = 3.0
    elif low >= 5 or medium >= 5:
        target = 2.0
    else:
        target = 1.5
    wait = 1 if confidence < 68 else 0
    return Forecast("babel", target, confidence, wait, 3, rows[0].id,
                    f"low12={low}; mid12={medium}; gap10={gap10}; vol={vol:.2f}")


def killer_forecast(rows: List[Round]) -> Optional[Forecast]:
    return None


ANALYZERS = {
    "babel": babel_forecast,
    "allpredictor": allpredictor_forecast,
    "killer": killer_forecast,
}


def telegram_api(method: str, payload: Optional[dict] = None) -> dict:
    if not BOT_TOKEN:
        raise RuntimeError("Нужно задать TELEGRAM_BOT_TOKEN")
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/{method}"
    body = urllib.parse.urlencode(payload or {}).encode("utf-8")
    req = urllib.request.Request(url, data=body,
                                 headers={"content-type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=15) as response:
        data = json.loads(response.read().decode("utf-8"))
    if not data.get("ok"):
        raise RuntimeError(f"Telegram API: {data}")
    return data


def keyboard(state: dict) -> dict:
    def title(key: str) -> str:
        flag = state["engines"].get(key, False)
        return f"{'✅' if flag else '⛔'} {ENGINE_LABELS[key]}"
    return {
        "inline_keyboard": [
            [
                {"text": title("babel"), "callback_data": "toggle:babel"},
                {"text": title("allpredictor"), "callback_data": "toggle:allpredictor"},
            ],
            [{"text": title("killer"), "callback_data": "toggle:killer"}],
            [
                {"text": "🎯 Только BABEL", "callback_data": "only:babel"},
                {"text": "🎯 Только ALLPREDICTOR", "callback_data": "only:allpredictor"},
            ],
            [{"text": "⛔ Выключить все", "callback_data": "only:none"}],
            [
                {"text": "🚀 Получить сигнал", "callback_data": "action:signal"},
                {"text": "📊 Статистика", "callback_data": "action:stats"},
            ],
        ]
    }


def bots_text(state: dict) -> str:
    lines = ["🤖 <b>ДВИЖКИ LUCKY JET</b>", ""]
    for key, label in ENGINE_LABELS.items():
        enabled = state["engines"].get(key, False)
        extra = " · логика пока не подтверждена" if key == "killer" else ""
        lines.append(f"{'✅' if enabled else '⛔'} <b>{label}</b>{extra}")
    lines += ["", "Кнопками можно включать/выключать каждый движок или оставить только один."]
    return "\n".join(lines)


def send_message(text: str, chat_id: Optional[str] = None,
                 with_keyboard: bool = False, state: Optional[dict] = None) -> None:
    cid = str(chat_id or CHAT_ID)
    if not cid:
        return
    payload = {
        "chat_id": cid,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": "true",
    }
    if with_keyboard and state is not None:
        payload["reply_markup"] = json.dumps(keyboard(state), ensure_ascii=False)
    telegram_api("sendMessage", payload)


def answer_callback(callback_id: str, text: str = "Готово") -> None:
    try:
        telegram_api("answerCallbackQuery", {"callback_query_id": callback_id, "text": text})
    except Exception:
        pass


def stats_text(state: dict) -> str:
    lines = ["📊 <b>СТАТИСТИКА ДВИЖКОВ</b>", ""]
    for key, label in ENGINE_LABELS.items():
        st = state["stats"][key]
        total = st["win"] + st["lose"]
        rate = (st["win"] / total * 100.0) if total else 0.0
        lines.append(f"<b>{label}</b>: ✅ {st['win']} · ❌ {st['lose']} · {rate:.1f}%")
    lines.append(f"\nАктивных проверок: {len(state.get('pending', []))}")
    return "\n".join(lines)


def signal_text(f: Forecast) -> str:
    timing = "в следующий раунд" if f.wait_rounds == 0 else f"через {f.wait_rounds} раунд(а)"
    note = "восстановленная схема, не оригинальная формула" if f.engine == "allpredictor" else "реконструированная логика"
    return (
        f"🚀 <b>{ENGINE_LABELS[f.engine]}</b>\n"
        f"🎯 Цель: <b>{f.target:.2f}X</b>\n"
        f"🧠 Уверенность: <b>{f.confidence}%</b>\n"
        f"⏱ Вход: <b>{timing}</b>\n"
        f"🔎 Проверка: <b>до {f.validation_rounds} следующих раундов</b>\n"
        f"ℹ️ {note}"
    )


def result_text(item: dict, win: bool, actual: float, used: int) -> str:
    return (
        f"{'✅' if win else '❌'} <b>{ENGINE_LABELS[item['engine']]}</b> · "
        f"цель {float(item['target']):.2f}X · "
        f"{'достигнута' if win else 'не достигнута'} за {used}/3 раунд(а) · "
        f"последний {actual:.2f}X"
    )


def create_forecasts(rows: List[Round], state: dict,
                     force: bool = False, chat_id: Optional[str] = None) -> int:
    count = 0
    current_id = rows[0].id
    for engine, enabled in state["engines"].items():
        if not enabled:
            continue
        if engine == "killer":
            if force:
                send_message("🧪 <b>ALLPREDICTOR KILLER</b>\nЛогика пока не подтверждена, поэтому фальшивый сигнал не генерирую.", chat_id)
            continue
        if not force and state["last_signal_round"].get(engine) == current_id:
            continue
        forecast = ANALYZERS[engine](rows)
        if forecast is None:
            if force:
                send_message(f"⏸ <b>{ENGINE_LABELS[engine]}</b>: сейчас нет сигнала достаточной уверенности.", chat_id)
            continue
        item = asdict(forecast)
        item.update({"wait_left": forecast.wait_rounds, "checked": 0, "best": 0.0})
        state["pending"].append(item)
        state["last_signal_round"][engine] = current_id
        send_message(signal_text(forecast), chat_id)
        count += 1
    save_state(state)
    return count


def process_new_round(round_: Round, state: dict, chat_id: Optional[str] = None) -> None:
    keep = []
    for item in state.get("pending", []):
        if item.get("wait_left", 0) > 0:
            item["wait_left"] -= 1
            keep.append(item)
            continue
        item["checked"] = int(item.get("checked", 0)) + 1
        item["best"] = max(float(item.get("best", 0.0)), round_.coefficient)
        win = round_.coefficient >= float(item["target"])
        if win:
            state["stats"][item["engine"]]["win"] += 1
            send_message(result_text(item, True, round_.coefficient, item["checked"]), chat_id)
            continue
        if item["checked"] >= int(item.get("validation_rounds", 3)):
            state["stats"][item["engine"]]["lose"] += 1
            send_message(result_text(item, False, round_.coefficient, item["checked"]), chat_id)
            continue
        keep.append(item)
    state["pending"] = keep
    save_state(state)


def set_only(state: dict, engine: str) -> None:
    for key in ENGINE_LABELS:
        state["engines"][key] = (key == engine) if engine != "none" else False


def handle_callback(cb: dict, state: dict, rows: List[Round]) -> None:
    data = str(cb.get("data") or "")
    cid = str((cb.get("message") or {}).get("chat", {}).get("id") or CHAT_ID)
    cbid = str(cb.get("id") or "")
    if data.startswith("toggle:"):
        key = data.split(":", 1)[1]
        if key in ENGINE_LABELS:
            state["engines"][key] = not state["engines"].get(key, False)
            save_state(state)
            answer_callback(cbid, f"{ENGINE_LABELS[key]}: {'ВКЛ' if state['engines'][key] else 'ВЫКЛ'}")
            send_message(bots_text(state), cid, True, state)
            return
    if data.startswith("only:"):
        key = data.split(":", 1)[1]
        if key in ENGINE_LABELS or key == "none":
            set_only(state, key)
            save_state(state)
            answer_callback(cbid, "Режим переключён")
            send_message(bots_text(state), cid, True, state)
            return
    if data == "action:signal":
        answer_callback(cbid, "Анализирую")
        create_forecasts(rows, state, force=True, chat_id=cid)
        return
    if data == "action:stats":
        answer_callback(cbid)
        send_message(stats_text(state), cid)
        return
    answer_callback(cbid, "Неизвестная кнопка")


def handle_message(msg: dict, state: dict, rows: List[Round]) -> None:
    text = str(msg.get("text") or "").strip().split()[0].lower()
    cid = str((msg.get("chat") or {}).get("id") or CHAT_ID)
    if text in ("/start", "/bots"):
        send_message(bots_text(state), cid, True, state)
    elif text == "/signal":
        if create_forecasts(rows, state, force=True, chat_id=cid) == 0:
            send_message("⏸ Активные движки не дали сигнал.", cid)
    elif text in ("/stats", "/status"):
        send_message(stats_text(state), cid)


def poll_telegram(state: dict, rows: List[Round]) -> None:
    if not BOT_TOKEN:
        return
    try:
        data = telegram_api("getUpdates", {
            "offset": int(state.get("telegram_offset", 0)),
            "timeout": 0,
            "allowed_updates": json.dumps(["message", "callback_query"]),
        })
    except Exception:
        return
    changed = False
    for update in data.get("result", []):
        uid = int(update.get("update_id", 0))
        state["telegram_offset"] = max(int(state.get("telegram_offset", 0)), uid + 1)
        changed = True
        if update.get("callback_query"):
            handle_callback(update["callback_query"], state, rows)
        elif update.get("message"):
            handle_message(update["message"], state, rows)
    if changed:
        save_state(state)


def new_rounds_since(rows: List[Round], last_id: Optional[str]) -> List[Round]:
    if not last_id:
        return []
    fresh = []
    for r in rows:
        if r.id == last_id:
            break
        fresh.append(r)
    return list(reversed(fresh))


def main() -> None:
    state = load_state()
    if not BOT_TOKEN:
        raise SystemExit("TELEGRAM_BOT_TOKEN не задан")
    if not SESSION_ID or not CUSTOMER_ID:
        raise SystemExit("LJ_SESSION_ID / LJ_CUSTOMER_ID не заданы")
    send_message("✅ MultiEngine запущен. По умолчанию активен только ALLPREDICTOR. /bots — управление.")
    last_error = ""
    while True:
        try:
            rows = fetch_history()
            if not state.get("last_round_id"):
                state["last_round_id"] = rows[0].id
                save_state(state)
            else:
                fresh = new_rounds_since(rows, state.get("last_round_id"))
                for r in fresh:
                    process_new_round(r, state)
                if fresh:
                    state["last_round_id"] = rows[0].id
                    save_state(state)
            poll_telegram(state, rows)
            last_error = ""
        except Exception as exc:
            message = str(exc)
            if message != last_error:
                send_message(f"⚠️ MultiEngine: {message}")
                last_error = message
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
