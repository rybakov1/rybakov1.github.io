import type { BrowserObservation } from './browser-import';
export type CategoryId = 'ssd' | 'ram' | 'gpu' | 'unclassified';
export type ReviewSliceKey = 'all' | '500' | '100' | '10' | '30d' | '90d';
export interface Category { id: CategoryId; name: string; count: number; }
export interface PricePoint { date: string; price: number; }
export interface PriceContext { currency:string|null; region:string|null; price_type:string|null; payment_condition:string|null; }
export interface DataProvenance {
  source_id: string;
  type: string;
  notice?: string;
  license?: string;
  observed_at?: string;
  permission_reference?: string;
  rights?: Record<string, string>;
}
export interface Seller {
  id: string;
  name: string;
  rating: number | null;
  reviews_count: number | null;
}
export interface ReliabilityFactor { name: string; weight: number; value: number | null; }
export interface Reliability {
  score: number | null;
  factors: ReliabilityFactor[];
  coverage: number;
  label: string;
}
export interface Offer {
  id: string;
  marketplace: string;
  seller: Seller;
  price: number;
  price_fresh?: boolean;
  price_confirmed?: boolean;
  currency: string;
  region: string;
  price_type: string;
  payment_condition: string;
  availability: boolean;
  condition: string;
  warranty_months: number | null;
  reliability: Reliability;
  history: PricePoint[];
  url: string | null;
  is_demo: boolean;
  source_id: string;
  observed_at: string;
}
export interface ReviewSlice {
  count: number;
  average: number | null;
  low_share: number | null;
  delta: number | null;
  warning: string | null;
  uncertainty: string | null;
  previous_count: number;
  period_start: string | null;
  period_end: string | null;
}
export interface Reviews {
  slices: Partial<Record<ReviewSliceKey, ReviewSlice>>;
  last_review_at: string | null;
  source: string;
  coverage: string;
  individual_available: boolean;
  availability: 'available' | 'unavailable' | 'empty' | string;
}
export interface Product {
  record_type?: 'unverified_listing';
  browser_observation?: BrowserObservation;
  browser_observations?: BrowserObservation[];
  price_context?: PriceContext;
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: CategoryId;
  category_name: string;
  model: string;
  mpn: string;
  gtin: string | null;
  capacity: string;
  bundle: string;
  specs: Record<string, string>;
  condition: string;
  image_kind: CategoryId;
  price: number | null;
  price_fresh?: boolean;
  median_30: number | null;
  median_90: number | null;
  discount_percent: number | null;
  min_price: number | null;
  max_price: number | null;
  status: 'good' | 'regular' | 'expensive' | 'insufficient' | string;
  offers_count: number;
  rating: number | null;
  reviews_count: number;
  review_trend: 'stable' | 'declining' | 'improving' | string;
  history: PricePoint[];
  days_observed: number;
  first_observed: string | null;
  last_updated: string | null;
  data_provenance: DataProvenance;
  is_demo: boolean;
}
export interface ProductDetail extends Product { offers: Offer[]; reviews: Reviews; }
export interface ProductsResponse {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
  categories: Category[];
  data_mode: string;
}
export interface AppConfig {
  brand: string;
  telegram_enabled: boolean;
  telegram_username: string | null;
  data_mode: string;
}
export interface ProductQuery {
  q?: string;
  category?: CategoryId | string;
  brand?: string;
  min_price?: number;
  max_price?: number;
  deals_only?: boolean;
  sort?: 'discount' | 'price_asc' | 'price_desc' | 'rating' | 'popular' | string;
}
