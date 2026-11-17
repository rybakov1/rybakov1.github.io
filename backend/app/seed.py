import json
from datetime import datetime, timezone
from sqlalchemy import select
from .config import settings
from .db import SessionLocal
from .demo import make_catalog, public_product
from .models import Product, ProductVariant, Seller, Offer, PriceObservation, Review, ReviewObservation, SourceSyncRun


def seed(session):
    if not settings.demo_mode or session.scalar(select(Product).where(Product.id.like("demo-%"))):
        return 0
    catalog = make_catalog()
    for p in catalog:
        session.add(Product(id=p["id"], slug=p["slug"], name=p["name"], brand=p["brand"], category=p["category"], data=public_product(p, True)))
    session.flush()
    sellers = catalog[0]["offers"]
    for o in sellers:
        s = o["seller"]
        session.add(Seller(id=s["id"], name=s["name"], rating=s["rating"], reviews_count=s["reviews_count"], provenance={"source_id": "demo", "type": "synthetic"}))
    session.flush()
    for p in catalog:
        variant_id = p["id"] + "-new"
        session.add(ProductVariant(id=variant_id, product_id=p["id"], mpn=p["mpn"], condition="new", specifications=p["specs"]))
        session.flush()
        for o in p["offers"]:
            session.add(Offer(id=o["id"], product_id=p["id"], variant_id=variant_id, seller_id=o["seller"]["id"], marketplace=o["marketplace"], source_id="demo", url=None, data=o))
        session.flush()
        session.add_all([PriceObservation(offer_id=o["id"], price=point["price"], currency=o["currency"], region=o["region"], price_type=o["price_type"], payment_condition=o["payment_condition"], availability=True, observed_at=datetime.fromisoformat(point["date"] + "T12:00:00+00:00"), source_id="demo", data_provenance=p["data_provenance"]) for o in p["offers"] for point in o["history"]])
        session.add_all([Review(id=r["id"], product_id=p["id"], variant_id=variant_id, rating=r["rating"], reviewed_at=datetime.fromisoformat(r["date"] + "T12:00:00+00:00"), verified_purchase=None, source_id="demo") for r in p["_reviews"]])
        session.add(ReviewObservation(product_id=p["id"], variant_id=variant_id, source_id="demo", observed_at=datetime.now(timezone.utc), count=p["reviews_count"], average=p["rating"], data=p["reviews"]))
    session.add(SourceSyncRun(source_id="demo", status="success", imported=len(catalog) * 90 * 3, finished_at=datetime.now(timezone.utc), provenance={"type": "synthetic", "seed": 901}))
    session.commit()
    return len(catalog)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--export", help="Write JSON fixture without database")
    args = parser.parse_args()
    if args.export:
        with open(args.export, "w", encoding="utf-8") as f:
            json.dump([public_product(p, True) for p in make_catalog()], f, ensure_ascii=False, separators=(",", ":"))
        print("Exported 30 demo products")
    else:
        with SessionLocal() as session:
            print(f"Seeded {seed(session)} demo models (idempotent)")
