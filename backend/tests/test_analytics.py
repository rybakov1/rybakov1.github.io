from datetime import date, timedelta
from app.analytics import daily_prices, match_product, price_metrics, reliability, review_slices


def points(count=30, amount=100):
    end = date(2026, 11, 14)
    return [{"date": (end - timedelta(days=count - i - 1)).isoformat(), "price": amount} for i in range(count)]


def test_daily_medians_ignore_change_event_frequency():
    rows = points(30, 100)
    rows += [{"date": rows[0]["date"], "price": 120}] * 100
    assert price_metrics(rows)["median_30"] == 100
    assert len(daily_prices(rows)) == 30


def test_insufficient_history_is_not_a_discount():
    result = price_metrics(points(13))
    assert result["median_30"] is None
    assert result["discount_percent"] is None
    assert result["status"] == "insufficient_data"
    assert price_metrics(points(14))["median_30"] == 100


def test_discount_against_daily_median():
    rows = points()
    for row in rows[-3:]:
        row["price"] = 80
    result = price_metrics(rows)
    assert result["median_30"] == 100
    assert result["discount_percent"] == 20
    assert result["status"] == "good"


def test_reject_isolated_anomaly_and_unavailable():
    rows = points()
    rows[10]["price"] = 10000
    rows[11]["price"] = 2
    rows[12]["availability"] = False
    result = price_metrics(rows)
    assert result["min_price"] == result["max_price"] == 100
    assert result["days_observed"] == 27


def test_contexts_cannot_mix():
    rows = [{"date": "2026-11-14", "price": 80, "currency": "RUB", "region": "RU-MOW", "price_type": "membership", "payment_condition": "card"}, {"date": "2026-11-14", "price": 100, "currency": "RUB", "region": "RU-MOW", "price_type": "regular", "payment_condition": "any_card"}]
    assert daily_prices(rows, {"currency": "RUB", "region": "RU-MOW", "price_type": "regular", "payment_condition": "any_card"})[0]["price"] == 100


def test_sustained_lower_price_survives_outlier_detection():
    rows = points()
    for row in rows[-10:]:
        row["price"] = 70
    assert price_metrics(rows)["price"] == 70


def test_artificial_baseline_hike_is_not_a_confirmed_discount():
    rows = points(90)
    for p in rows[-20:-1]:
        p["price"] = 160
    result = price_metrics(rows)
    assert result["median_30"] == 160
    assert result["median_90"] == 100
    assert result["median_deviation_percent"] == 37.5
    assert result["discount_percent"] is None
    assert result["status"] == "unstable_baseline"


def model(**overrides):
    return {"brand": "Gigabyte", "model": "RTX 3070", "mpn": "MPN3070", "condition": "new", "capacity": "8 GB", "bundle": "retail", **overrides}


def test_exact_identifier_match():
    assert match_product(model(), model())[0] == .99


def test_ti_cannot_merge_even_with_forged_identifier():
    assert match_product(model(model="RTX 3070 Ti"), model())[0] == 0


def test_capacity_and_condition_hard_boundaries():
    assert match_product(model(capacity="16 GB"), model())[0] == 0
    assert match_product(model(condition="refurbished"), model())[0] == 0
    assert match_product(model(bundle="bulk"), model())[0] == 0


def test_ambiguous_mpn_enters_moderation():
    assert match_product(model(mpn="MAYBE"), model())[0] == .85


def test_review_deterioration_requires_comparable_samples():
    end = date(2026, 11, 14)
    reviews = [{"date": (end - timedelta(days=i // 4)).isoformat(), "rating": 2 if i < 120 else 5} for i in range(240)]
    result = review_slices(reviews, end)
    assert result["slices"]["30d"]["warning"]
    assert result["slices"]["30d"]["delta"] == -3
    assert result["slices"]["10"]["warning"] is None
    assert result["slices"]["10"]["uncertainty"]


def test_no_reviews_distinct_from_unavailable():
    assert review_slices([], date.today())["availability"] == "no_reviews"
    assert review_slices(None, date.today())["availability"] == "unavailable"
    assert review_slices(None, date.today())["slices"] == {}


def test_unknown_reliability_does_not_invent_score():
    result = reliability({"seller": {"rating": None}, "history": [], "condition": None})
    assert result["score"] is None
    assert result["coverage"] == 0
