import type { MetadataRoute } from "next";
// Пока весь сайт демонстрационный и закрыт от индексации, карта намеренно пуста.
// Заполняйте её только после включения проверенных материалов и снятия noindex.
export default function sitemap(): MetadataRoute.Sitemap { return []; }

export const dynamic = 'force-static';
