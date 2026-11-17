const statusNode = document.querySelector("#status");
const statsNode = document.querySelector("#stats");
const collectButton = document.querySelector("#collect");
const downloadButton = document.querySelector("#download");
const clearButton = document.querySelector("#clear");
const counts = { category: 0, seller: 0, similar: 0, product: 0 };
const LIMIT = 5000;

collectButton.addEventListener("click", collect);
downloadButton.addEventListener("click", download);
clearButton.addEventListener("click", clearItems);
render(loadPreview());

async function collect() {
  collectButton.disabled = true;
  statusNode.textContent = "Читаю открытую страницу…";
  try {
    const tab = await currentTab();
    if (!tab?.id || !tab.url || !allowed(tab.url)) {
      statusNode.textContent = "Откройте категорию, продавца или карточку на ozon.ru или wildberries.ru.";
      return;
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["collect.js"] });
    const [response] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => collectPage() });
    const page = response?.result;
    if (!page?.ok) throw new Error(page?.error || "Страница не разобрана");
    const merged = merge(await storedItems(), page.items || []);
    await chrome.storage.local.set({ items: merged.items });
    render(merged.items);
    const label = page.title ? `«${page.title}»` : "без заголовка";
    statusNode.textContent = `${kindLabel(page.kind)} ${label}: добавлено ${merged.added}, обновлено ${merged.updated}.`;
  } catch (error) {
    statusNode.textContent = error instanceof Error ? error.message : "Не удалось прочитать страницу";
  } finally {
    collectButton.disabled = false;
  }
}

function merge(previous, incoming) {
  const items = previous.slice();
  const index = new Map(items.map((item, position) => [item.url, position]));
  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    if (!item?.url || !item.name) continue;
    const position = index.get(item.url);
    if (position == null) {
      items.push(item);
      index.set(item.url, items.length - 1);
      added += 1;
    } else {
      items[position] = { ...items[position], ...item };
      updated += 1;
    }
  }
  return { items: items.slice(-LIMIT), added, updated };
}

async function download() {
  const items = await storedItems();
  const payload = { exported_at: new Date().toISOString(), count: items.length, items };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = "cenoscope-products.json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

async function clearItems() {
  if (!confirm("Удалить собранные карточки из расширения?")) return;
  await chrome.storage.local.set({ items: [] });
  render([]);
  statusNode.textContent = "Список пуст. Откройте страницу магазина и соберите карточки снова.";
}

async function storedItems() {
  if (!chrome.storage?.local) return loadPreview();
  const data = await chrome.storage.local.get({ items: [] });
  return Array.isArray(data.items) ? data.items : [];
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function render(items) {
  for (const key of Object.keys(counts)) counts[key] = 0;
  for (const item of items) if (item.kind in counts) counts[item.kind] += 1;
  document.querySelector("#total").textContent = String(items.length);
  for (const [key, value] of Object.entries(counts)) document.querySelector(`#${key}`).textContent = String(value);
  const empty = items.length === 0;
  statsNode.hidden = empty;
  downloadButton.disabled = empty;
  clearButton.disabled = empty || !chrome.storage?.local;
}

function loadPreview() {
  if (chrome.storage?.local) {
    storedItems().then(render);
    return [];
  }
  return [];
}

function allowed(value) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return host === "ozon.ru" || host.endsWith(".ozon.ru") || host === "wildberries.ru" || host.endsWith(".wildberries.ru");
  } catch {
    return false;
  }
}

function kindLabel(kind) {
  return { category: "Категория", seller: "Продавец", product: "Товар", similar: "Похожие" }[kind] || "Страница";
}
