"""Reproducible synthetic fixtures. No marketplace requests or copied assets."""
import math
import os
import random
from datetime import date, timedelta
from .analytics import price_metrics, reliability, review_slices

CATEGORIES = [{"id": "ssd", "name": "SSD-накопители", "count": 10}, {"id": "ram", "name": "Оперативная память", "count": 10}, {"id": "gpu", "name": "Видеокарты", "count": 10}]
CATALOG = [
    ("ssd", "Samsung", "990 PRO", "2 ТБ", "MZ-V9P2T0BW", 19990, "7450 МБ/с"),
    ("ssd", "WD", "Black SN850X", "2 ТБ", "WDS200T2X0E", 15990, "7300 МБ/с"),
    ("ssd", "Kingston", "KC3000", "1 ТБ", "SKC3000S/1024G", 8790, "7000 МБ/с"),
    ("ssd", "Samsung", "980 PRO", "1 ТБ", "MZ-V8P1T0BW", 9690, "7000 МБ/с"),
    ("ssd", "Crucial", "T500", "2 ТБ", "CT2000T500SSD8", 13990, "7400 МБ/с"),
    ("ssd", "ADATA", "Legend 960", "1 ТБ", "ALEG-960-1TCS", 7590, "7400 МБ/с"),
    ("ssd", "Lexar", "NM790", "2 ТБ", "LNM790X002T-RNNNG", 10990, "7400 МБ/с"),
    ("ssd", "Kingston", "NV3", "1 ТБ", "SNV3S/1000G", 5490, "6000 МБ/с"),
    ("ssd", "WD", "Blue SN580", "1 ТБ", "WDS100T3B0E", 6290, "4150 МБ/с"),
    ("ssd", "Crucial", "P3 Plus", "1 ТБ", "CT1000P3PSSD8", 5890, "5000 МБ/с"),
    ("ram", "Kingston", "Fury Beast DDR5", "32 ГБ", "KF560C36BBEK2-32", 10990, "6000 МГц"),
    ("ram", "G.Skill", "Trident Z5 DDR5", "32 ГБ", "F5-6000J3038F16GX2-TZ5N", 13990, "6000 МГц"),
    ("ram", "Corsair", "Vengeance DDR5", "32 ГБ", "CMK32GX5M2B6000C30", 12990, "6000 МГц"),
    ("ram", "TeamGroup", "T-Force Delta DDR5", "32 ГБ", "FF3D532G6000HC30DC01", 11990, "6000 МГц"),
    ("ram", "Kingston", "Fury Renegade DDR5", "48 ГБ", "KF572C38RSAK2-48", 20990, "7200 МГц"),
    ("ram", "ADATA", "XPG Lancer DDR5", "32 ГБ", "AX5U6000C3016G-DCLABK", 10490, "6000 МГц"),
    ("ram", "Crucial", "Pro DDR5", "32 ГБ", "CP2K16G56C46U5", 9490, "5600 МГц"),
    ("ram", "Patriot", "Viper Venom DDR5", "32 ГБ", "PVV532G600C30K", 9990, "6000 МГц"),
    ("ram", "Kingston", "Fury Beast DDR4", "16 ГБ", "KF432C16BBK2-16", 3790, "3200 МГц"),
    ("ram", "Corsair", "Vengeance LPX DDR4", "32 ГБ", "CMK32GX4M2E3200C16", 6690, "3200 МГц"),
    ("gpu", "MSI", "GeForce RTX 4060 Ventus 2X", "8 ГБ", "RTX4060-VENTUS2X-8G-OC", 31990, "RTX 4060"),
    ("gpu", "Palit", "GeForce RTX 4070 Super Dual", "12 ГБ", "NED407S019K9-1043D", 64990, "RTX 4070 Super"),
    ("gpu", "Gigabyte", "GeForce RTX 4060 Ti Eagle", "8 ГБ", "GV-N406TEAGLE-8GD", 41990, "RTX 4060 Ti"),
    ("gpu", "Sapphire", "Radeon RX 7800 XT Pulse", "16 ГБ", "11330-02-20G", 54990, "RX 7800 XT"),
    ("gpu", "ASUS", "GeForce RTX 4070 Dual", "12 ГБ", "DUAL-RTX4070-O12G", 59990, "RTX 4070"),
    ("gpu", "PowerColor", "Radeon RX 7600 Fighter", "8 ГБ", "RX7600-8G-F", 25990, "RX 7600"),
    ("gpu", "MSI", "GeForce RTX 4080 Super Ventus", "16 ГБ", "RTX4080S-VENTUS3X-16G", 109990, "RTX 4080 Super"),
    ("gpu", "ASRock", "Radeon RX 7900 GRE Challenger", "16 ГБ", "RX7900GRE-CL-16GO", 61990, "RX 7900 GRE"),
    ("gpu", "Gigabyte", "GeForce RTX 3070 Gaming", "8 ГБ", "GV-N3070GAMING-OC-8GD", 35990, "RTX 3070"),
    ("gpu", "Gigabyte", "GeForce RTX 3070 Ti Gaming", "8 ГБ", "GV-N307TGAMING-OC-8GD", 39990, "RTX 3070 Ti"),
]


