# Деплой на GitHub

## 1. Выложить код в репозиторий

В папке проекта выполни:

```bash
git init
git add .
git commit -m "Initial commit: Brij & Co website"
```

### Вариант А: репозитория ещё нет

Для сайта **rybakov1.github.io** репозиторий на GitHub должен называться именно **rybakov1.github.io**.

На [GitHub](https://github.com/new) создай репозиторий с именем `rybakov1.github.io`. **Не** добавляй README, .gitignore или лицензию — они уже есть локально.

Подключи репозиторий и отправь код:

```bash
git remote add origin https://github.com/rybakov1/rybakov1.github.io.git
git branch -M main
git push -u origin main
```

### Вариант Б: репозиторий уже создан

**Если репо пустой** — те же команды, что выше: `git remote add origin ...`, затем `git push -u origin main`.

**Если при создании добавили README** (на GitHub есть один коммит) — после `git remote add origin ...` сделай:

```bash
git pull origin main --allow-unrelated-histories
git push -u origin main
```

Так твой локальный проект и то, что на GitHub, объединятся в одну историю.

**Если хочешь полностью заменить содержимое репо** своим проектом (всё, что было на GitHub, будет перезаписано):

```bash
git remote add origin https://github.com/ВАШ_ЛОГИН/ИМЯ_РЕПО.git
git branch -M main
git push -u origin main --force
```

`--force` перезаписывает ветку `main` на GitHub. Используй только если старые коммиты в репо тебе не нужны и с репо не работают другие люди.

---

## 2. Включить сайт на GitHub Pages

После пуша в ветку `main` сайт можно раздавать через GitHub Pages.

### Шаг A: Включить Pages в настройках репо

1. Открой репозиторий **rybakov1.github.io** на GitHub.
2. **Settings** → **Pages**.
3. В **Source** выбери **GitHub Actions**.

После первого пуша в `main` запустится workflow: сборка Astro и деплой. Сайт будет доступен по адресу:

**https://rybakov1.github.io**

Для пользовательского сайта (`username.github.io`) базовый путь не нужен — в конфиге уже указано `site: 'https://rybakov1.github.io'`.

### Если захочешь свой домен (brijnco.com.au)

1. В **Settings** → **Pages** укажи домен в **Custom domain**.
2. В **astro.config.mjs** смени `site` на `'https://brijnco.com.au'`.

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
