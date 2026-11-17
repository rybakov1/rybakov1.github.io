(function (root) {
  'use strict';
  const STATE_KEY = 'autoCollectorState', ALARM_NAME = 'cenoskop-auto-wake';
  const DEFAULTS = {delaySeconds: 12, renderWaitSeconds: 8, pageTimeoutSeconds: 45, maxPages: 50, autoExport: true, categoryScrollRounds: 12, categoryScrollPauseSeconds: 2, categoryMaxProducts: 100, categoryMaxPages: 3};
  const STATUSES = new Set(['idle', 'running', 'paused', 'completed', 'stopped', 'blocked']);
  const GRANTS = new Set(['https://ozon.ru/*', 'https://www.ozon.ru/*', 'https://wildberries.ru/*', 'https://www.wildberries.ru/*']);
  const clone = value => JSON.parse(JSON.stringify(value));
  const errorText = error => String(error?.message || error || 'Неизвестная ошибка').slice(0, 240);

  function partition(input = {}) {
    const count = Number(input.count ?? 1), index = Number(input.index ?? 1);
    if (!Number.isInteger(count) || count < 1 || count > 32 || !Number.isInteger(index) || index < 1 || index > count) throw new Error('Номер экземпляра должен быть от 1 до общего количества экземпляров (не более 32).');
    return {index, count};
  }
  function belongsToPartition(url, part) {
    // Stable FNV-1a on canonical product URL, identical in every profile.
    let hash = 2166136261;
    for (let i = 0; i < url.length; i++) hash = Math.imul(hash ^ url.charCodeAt(i), 16777619);
    return (hash >>> 0) % part.count === part.index - 1;
  }

  function settings(input = {}) {
    const number = (key, min, max) => {
      const value = Number(input[key] ?? DEFAULTS[key]);
      if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Настройка ${key}: от ${min} до ${max}.`);
      return Math.round(value);
    };
    return {delaySeconds: number('delaySeconds', 5, 300), renderWaitSeconds: number('renderWaitSeconds', 3, 30), pageTimeoutSeconds: number('pageTimeoutSeconds', 15, 90), maxPages: number('maxPages', 1, 200), autoExport: input.autoExport !== false, categoryScrollRounds: number('categoryScrollRounds', 0, 50), categoryScrollPauseSeconds: number('categoryScrollPauseSeconds', 1, 10), categoryMaxProducts: number('categoryMaxProducts', 1, 200), categoryMaxPages: number('categoryMaxPages', 1, 10)};
  }
  function emptyState(now) {
    return {version: 1, status: 'idle', queue: [], index: 0, activeTabId: null, settings: {...DEFAULTS}, partition: {index: 1, count: 1}, results: [], errors: [], discovered_count: 0, truncated_count: 0, started_at: null, updated_at: new Date(now).toISOString(), next_action_at: null, phase: null, run_id: null, last_export: null};
  }

  class CollectorEngine {
    constructor(browser, extractor, options = {}) {
      this.browser = browser; this.extractor = extractor;
      this.now = options.now || (() => Date.now());
      this.setTimer = options.setTimeout || ((fn, delay) => setTimeout(fn, delay));
      this.clearTimer = options.clearTimeout || (id => clearTimeout(id));
      this.randomId = options.randomId || (() => root.crypto.randomUUID());
      this.serial = Promise.resolve(); this.epoch = 0; this.cached = null; this.owned = new Set(); this.timer = null; this.ready = null;
    }
    _queue(fn) { const result = this.serial.then(fn); this.serial = result.catch(() => {}); return result; }
    _snapshot() { return clone(this.cached); }
    _valid(epoch) { return epoch === this.epoch; }
    async _save(epoch = this.epoch) {
      if (!this._valid(epoch)) return false;
      this.cached.updated_at = new Date(this.now()).toISOString();
      await this.browser.storage.local.set({[STATE_KEY]: clone(this.cached)});
      return this._valid(epoch);
    }
    initialize() {
      if (this.ready) return this.ready;
      this.ready = this._queue(async () => {
        await Promise.resolve(this.browser.storage.local.setAccessLevel?.({accessLevel: 'TRUSTED_CONTEXTS'})).catch(() => {});
        await this._cleanLegacy();
        const stored = (await this.browser.storage.local.get(STATE_KEY))[STATE_KEY];
        this.cached = stored?.version === 1 && STATUSES.has(stored.status) && Array.isArray(stored.queue) && Array.isArray(stored.results) && Array.isArray(stored.errors) ? stored : emptyState(this.now());
        this.cached.settings = settings(this.cached.settings);
        this.cached.partition = partition(this.cached.partition);
        if (this.cached.activeTabId != null) this.owned.add(this.cached.activeTabId);
        if (this.cached.status === 'running') await this._schedule(Date.parse(this.cached.next_action_at || '') || this.now());
        await this._save(); return this._snapshot();
      });
      return this.ready;
    }
    async _cleanLegacy() {
      const stored = await this.browser.storage.local.get(null);
      const keys = Object.keys(stored).filter(key => /^collector/i.test(key));
      if (keys.length) await this.browser.storage.local.remove(keys);
      const grants = await this.browser.permissions.getAll().catch(() => ({origins: []}));
      const unwanted = (grants.origins || []).filter(origin => !GRANTS.has(origin));
      if (unwanted.length) await this.browser.permissions.remove({origins: unwanted}).catch(() => {});
    }
    _interrupt(closeOwn = true) {
      this.epoch += 1;
      if (this.timer != null) this.clearTimer(this.timer);
      this.timer = null;
      this.browser.alarms.clear(ALARM_NAME).catch(() => {});
      const id = this.cached?.activeTabId;
      if (closeOwn && id != null && this.owned.has(id)) this._removeOwned(id).catch(() => {});
      return this.epoch;
    }
    async _removeOwned(id) {
      if (!this.owned.has(id)) return;
      this.owned.delete(id);
      await this.browser.tabs.remove(id).catch(() => {});
    }
    async _cancelWake() {
      if (this.timer != null) this.clearTimer(this.timer);
      this.timer = null;
      await this.browser.alarms.clear(ALARM_NAME).catch(() => {});
    }
    async _schedule(at, epoch = this.epoch) {
      await this._cancelWake();
      if (!this._valid(epoch) || this.cached.status !== 'running') return;
      this.cached.next_action_at = new Date(at).toISOString();
      // Packed Chrome 120 extensions can defer alarms by >=30s. A foreground
      // timer is only an optimization; this alarm survives worker suspension.
      await this.browser.alarms.create(ALARM_NAME, {when: Math.max(this.now() + 30000, at)});
      if (!this._valid(epoch)) return;
      this.timer = this.setTimer(() => { this.timer = null; if (this._valid(epoch)) this.onAlarm({name: ALARM_NAME}).catch(() => {}); }, Math.max(0, at - this.now()));
    }
    _normalizeUrls(input, limit, part) {
      const values = Array.isArray(input) ? input : String(input || '').split(/\r?\n/);
      const entries = values.map(value => String(value).trim()).filter(Boolean);
      if (entries.length > 200) throw new Error('Допускается не более 200 исходных ссылок.');
      const seen = new Set(), queue = [], input_urls = []; let truncated = 0;
      for (const value of entries) {
        const page = this.extractor.supportedPage(value);
        if (seen.has(page.url)) continue;
        seen.add(page.url);
        // The source list must be recorded before sharding or queue truncation:
        // the expanded queue cannot reconstruct the user's original inputs.
        input_urls.push(page.url);
        if (page.mode !== 'discovery' && !belongsToPartition(page.url, part)) continue;
        if (queue.length < limit) queue.push({url: page.url, kind: page.mode === 'discovery' ? 'discovery' : 'product', status: 'pending', attempts: 0});
        else truncated += 1;
      }
      if (!queue.length) throw new Error('Для этого экземпляра нет товаров. Проверьте ссылки и номер экземпляра.');
      return {queue, truncated, input_urls};
    }
    _hasPermission(url) { return this.browser.permissions.contains({origins: [`${new URL(url).origin}/*`]}); }
    dispatch(message) {
      if (!message || typeof message.type !== 'string') return Promise.reject(new Error('Некорректная команда.'));
      const type = message.type;
      if (type === 'AUTO_START' && this.cached?.status === 'running') return Promise.reject(new Error('Сначала приостановите или остановите текущий сбор.'));
      if (type === 'AUTO_RESUME' && this.cached && this.cached.status !== 'paused') return Promise.reject(new Error('Продолжить можно только приостановленный сбор.'));
      const control = ['AUTO_START', 'AUTO_PAUSE', 'AUTO_RESUME', 'AUTO_STOP', 'AUTO_CLEAR'].includes(type);
      const epoch = control ? this._interrupt() : this.epoch;
      return this.initialize().then(() => this._queue(async () => {
        if (control && !this._valid(epoch)) return this._snapshot();
        if (type === 'AUTO_GET_STATE') return this._snapshot();
        if (type === 'AUTO_START') {
          const config = settings(message.settings), part = partition(message.partition), normalized = this._normalizeUrls(message.urls, config.maxPages, part), queue = normalized.queue;
          for (const item of queue) if (!await this._hasPermission(item.url)) throw new Error('Разрешите доступ к маркетплейсам кнопкой «Начать» в окне расширения.');
          if (!this._valid(epoch)) return this._snapshot();
          this.cached = {...emptyState(this.now()), status: 'running', queue, input_urls: normalized.input_urls, truncated_count: normalized.truncated, settings: config, partition: part, run_id: this.randomId(), started_at: new Date(this.now()).toISOString(), phase: 'delay'};
          await this._save(epoch); await this._openNext(epoch); return this._snapshot();
        }
        if (type === 'AUTO_PAUSE' || type === 'AUTO_STOP') {
          await this._cancelWake(); await this._resetInFlight();
          this.cached.status = type === 'AUTO_PAUSE' && this.cached.status === 'running' ? 'paused' : type === 'AUTO_STOP' ? 'stopped' : this.cached.status;
          this.cached.next_action_at = null; this.cached.phase = null;
          await this._save(epoch); return this._snapshot();
        }
        if (type === 'AUTO_RESUME') {
          if (this.cached.status !== 'paused') throw new Error('Продолжить можно только приостановленный сбор. После проверки безопасности начните новый запуск вручную.');
          this.cached.status = 'running'; this.cached.phase = 'delay';
          await this._schedule(this.now() + this.cached.settings.delaySeconds * 1000);
          await this._save(epoch); return this._snapshot();
        }
        if (type === 'AUTO_CLEAR') {
          await this._cancelWake(); await this._resetInFlight(); this.cached = emptyState(this.now());
          await this._save(epoch); return this._snapshot();
        }
        if (type === 'AUTO_EXPORT') return this._export(message.saveAs !== false, false, epoch);
        if (type === 'AUTO_GET_EXPORT_JSON') {
          const exported = this._makeExport();
          return {json: exported.json, filename: exported.filename, observation_count: exported.state.results.length, partial: exported.state.status !== 'completed'};
        }
        if (type === 'AUTO_CAPTURE_CURRENT') {
          const [tab] = await this.browser.tabs.query({active: true, currentWindow: true});
          if (tab?.id == null || !tab.url) throw new Error('Откройте поддерживаемую страницу товара.');
          const page = this.extractor.supportedPage(tab.url);
          await this._capture(tab.id, {url: page.url, kind: page.mode === 'discovery' ? 'discovery' : 'product'}, epoch, true);
          return this._snapshot();
        }
        throw new Error('Команда не поддерживается.');
      }));
    }
    async _resetInFlight() {
      const item = this.cached.queue[this.cached.index];
      if (item && ['loading', 'waiting'].includes(item.status)) item.status = 'pending';
      const id = this.cached.activeTabId; this.cached.activeTabId = null;
      if (id != null) await this._removeOwned(id);
      delete this.cached.page_deadline_at;
      delete this.cached.discovery_deadline_at;
    }
    async _openNext(epoch) {
      if (!this._valid(epoch) || this.cached.status !== 'running') return;
      while (this.cached.index < this.cached.queue.length && ['complete', 'error'].includes(this.cached.queue[this.cached.index].status)) this.cached.index += 1;
      if (this.cached.index >= this.cached.queue.length) return this._complete(epoch);
      const item = this.cached.queue[this.cached.index];
      try {
        this.extractor.supportedPage(item.url);
        if (!await this._hasPermission(item.url)) throw new Error('Нет разрешения читать этот маркетплейс.');
        if (!this._valid(epoch)) return;
        item.status = 'loading'; item.attempts += 1; this.cached.phase = 'loading';
        if (item.kind === 'discovery') this._prepareDiscovery(item, true);
        this.cached.page_deadline_at = new Date(this.now() + this.cached.settings.pageTimeoutSeconds * 1000).toISOString();
        if (!await this._save(epoch)) return;
        const tab = await this.browser.tabs.create({url: item.url, active: false});
        if (tab?.id == null) throw new Error('Браузер не создал вкладку сбора.');
        this.owned.add(tab.id);
        if (!this._valid(epoch)) { await this._removeOwned(tab.id); return; }
        this.cached.activeTabId = tab.id;
        await this._schedule(Date.parse(this.cached.page_deadline_at)); await this._save(epoch);
        const current = await this.browser.tabs.get(tab.id).catch(() => null);
        if (this._valid(epoch) && current?.status === 'complete') await this._loaded(tab.id, current, epoch);
      } catch (error) { if (this._valid(epoch)) await this._fail('load_failed', errorText(error), epoch); }
    }
    async _loaded(id, tab, epoch) {
      if (!this._valid(epoch) || this.cached.status !== 'running' || this.cached.activeTabId !== id || this.cached.phase !== 'loading') return;
      const item = this.cached.queue[this.cached.index]; if (!item) return;
      try {
        if (this.extractor.supportedPage(tab?.url || item.url).url !== item.url) throw new Error('Страница перенаправлена на другой товар или адрес.');
      } catch {
        await this._block(item, 'unexpected_redirect_or_block', 'Страница перенаправлена на неподтверждённый адрес или проверку безопасности. Сбор остановлен.', epoch);
        return;
      }
      item.status = 'waiting'; this.cached.phase = 'settling';
      if (item.kind === 'discovery') {
        // Page loading has its own timeout. Scanning a category may deliberately
        // take longer, and both the deadline and the next pass survive MV3 sleep.
        const config = this.cached.settings;
        const wakeDelay = Math.max(30, config.categoryScrollPauseSeconds);
        this.cached.discovery_deadline_at = new Date(this.now() + (config.renderWaitSeconds + (config.categoryScrollRounds + 1) * (wakeDelay + 22) + 30) * 1000).toISOString();
      }
      await this._schedule(Math.min(this.now() + this.cached.settings.renderWaitSeconds * 1000, Date.parse(this.cached.page_deadline_at)));
      await this._save(epoch);
    }
    onTabUpdated(id, change, tab) {
      const epoch = this.epoch;
      return this.initialize().then(() => this._queue(async () => { if (this._valid(epoch) && change.status === 'complete') await this._loaded(id, tab, epoch); }));
    }
    onTabRemoved(id) {
      const epoch = this.epoch;
      return this.initialize().then(() => this._queue(async () => {
        this.owned.delete(id);
        if (this._valid(epoch) && this.cached.status === 'running' && this.cached.activeTabId === id) await this._fail('tab_closed', 'Вкладка сбора была закрыта до завершения.', epoch);
      }));
    }
    onAlarm(alarm) {
      const epoch = this.epoch;
      return this.initialize().then(() => this._queue(async () => {
        if (!this._valid(epoch) || alarm?.name !== ALARM_NAME || this.cached.status !== 'running') return;
        const at = Date.parse(this.cached.next_action_at || '');
        if (Number.isFinite(at) && this.now() < at) { await this._schedule(at); return; }
        if (this.cached.phase === 'delay' || this.cached.activeTabId == null) { await this._openNext(epoch); return; }
        const deadline = Date.parse(this.cached.page_deadline_at || '');
        if (this.cached.phase === 'loading') {
          const tab = await this.browser.tabs.get(this.cached.activeTabId).catch(() => null);
          if (tab?.status === 'complete') { await this._loaded(tab.id, tab, epoch); return; }
          if (!tab || this.now() >= deadline) { await this._fail('page_timeout', 'Страница не загрузилась за отведённое время.', epoch); return; }
          await this._schedule(deadline); return;
        }
        if (this.cached.phase === 'settling') {
          if (this.now() > deadline) { await this._fail('page_timeout', 'Страница не успела подготовить данные.', epoch); return; }
          await this._capture(this.cached.activeTabId, this.cached.queue[this.cached.index], epoch, false);
          return;
        }
        if (this.cached.phase === 'discovering') {
          if (this.now() > Date.parse(this.cached.discovery_deadline_at || '')) { await this._fail('discovery_timeout', 'Превышено время просмотра категории.', epoch); return; }
          await this._capture(this.cached.activeTabId, this.cached.queue[this.cached.index], epoch, false);
        }
      }));
    }
    async _runScript(id) {
      const run = async () => {
        await this.browser.scripting.executeScript({target: {tabId: id}, files: ['extractor.js']});
        const result = await this.browser.scripting.executeScript({target: {tabId: id}, func: () => globalThis.CenoskopExtractor.extract(document, location.href)});
        if (!result[0]?.result) throw new Error('Страница не вернула данные извлечения.');
        return result[0].result;
      };
      let timeout;
      try { return await Promise.race([run(), new Promise((_, reject) => { timeout = this.setTimer(() => reject(new Error('Истекло время чтения страницы.')), 10000); })]); }
      finally { if (timeout != null) this.clearTimer(timeout); }
    }
    _prepareDiscovery(item, resetPasses = false) {
      const previous = item.discovery || {};
      item.discovery = {...previous, root_url: previous.root_url || item.url, page_number: previous.page_number || 1, seen_urls: Array.isArray(previous.seen_urls) ? previous.seen_urls : [], found_count: Number(previous.found_count) || 0};
      if (resetPasses || !Number.isFinite(item.discovery.rounds)) Object.assign(item.discovery, {rounds: 0, scrolls: 0, stable_passes: 0, last_height: null, last_top: null, stop_reason: null, next_page_url: null});
      return item.discovery;
    }
    _discoveryGroup(item) {
      const rootUrl = item.discovery?.root_url || item.url;
      return this.cached.queue.filter(row => row.kind === 'discovery' && (row.discovery?.root_url || row.url) === rootUrl);
    }
    _harvestDiscovery(item, capture) {
      const discovery = this._prepareDiscovery(item);
      const group = this._discoveryGroup(item);
      const groupSeen = new Set(group.flatMap(row => row.discovery?.seen_urls || []));
      const known = new Set([...this.cached.queue.map(row => row.url), ...this.cached.queue.flatMap(row => row.discovery?.seen_urls || [])]);
      const ownSeen = new Set(discovery.seen_urls);
      let accepted = group.reduce((sum, row) => sum + (row.discovery?.found_count || 0), 0), fresh = 0;
      for (const link of (capture.links || []).slice(0, 200)) {
        try {
          const page = this.extractor.supportedPage(typeof link === 'string' ? link : link.url);
          if (page.mode === 'discovery' || ownSeen.has(page.url)) continue;
          ownSeen.add(page.url);
          if (groupSeen.has(page.url)) continue;
          groupSeen.add(page.url); fresh += 1;
          const withinCategory = accepted < this.cached.settings.categoryMaxProducts;
          if (withinCategory) { accepted += 1; discovery.found_count += 1; }
          if (known.has(page.url)) continue;
          known.add(page.url);
          if (!belongsToPartition(page.url, this.cached.partition || {index: 1, count: 1})) continue;
          this.cached.discovered_count = (this.cached.discovered_count || 0) + 1;
          if (withinCategory && this.cached.queue.length < this.cached.settings.maxPages) this.cached.queue.push({url: page.url, kind: 'product', status: 'pending', attempts: 0});
          else this.cached.truncated_count = (this.cached.truncated_count || 0) + 1;
        } catch { /* unrelated links are never opened */ }
      }
      discovery.seen_urls = [...ownSeen];
      discovery.rounds += 1;
      const viewport = capture.viewport || {};
      const height = Number(viewport.scroll_height), top = Number(viewport.scroll_y);
      const grew = Number.isFinite(height) && discovery.last_height != null && height > discovery.last_height + 1;
      discovery.stable_passes = viewport.at_bottom === true && fresh === 0 && !grew ? discovery.stable_passes + 1 : 0;
      if (Number.isFinite(height)) discovery.last_height = height;
      if (Number.isFinite(top)) discovery.last_top = top;
      const next = this._nextCategoryUrl(item.url, capture.next_page_url);
      if (next) discovery.next_page_url = next;
      return {discovery, accepted};
    }
    _nextCategoryUrl(current, candidate) {
      if (typeof candidate !== 'string') return null;
      try {
        const from = new URL(current), next = new URL(candidate);
        const currentPage = Number(from.searchParams.get('page') || 1), nextPage = Number(next.searchParams.get('page'));
        if (next.origin !== from.origin || next.pathname !== from.pathname || next.username || next.password || next.hash || [...next.searchParams.keys()].some(key => key !== 'page') || next.searchParams.getAll('page').length !== 1 || !Number.isInteger(nextPage) || nextPage !== currentPage + 1 || nextPage > 1000) return null;
        const normalized = this.extractor.supportedPage(next.href);
        return normalized.mode === 'discovery' && normalized.url !== current ? normalized.url : null;
      } catch { return null; }
    }
    async _scrollDiscovery(id, epoch) {
      if (!this._valid(epoch) || this.cached.status !== 'running' || this.cached.activeTabId !== id) return false;
      let timeout;
      try {
        const scrolling = this.browser.scripting.executeScript({target: {tabId: id}, func: function scrollCategoryViewport() {
          const viewport = window.innerHeight || document.documentElement.clientHeight || 800;
          window.scrollBy({top: Math.max(1, Math.round(viewport * 0.8)), left: 0, behavior: 'instant'});
          return true;
        }});
        await Promise.race([scrolling, new Promise((_, reject) => { timeout = this.setTimer(() => reject(new Error('Истекло время прокрутки категории.')), 10000); })]);
        return this._valid(epoch) && this.cached.status === 'running' && this.cached.activeTabId === id;
      } finally { if (timeout != null) this.clearTimer(timeout); }
    }
    async _continueDiscovery(id, item, capture, epoch) {
      const {discovery, accepted} = this._harvestDiscovery(item, capture), config = this.cached.settings;
      let reason = null;
      if (this.cached.queue.length >= config.maxPages) reason = 'queue_limit';
      else if (accepted >= config.categoryMaxProducts) reason = 'product_limit';
      else if (discovery.stable_passes >= 3) reason = 'no_growth';
      else if (discovery.scrolls >= config.categoryScrollRounds) reason = 'round_limit';
      if (reason) {
        discovery.stop_reason = reason;
        const next = this._nextCategoryUrl(item.url, discovery.next_page_url), group = this._discoveryGroup(item);
        if (next && !['queue_limit', 'product_limit'].includes(reason) && group.length < config.categoryMaxPages && !this.cached.queue.some(row => row.url === next) && this.cached.queue.length < config.maxPages) {
          this.cached.queue.splice(this.cached.index + 1, 0, {url: next, kind: 'discovery', status: 'pending', attempts: 0, discovery: {root_url: discovery.root_url, page_number: group.length + 1, seen_urls: [], found_count: 0}});
        }
        item.status = 'complete'; delete item.error;
        await this._afterPage(epoch); return;
      }
      this.cached.phase = 'discovering';
      // Commit links before moving the viewport: cards may disappear from the
      // DOM as a virtualized catalogue renders the next set.
      if (!await this._save(epoch) || !await this._scrollDiscovery(id, epoch)) return;
      discovery.scrolls += 1;
      await this._schedule(this.now() + config.categoryScrollPauseSeconds * 1000, epoch);
      await this._save(epoch);
    }
    async _capture(id, item, epoch, manual) {
      try {
        const tab = await this.browser.tabs.get(id);
        let matches = false;
        try { matches = this.extractor.supportedPage(tab.url).url === item.url; } catch { /* never follow challenge redirects */ }
        if (!matches) {
          if (manual) throw new Error('Открытая страница не соответствует заданию.');
          await this._block(item, 'unexpected_redirect_or_block', 'Страница перенаправлена на неподтверждённый адрес или проверку безопасности. Сбор остановлен.', epoch); return;
        }
        const capture = await this._runScript(id);
        if (!this._valid(epoch) || (!manual && (this.cached.status !== 'running' || this.cached.activeTabId !== id))) return;
        if (capture.blocked) {
          await this._block(item, 'captcha_or_challenge', 'Проверка безопасности: сбор остановлен без обхода и автоматических повторов.', epoch);
          return;
        }
        try { matches = this.extractor.supportedPage(capture.url || capture.page_url || tab.url).url === item.url; } catch { matches = false; }
        if (!matches) {
          if (manual) throw new Error('Извлечённые данные относятся к другому адресу.');
          await this._block(item, 'unexpected_redirect_or_block', 'Адрес страницы изменился во время чтения. Сбор остановлен.', epoch); return;
        }
        if (item.kind === 'discovery') {
          if (!manual) { await this._continueDiscovery(id, item, capture, epoch); return; }
          this._harvestDiscovery(item, capture);
        } else {
          if (typeof this.extractor.buildObservation !== 'function') throw new Error('Модуль экспорта не загружен. Перезагрузите расширение.');
          const row = this.extractor.buildObservation(capture, {requested_url: item.url});
          const previous = this.cached.results.findIndex(item => item.source?.url === row.source?.url);
          if (previous >= 0) this.cached.results[previous] = row;
          else if (this.cached.results.length < 200) this.cached.results.push(row);
        }
        if (!this._valid(epoch)) return;
        if (manual) { await this._save(epoch); return; }
        item.status = 'complete'; delete item.error; await this._afterPage(epoch);
      } catch (error) {
        if (!this._valid(epoch)) return;
        if (manual) throw error;
        await this._fail('extraction_failed', errorText(error), epoch);
      }
    }
    async _fail(code, message, epoch) {
      if (!this._valid(epoch)) return;
      const item = this.cached.queue[this.cached.index];
      if (item) { item.status = 'error'; item.error = code; }
      this.cached.errors.push({url: item?.url || null, code, message, occurred_at: new Date(this.now()).toISOString()});
      this.cached.errors = this.cached.errors.slice(-500); await this._afterPage(epoch);
    }
    async _block(item, code, message, epoch) {
      if (!this._valid(epoch)) return;
      this.cached.status = 'blocked'; this.cached.phase = null; this.cached.next_action_at = null;
      this.cached.errors.push({url: item.url, code, message, occurred_at: new Date(this.now()).toISOString()});
      const current = this.cached.queue[this.cached.index];
      if (current?.url === item.url) { current.status = 'error'; current.error = code; }
      await this._cancelWake();
      const ownId = this.cached.activeTabId; this.cached.activeTabId = null;
      if (ownId != null) await this._removeOwned(ownId);
      await this._save(epoch);
    }
    async _afterPage(epoch) {
      const id = this.cached.activeTabId; this.cached.activeTabId = null;
      if (id != null) await this._removeOwned(id);
      if (!this._valid(epoch)) return;
      this.cached.index += 1; delete this.cached.page_deadline_at; delete this.cached.discovery_deadline_at;
      if (this.cached.index >= this.cached.queue.length) { await this._complete(epoch); return; }
      this.cached.phase = 'delay';
      await this._schedule(this.now() + this.cached.settings.delaySeconds * 1000); await this._save(epoch);
    }
    async _complete(epoch) {
      if (!this._valid(epoch) || this.cached.status !== 'running') return;
      await this._cancelWake();
      if (!this._valid(epoch) || this.cached.status !== 'running') return;
      this.cached.status = 'completed'; this.cached.phase = null; this.cached.next_action_at = null; this.cached.activeTabId = null;
      if (!await this._save(epoch) || !this._valid(epoch) || this.cached.status !== 'completed') return;
      if (this.cached.settings.autoExport && this.cached.auto_export_attempted_run_id !== this.cached.run_id) await this._export(false, true, epoch);
    }
    _makeExport() {
      if (!this.cached.run_id && !this.cached.results.length) throw new Error('Пока нет результатов для выгрузки.');
      const iso = new Date(this.now()).toISOString();
      const part = this.cached.partition || {index: 1, count: 1};
      const suffix = part.count > 1 ? `-part${part.index}of${part.count}` : '';
      const filename = `cenoskop-${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}${suffix}.json`;
      const state = this._snapshot();
      const content = {schema_version: 'cenoskop.browser-export.v1', job: {run_id: state.run_id, status: state.status, partial: state.status !== 'completed', started_at: state.started_at, updated_at: state.updated_at, exported_at: iso, settings: state.settings, queue: state.queue.map(row => ({url: row.url, kind: row.kind, status: row.status, attempts: row.attempts, ...(row.discovery ? {discovery: {rounds: row.discovery.rounds || 0, scrolls: row.discovery.scrolls || 0, found_count: row.discovery.found_count || 0, page_number: row.discovery.page_number || 1, stop_reason: row.discovery.stop_reason || null}} : {})})), processed_pages: state.queue.filter(row => ['complete', 'error'].includes(row.status)).length, discovered_count: state.discovered_count || 0, truncated_count: state.truncated_count || 0}, observations: state.results, errors: state.errors};
      return {iso, filename, state, json: JSON.stringify(content, null, 2)};
    }
    async _export(saveAs, automatic, epoch) {
      if (!this._valid(epoch) || (automatic && this.cached.status !== 'completed')) return {cancelled: true};
      const {iso, filename, state, json} = this._makeExport();
      if (automatic) {
        // At most one automatic attempt per run across worker restarts. Manual
        // JSON export remains available if a browser stops during this attempt.
        this.cached.auto_export_attempted_run_id = this.cached.run_id;
        this.cached.last_export = {filename, exported_at: iso};
        if (!await this._save(epoch)) return {cancelled: true};
      }
      if (!this._valid(epoch) || (automatic && this.cached.status !== 'completed')) return {cancelled: true};
      try {
        const id = await this.browser.downloads.download({url: `data:application/json;charset=utf-8,${encodeURIComponent(json)}`, filename, saveAs});
        if (this._valid(epoch)) { this.cached.last_export = {download_id: id, exported_at: iso, filename}; await this._save(epoch); }
        return {download_id: id, filename, observation_count: state.results.length, state_snapshot: {status: state.status, partial: state.status !== 'completed', updated_at: state.updated_at}};
      } catch (error) {
        if (this._valid(epoch)) { this.cached.last_export = {exported_at: iso, filename, error: errorText(error)}; await this._save(epoch); }
        if (!automatic) throw error;
        return {error: errorText(error), filename, observation_count: state.results.length};
      }
    }
    onBrowserStartup() {
      // A browser restart can reuse tab IDs. Never close a tab solely using the
      // prior session's saved ID; the user explicitly resumes the paused run.
      const epoch = this._interrupt(false);
      return this.initialize().then(() => this._queue(async () => {
        await this._cancelWake(); this.owned.clear();
        if (this.cached.status === 'running') this.cached.status = 'paused';
        const item = this.cached.queue[this.cached.index];
        if (item && ['loading', 'waiting'].includes(item.status)) item.status = 'pending';
        this.cached.activeTabId = null; this.cached.phase = null; this.cached.next_action_at = null; delete this.cached.page_deadline_at; delete this.cached.discovery_deadline_at;
        await this._save(epoch); return this._snapshot();
      }));
    }
    onInstalled() {
      const epoch = this._interrupt();
      return this.initialize().then(() => this._queue(async () => {
        await this._cleanLegacy(); await this._cancelWake(); await this._resetInFlight();
        if (this.cached.status === 'running') this.cached.status = 'paused';
        this.cached.next_action_at = null; this.cached.phase = null;
        await this._save(epoch); return this._snapshot();
      }));
    }
  }
  root.CenoskopCollectorEngine = CollectorEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = {CollectorEngine, STATE_KEY, ALARM_NAME, DEFAULTS};
})(typeof globalThis === 'undefined' ? self : globalThis);