def slugify(value):
    import re
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def make_catalog() -> list[dict]:
    today = date.fromisoformat(os.getenv("DEMO_REFERENCE_DATE", "2026-11-14"))
    products = []
    for index, (category, brand, model, capacity, mpn, current, speed) in enumerate(CATALOG):
        rng = random.Random(901 + index)
        slug = slugify(f"{brand}-{model}-{mpn}")
        product_id = f"demo-{slug}"
        variant_id = f"{product_id}-new"
        discount = [18, 22, 14, 4, 11, 16, 9, 5, 7, 3][index % 10]
        baseline = current / (1 - discount / 100)
        offers = []
        for offer_idx, (marketplace, seller_name) in enumerate([("ozon", "ТехноОрбита"), ("wildberries", "Цифровой причал"), ("ozon", "БайтМаркет")]):
            price = current + [0, round(current * .035 / 10) * 10, round(current * .08 / 10) * 10][offer_idx]
            history = []
            for day_idx in range(90):
                day = today - timedelta(days=89 - day_idx)
                amount = price if day_idx >= 85 else baseline + offer_idx * current * .03 + math.sin(day_idx / 7 + index) * baseline * .022 + rng.uniform(-.008, .008) * baseline
                history.append({"date": day.isoformat(), "price": round(amount / 10) * 10})
            history[-1]["price"] = price
            seller = {"id": f"demo-seller-{offer_idx}", "name": seller_name, "rating": [4.9, 4.7, 4.5][offer_idx], "reviews_count": [1240, 860, 350][offer_idx]}
            offer = {"id": f"{product_id}-offer-{offer_idx}", "marketplace": marketplace, "seller": seller, "price": price, "currency": "RUB", "region": "RU-MOW", "price_type": "regular", "payment_condition": "any_card", "availability": True, "condition": "new", "warranty_months": [36, 24, 12][offer_idx], "history": history, "url": None, "is_demo": True, "source_id": "demo", "observed_at": today.isoformat() + "T12:00:00+00:00"}
            offer["reliability"] = reliability(offer)
            offers.append(offer)
        reviews = []
        trend = ["stable", "improving", "declining"][index % 3]
        for review_idx in range(720):
            days_ago = review_idx // 4
            if trend == "declining" and days_ago < 30:
                rating = rng.choices([1, 2, 3, 4, 5], [8, 15, 12, 20, 45])[0]
            elif trend == "improving" and days_ago < 30:
                rating = rng.choices([1, 2, 3, 4, 5], [1, 1, 3, 10, 85])[0]
            else:
                rating = rng.choices([1, 2, 3, 4, 5], [2, 3, 5, 18, 72])[0]
            reviews.append({"id": f"{product_id}-review-{review_idx}", "date": (today - timedelta(days=days_ago)).isoformat(), "rating": rating, "verified_purchase": None, "variant_id": variant_id})
        reviews_data = review_slices(reviews, today)
        history = [{"date": point["date"], "price": min(o["history"][i]["price"] for o in offers)} for i, point in enumerate(offers[0]["history"])]
        metrics = price_metrics(history)
        specs = {"Объём": capacity, "Состояние": "Новый", "Артикул": mpn}
        if category == "ssd":
            specs.update({"Интерфейс": "PCIe 4.0 ×4", "Форм-фактор": "M.2 2280", "Чтение": speed, "Тип памяти": "3D TLC" if "NV3" not in model and "P3" not in model else "3D NAND"})
        elif category == "ram":
            specs.update({"Частота": speed, "Комплект": "2 модуля", "Форм-фактор": "DIMM", "Тип": "DDR4" if "DDR4" in model else "DDR5"})
        else:
            specs.update({"Графический процессор": speed, "Видеопамять": capacity, "Состояние": "Новый"})
        product = {"id": product_id, "slug": slug, "name": f"{brand} {model} {capacity}", "brand": brand, "category": category, "category_name": next(c["name"] for c in CATEGORIES if c["id"] == category), "model": model, "mpn": mpn, "gtin": None, "capacity": capacity, "bundle": "2 modules" if category == "ram" else "retail", "specs": specs, "condition": "new", "image_kind": category, "offers_count": len(offers), "rating": reviews_data["slices"]["all"]["average"], "reviews_count": len(reviews), "review_trend": trend, "data_provenance": {"source_id": "demo", "type": "synthetic", "notice": "Демонстрационные данные, не актуальные предложения маркетплейсов", "license": "Original generated fixture", "observed_at": today.isoformat()}, "is_demo": True, "offers": offers, "reviews": reviews_data, **metrics}
        product["_reviews"] = reviews
        products.append(product)
    return products


def public_product(product: dict, detail=False) -> dict:
    excluded = {"_reviews"} if detail else {"_reviews", "offers", "reviews"}
    return {key: value for key, value in product.items() if key not in excluded}
