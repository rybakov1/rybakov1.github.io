"""Daily equal-weight price analysis and deliberately cautious review signals."""
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from statistics import median

MIN_HISTORY_DAYS = 14
CONTEXT_KEYS = ("currency", "region", "price_type", "payment_condition")


def offer_price_is_fresh(offer: dict, now: datetime | None = None) -> bool:
    """Only a recent, timezone-aware observation can be called a current price."""
    if offer.get("is_demo") is True:
        return True
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("now must have a timezone")
    try:
        observed = datetime.fromisoformat(str(offer.get("observed_at") or "").replace("Z", "+00:00"))
    except ValueError:
        return False
    if observed.tzinfo is None:
        return False
    age = now.astimezone(timezone.utc) - observed.astimezone(timezone.utc)
    return -timedelta(minutes=10) <= age <= timedelta(hours=24)


def daily_prices(observations: list[dict], context: dict | None = None) -> list[dict]:
    days: dict[str, list[float]] = defaultdict(list)
    for row in observations:
        if not row.get("availability", True) or row["price"] <= 0:
            continue
        if context and any(row.get(key, context.get(key)) != context.get(key) for key in CONTEXT_KEYS):
            continue
        day = str(row.get("date", row.get("observed_at")))[:10]
        days[day].append(float(row["price"]))
    points = [{"date": day, "price": round(median(values), 2)} for day, values in sorted(days.items())]
    if len(points) < 5:
        return points
    # Reject isolated >80% spikes and >65% drops with normal neighbors. Sustained
    # changes remain; an actual current drop needs another observation to confirm.
    result = []
    for index, point in enumerate(points):
        neighbors = [p["price"] for p in points[max(0, index - 3):index] + points[index + 1:index + 4]]
        baseline = median(neighbors)
        if baseline * .35 <= point["price"] <= baseline * 1.8:
            result.append(point)
    return result


def price_metrics(history: list[dict], now: date | None = None) -> dict:
    points = daily_prices(history)
    if not points:
        return {"price": None, "median_30": None, "median_90": None, "discount_percent": None, "min_price": None, "max_price": None, "status": "insufficient_data", "days_observed": 0}
    end = now or date.fromisoformat(points[-1]["date"])
    values30 = [p["price"] for p in points if end - timedelta(days=29) <= date.fromisoformat(p["date"]) <= end]
    values90 = [p["price"] for p in points if end - timedelta(days=89) <= date.fromisoformat(p["date"]) <= end]
    med30 = median(values30) if len(values30) >= MIN_HISTORY_DAYS else None
    med90 = median(values90) if len(values90) >= MIN_HISTORY_DAYS else None
    current = points[-1]["price"]
    deviation = round((med30 - current) / med30 * 100, 1) if med30 else None
    baseline_stable = not (med30 and med90 and med30 > med90 * 1.25)
    signal = deviation if baseline_stable else None
    return {"price": current, "median_30": med30, "median_90": med90, "median_deviation_percent": deviation, "discount_percent": signal, "baseline_stable": baseline_stable, "min_price": min(p["price"] for p in points), "max_price": max(p["price"] for p in points), "status": "unstable_baseline" if not baseline_stable else "good" if signal is not None and signal >= 5 else "regular" if med30 else "insufficient_data", "days_observed": len(points), "first_observed": points[0]["date"], "last_updated": points[-1]["date"], "history": points}


def price_is_confirmed(offer: dict) -> bool:
    history = offer.get("history", [])
    if not history or not offer.get("price"):
        return False
    latest_day = max(point["date"] for point in history)
    accepted = [point for point in daily_prices(history) if point["date"] == latest_day]
    return bool(accepted and accepted[-1]["price"] * .35 <= offer["price"] <= accepted[-1]["price"] * 1.8)


