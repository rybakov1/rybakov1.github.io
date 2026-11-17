'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

test('offline package only requests collection, scheduling and local JSON permissions', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '0.6.0');
  assert.equal(manifest.action.default_popup, undefined, 'toolbar opens a full tab');
  assert.ok(Number(manifest.minimum_chrome_version) >= 120);
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'alarms', 'clipboardWrite', 'downloads', 'scripting', 'storage'].sort());
  assert.deepEqual([...manifest.optional_host_permissions].sort(), [
    'https://www.ozon.ru/*', 'https://ozon.ru/*',
    'https://www.wildberries.ru/*', 'https://wildberries.ru/*',
  ].sort());
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.externally_connectable, undefined);
  assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self'; object-src 'none'; base-uri 'none'");
});

test('runtime has no HTTP client, API endpoint or HTML injection sink', () => {
  for (const name of ['background.js', 'collector-engine.js', 'extractor.js', 'popup.js']) {
    const code = read(name);
    assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|\/api\//, name);
    assert.doesNotMatch(code, /\.innerHTML\s*=|insertAdjacentHTML\s*\(|\beval\s*\(/, name);
  }
  const popup = read('popup.html');
  assert.doesNotMatch(popup, /id=["'](?:apiOrigin|token|productId|identityConfirmed)["']/);
  assert.doesNotMatch(popup, /type=["']password["']/);
});

test('popup and manifest reference only bundled assets and every bound ID exists', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const html = read('popup.html');
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    assert.doesNotMatch(match[1], /^(?:https?:|data:|javascript:|\/\/)/);
    assert.ok(fs.existsSync(path.join(__dirname, match[1])), match[1]);
  }
  assert.ok(fs.existsSync(path.join(__dirname, manifest.background.service_worker)));
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate element ID');
  for (const match of read('popup.js').matchAll(/\$\(['"]([^'"]+)['"]\)/g)) assert.ok(ids.includes(match[1]), `missing #${match[1]}`);
});
