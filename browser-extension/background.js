'use strict';
importScripts('extractor.js', 'collector-engine.js');
const autoCollector = new globalThis.CenoskopCollectorEngine(chrome, globalThis.CenoskopExtractor);
const dashboardUrl = chrome.runtime.getURL('popup.html');
let dashboardOpening = null;
function openDashboard() {
  // getContexts only inspects our own pages; no access to browser history/tabs is requested.
  if (dashboardOpening) return dashboardOpening;
  dashboardOpening = (async () => {
    const contexts = await chrome.runtime.getContexts({contextTypes: ['TAB'], documentUrls: [dashboardUrl]});
    for (const context of contexts) {
      if (context.tabId < 0 || context.frameId !== 0) continue;
      const tab = await chrome.tabs.update(context.tabId, {active: true}).catch(() => null);
      if (!tab) continue; // A dashboard may have closed since the context lookup.
      await chrome.windows.update(tab.windowId, {focused: true}).catch(() => {});
      return;
    }
    await chrome.tabs.create({url: dashboardUrl, active: true});
  })().finally(() => { dashboardOpening = null; });
  return dashboardOpening;
}
chrome.action.onClicked.addListener(() => { openDashboard().catch(() => {}); });
autoCollector.initialize().catch(() => {});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || sender.url !== dashboardUrl || (sender.frameId != null && sender.frameId !== 0)) {
    sendResponse({ok: false, error: 'Команды доступны только из вкладки расширения.'});
    return false;
  }
  autoCollector.dispatch(message).then(data => sendResponse({ok: true, data})).catch(error => sendResponse({ok: false, error: error instanceof Error ? error.message : 'Не удалось выполнить команду.'}));
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => { autoCollector.onAlarm(alarm).catch(() => {}); });
chrome.tabs.onUpdated.addListener((id, change, tab) => { autoCollector.onTabUpdated(id, change, tab).catch(() => {}); });
chrome.tabs.onRemoved.addListener(id => { autoCollector.onTabRemoved(id).catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { autoCollector.onBrowserStartup().catch(() => {}); });
chrome.runtime.onInstalled.addListener(() => { autoCollector.onInstalled().catch(() => {}); });