def review_slices(reviews: list[dict] | None, now: date, source="demo") -> dict:
    if reviews is None:
        return {"slices": {}, "individual_available": False, "availability": "unavailable", "coverage": "Детальные отзывы недоступны", "source": source, "last_review_at": None}
    ordered = sorted(reviews, key=lambda row: row["date"], reverse=True)
    slices = {}
    for key in ("all", "500", "100", "10", "30d", "90d"):
        if key.endswith("d"):
            days = int(key[:-1])
            cutoff = now - timedelta(days=days - 1)
            previous_cutoff = cutoff - timedelta(days=days)
            selected = [r for r in ordered if cutoff <= date.fromisoformat(r["date"]) <= now]
            previous = [r for r in ordered if previous_cutoff <= date.fromisoformat(r["date"]) < cutoff]
        else:
            size = len(ordered) if key == "all" else int(key)
            selected, previous = ordered[:size], ordered[size:size * 2]
        count, prev_count = len(selected), len(previous)
        avg = sum(r["rating"] for r in selected) / count if count else None
        prev_avg = sum(r["rating"] for r in previous) / prev_count if prev_count else None
        low = sum(r["rating"] <= 2 for r in selected) / count * 100 if count else None
        prev_low = sum(r["rating"] <= 2 for r in previous) / prev_count * 100 if prev_count else None
        comparable = count >= 30 and prev_count >= 30 and min(count, prev_count) / max(count, prev_count) >= .5
        delta = round(avg - prev_avg, 2) if comparable else None
        warning = "Возможно ухудшение: рейтинг и доля низких оценок изменились" if comparable and delta <= -.35 and low - prev_low >= 8 else None
        slices[key] = {"count": count, "average": round(avg, 2) if avg is not None else None, "low_share": round(low, 1) if low is not None else None, "delta": delta, "previous_count": prev_count, "warning": warning, "uncertainty": "Высокая статистическая неопределённость" if count < 30 else None, "period_start": min((r["date"] for r in selected), default=None), "period_end": max((r["date"] for r in selected), default=None)}
    return {"slices": slices, "individual_available": True, "availability": "available" if ordered else "no_reviews", "coverage": f"{len(ordered)} синтетических оценок одного варианта за 180 дней" if source == "demo" else f"{len(ordered)} доступных оценок одного варианта", "source": source, "last_review_at": ordered[0]["date"] if ordered else None}


def normalized(value):
    return "".join(c.lower() for c in str(value) if c.isalnum())


def match_product(candidate: dict, product: dict) -> tuple[float, str]:
    # Condition, bundle and capacity are hard boundaries, including Ti models.
    for field in ("condition", "capacity", "bundle"):
        if normalized(candidate.get(field, "new" if field == "condition" else "")) != normalized(product.get(field, "new" if field == "condition" else "")):
            return 0, f"Несовместимое поле: {field}"
    if normalized(candidate.get("brand")) != normalized(product.get("brand")):
        return 0, "Разные бренды"
    if normalized(candidate.get("model", "")) != normalized(product.get("model", "")):
        return 0, "Разные модели; Ti, Super и другие суффиксы значимы"
    if candidate.get("gtin") and product.get("gtin") and candidate["gtin"] == product["gtin"]:
        return 1, "Совпали GTIN и характеристики"
    if candidate.get("mpn") and normalized(candidate["mpn"]) == normalized(product.get("mpn", "")):
        return .99, "Совпали MPN и характеристики"
    if normalized(candidate.get("model", "")) == normalized(product.get("model", "")):
        return .85, "Модель совпала, требуется проверка артикула"
    return 0, "Модель не совпала"


def reliability(offer: dict) -> dict:
    factors = [
        {"name": "Рейтинг продавца", "weight": .4, "value": round(offer["seller"]["rating"] / 5 * 100) if offer["seller"].get("rating") is not None else None},
        {"name": "Гарантия от 12 месяцев", "weight": .25, "value": None if offer.get("warranty_months") is None else 100 if offer["warranty_months"] >= 12 else 40},
        {"name": "Стабильность наблюдений", "weight": .2, "value": 100 if len(offer.get("history", [])) >= 30 else None},
        {"name": "Новое состояние", "weight": .15, "value": 100 if offer.get("condition") == "new" else 40 if offer.get("condition") in ("used", "refurbished") else None},
    ]
    coverage = sum(f["weight"] for f in factors if f["value"] is not None)
    return {"score": round(sum(f["weight"] * f["value"] for f in factors if f["value"] is not None) / coverage) if coverage >= .7 else None, "factors": factors, "coverage": round(coverage, 2), "label": "Расчётная оценка предложения; не подтверждает оригинальность"}
