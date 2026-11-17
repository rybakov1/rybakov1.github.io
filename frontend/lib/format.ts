const priceFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
export function formatPrice(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? 'Нет данных' : `${priceFormatter.format(value)} ₽`;
}
export function formatNumber(value: number): string { return priceFormatter.format(value); }
export function formatDate(value: string | null | undefined, short = false): string {
  if (!value) return 'Нет данных';
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00Z`);
  if (Number.isNaN(date.valueOf())) return 'Нет данных';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: short ? 'short' : 'long', ...(short ? {} : {year: 'numeric'}), timeZone: 'Europe/Moscow' });
}
export function pluralize(value: number, one: string, few: string, many: string): string {
  const n = Math.abs(value) % 100;
  return `${formatNumber(value)} ${n > 10 && n < 20 ? many : n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many}`;
}
