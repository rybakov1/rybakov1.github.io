'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const dashboardUrl = 'chrome-extension://test-id/popup.html';
const event = () => ({addListener(fn) { this.listener = fn; }});
function harness(contexts = []) {
  const calls = {created: [], updated: [], focused: [], dispatched: [], filters: []};
  const chrome = {
    runtime: {id: 'test-id', getURL: name => `chrome-extension://test-id/${name}`,
      getContexts: async filter => { calls.filters.push(filter); return contexts; },
      onMessage: event(), onStartup: event(), onInstalled: event()},
    action: {onClicked: event()}, alarms: {onAlarm: event()},
    tabs: {onUpdated: event(), onRemoved: event(),
      create: async options => { calls.created.push(options); return {id: 12, windowId: 8}; },
      update: async (id, options) => { calls.updated.push({id, options}); return {id, windowId: 8}; }},
    windows: {update: async (id, options) => { calls.focused.push({id, options}); }},
  };
  class Engine {
    async initialize() {}
    async dispatch(message) { calls.dispatched.push(message); return {status: 'idle'}; }
  }
  vm.runInNewContext(fs.readFileSync(`${__dirname}/background.js`, 'utf8'), {
    chrome, importScripts() {}, CenoskopCollectorEngine: Engine, CenoskopExtractor: {},
  });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return {chrome, calls, flush};
}
test('toolbar opens a full tab once for concurrent clicks', async () => {
  const {chrome, calls, flush} = harness();
  chrome.action.onClicked.listener(); chrome.action.onClicked.listener(); await flush();
  assert.equal(calls.created.length, 1);
  assert.equal(calls.created[0].url, dashboardUrl);
  assert.equal(calls.created[0].active, true);
  assert.equal(calls.filters[0].documentUrls[0], dashboardUrl);
});
test('toolbar reuses the own dashboard even after a service worker restart', async () => {
  const {chrome, calls, flush} = harness([{tabId: 41, frameId: 0}]);
  chrome.action.onClicked.listener(); await flush();
  assert.equal(calls.created.length, 0);
  assert.equal(calls.updated[0].id, 41);
  assert.equal(calls.updated[0].options.active, true);
  assert.equal(calls.focused[0].id, 8);
});
test('closed dashboard races open a replacement; unrelated contexts are ignored', async () => {
  const {chrome, calls, flush} = harness([{tabId: 41, frameId: 0}, {tabId: 42, frameId: 3}]);
  chrome.tabs.update = async () => { throw Error('closed'); };
  chrome.action.onClicked.listener(); await flush();
  assert.equal(calls.created.length, 1);
});
test('only the own top-level dashboard can issue collector commands', async () => {
  const {chrome, calls, flush} = harness();
  let reply;
  assert.equal(chrome.runtime.onMessage.listener({type: 'AUTO_GET_STATE'}, {
    id: 'test-id', url: dashboardUrl, tab: {id: 41}, frameId: 0,
  }, value => { reply = value; }), true);
  await flush(); assert.equal(reply.ok, true); assert.equal(calls.dispatched.length, 1);
  for (const sender of [
    {id: 'other-id', url: dashboardUrl},
    {id: 'test-id', url: 'https://www.ozon.ru/product/123/', tab: {id: 42}},
    {id: 'test-id', url: dashboardUrl, frameId: 2},
    {id: 'test-id'},
  ]) {
    assert.equal(chrome.runtime.onMessage.listener({type: 'AUTO_STOP'}, sender, value => { reply = value; }), false);
    assert.equal(reply.ok, false);
  }
  assert.equal(calls.dispatched.length, 1);
});
