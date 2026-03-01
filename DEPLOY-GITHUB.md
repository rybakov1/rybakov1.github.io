# Деплой на GitHub

## 1. Выложить код в репозиторий

В папке проекта выполни:

```bash
git init
git add .
git commit -m "Initial commit: Brij & Co website"
```

На [GitHub](https://github.com/new) создай новый репозиторий (например `brijnco-website`). **Не** добавляй README, .gitignore или лицензию — они уже есть локально.

Подключи репозиторий и отправь код (подставь свой логин и имя репо):

```bash
git remote add origin https://github.com/ВАШ_ЛОГИН/brijnco-website.git
git branch -M main
git push -u origin main
```

---

## 2. Включить сайт на GitHub Pages

После пуша в ветку `main` сайт можно раздавать через GitHub Pages.

### Шаг A: Включить Pages в настройках репо

1. Открой репозиторий на GitHub.
2. **Settings** → **Pages**.
3. В **Source** выбери **GitHub Actions**.

После первого пуша в `main` запустится workflow: сборка Astro и деплой в GitHub Pages.

### Шаг B: Указать базовый путь (если нужен проект-сайт)

Сайт будет доступен по адресу:

`https://ВАШ_ЛОГИН.github.io/ИМЯ_РЕПО/`

Если используешь такой проект-сайт (не `username.github.io`), в **astro.config.mjs** задай `base`:

```js
export default defineConfig({
  site: 'https://ВАШ_ЛОГИН.github.io',
  base: '/ИМЯ_РЕПО/',   // например '/brijnco-website/'
  // ... остальное без изменений
});
```

Пересобери и запушь — после деплоя сайт откроется по ссылке выше.

### Свой домен (brijnco.com.au)

Когда будешь подключать домен brijnco.com.au:

1. В **Settings** → **Pages** укажи свой домен в **Custom domain**.
2. В **astro.config.mjs** верни `site: 'https://brijnco.com.au'` и убери `base` (или оставь `base: '/'`).

---

## Кратко

| Действие | Команда / место |
|----------|------------------|
| Инициализация | `git init` |
| Первый коммит | `git add .` и `git commit -m "..."` |
| Подключить GitHub | `git remote add origin https://github.com/...` |
| Отправить код | `git push -u origin main` |
| Включить сайт | Repo → Settings → Pages → Source: **GitHub Actions** |

Сборка и деплой выполняются автоматически при каждом `git push` в `main`.
