# Выпуск в продакшн — чеклист

## Обязательно перед запуском

| # | Задача | Статус |
|---|--------|--------|
| 1 | **Сборка** — выполнить `npm run build`, проверить папку `dist/` | ⬜ |
| 2 | **Формы** — подключить отправку заявок (Formspree, Netlify Forms или свой backend). Сейчас кнопка «Submit» только показывает «Thank you», данные никуда не уходят | ⬜ |
| 3 | **OG-картинка** — положить в `public/og.jpg` изображение 1200×630 px (лого/баннер для соцсетей). Сайт уже ссылается на `https://brijnco.com.au/og.jpg` | ⬜ |
| 4 | **Домен и хостинг** — завести хостинг (Vercel, Netlify, или любой статический), привязать домен brijnco.com.au | ⬜ |
| 5 | **SSL** — убедиться, что сайт открывается по HTTPS (у Vercel/Netlify обычно включено по умолчанию) | ⬜ |

## Желательно

| # | Задача | Заметки |
|---|--------|--------|
| 6 | **Аналитика** | Добавить Google Analytics (GA4) или аналог в `Layout.astro` для учёта посещений и заявок |
| 7 | **Политика конфиденциальности** | Страница `/privacy` и ссылка в футере (часто требуют для форм и рекламы) |
| 8 | **Проверка контактов** | Убедиться, что телефон 1800 957 469 и email info@brijnco.com актуальны и приходят на нужный адрес |

## Уже сделано

- SEO: meta, Open Graph, JSON-LD, sitemap, robots.txt  
- Адаптивная вёрстка, доступность (skip link), 404  
- Сжатие HTML, инлайновые стили, быстрая загрузка  
- Реалистичные цифры (2+ года, 50+ проектов, 1 мастерская)

---

## Деплой

```bash
npm run build
```

Содержимое папки `dist/` загрузить на хостинг (Vercel, Netlify, или любой статический).

---

## Дальнейшие улучшения (по желанию)

| Priority | Task | Notes |
|----------|------|------|
| High | **Real form backend** | Formspree, Netlify Forms, or your API so leads are saved and emailed. |
| High | **OG image** | `public/og.jpg` 1200×630 so shares look good. |
| Medium | **Real photos** | About, One Stop Shop, Projects: replace placeholders with real project/team images; use Astro Image for optimisation. |
| Medium | **Privacy & Terms** | Add `/privacy` and `/terms` pages; link them in the footer. |
| Medium | **Analytics** | GA4 or similar in `Layout.astro` for traffic and conversions. |
| Low | **More font weights** | If you don’t use 500/800/900, reduce the Mulish URL to 400,600,700 for smaller CSS. |
| Low | **Sticky CTA** | On scroll, optional floating “Get a quote” button on mobile. |

**Already done:** responsive layout, content-box, animations, SEO meta + JSON-LD, sitemap, 404 page, skip link, form feedback message.

## SEO (already configured)

- Meta description, keywords, canonical
- Open Graph and Twitter Card
- JSON-LD LocalBusiness
- Sitemap (`/sitemap-index.xml`)
- `robots.txt` allows indexing

## Performance

- Static HTML (fast TTFB)
- Fonts loaded with `display=swap`
- Inline critical CSS (Astro)
- HTML compression enabled
- No render-blocking JS (observer runs after DOM)

## Deploy

```bash
npm run build
```

Upload contents of `dist/` to your host (Vercel, Netlify, or any static host).
