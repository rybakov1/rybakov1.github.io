from abc import ABC, abstractmethod
from .demo import make_catalog, public_product


class MarketplaceProvider(ABC):
    data_provenance: dict

    @abstractmethod
    def get_products(self) -> list[dict]: ...

    @abstractmethod
    def get_offers(self, product_id: str) -> list[dict]: ...

    @abstractmethod
    def get_prices(self, offer_id: str) -> list[dict]: ...

    @abstractmethod
    def get_reviews(self, product_id: str) -> dict: ...


class DemoProvider(MarketplaceProvider):
    data_provenance = {"source_id": "demo", "type": "synthetic", "permission": "original generated data"}

    def __init__(self):
        self.products = make_catalog()

    def get_products(self):
        return [public_product(p, detail=True) for p in self.products]

    def get_offers(self, product_id):
        return next((p["offers"] for p in self.products if p["id"] == product_id), [])

    def get_prices(self, offer_id):
        return next((o["history"] for p in self.products for o in p["offers"] if o["id"] == offer_id), [])

    def get_reviews(self, product_id):
        return next((p["reviews"] for p in self.products if p["id"] == product_id), {})


class DisabledMarketplaceProvider(MarketplaceProvider):
    data_provenance = {"type": "disabled", "permission": None}

    def _disabled(self):
        raise RuntimeError("Источник отключён. Подключите разрешённый документированный API/фид после проверки прав, договора, фото и отзывов. Недокументированные endpoints не используются.")

    def get_products(self):
        return self._disabled()

    def get_offers(self, product_id):
        return self._disabled()

    def get_prices(self, offer_id):
        return self._disabled()

    def get_reviews(self, product_id):
        return self._disabled()


class OzonProvider(DisabledMarketplaceProvider):
    pass


class WildberriesProvider(DisabledMarketplaceProvider):
    pass
