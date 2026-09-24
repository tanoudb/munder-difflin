'use strict';

// The French locale. Open Space is French first: French is the default
// language, English is the second one and the fallback for a missing key, and
// the OS locale is never read.
//
// These tests hold coverage and shape — every key present, every placeholder,
// tag and array intact — so a missing or broken string cannot slip in. They do
// not, and cannot, judge whether the French reads well.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const locale = (code) =>
  JSON.parse(read(`src/renderer/src/i18n/locales/${code}.json`));

/** Every leaf path in a locale tree, arrays included by index. */
function leaves(node, prefix = '') {
  if (Array.isArray(node)) return node.flatMap((v, i) => leaves(v, `${prefix}.${i}`));
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
  }
  return [[prefix, node]];
}
const pathsOf = (o) => new Map(leaves(o));
const text = (v) => (Array.isArray(v) ? v.join(' ') : String(v));

const en = locale('en');
const fr = locale('fr');

test('fr is registered everywhere a language has to be registered', () => {
  const src = read('src/renderer/src/i18n/index.ts');
  assert.match(src, /import fr from '\.\/locales\/fr\.json';/, 'fr.json is never imported');
  assert.match(src, /fr: \{ translation: fr \}/, 'fr is missing from resources');
  assert.match(src, /supportedLngs: \[[^\]]*'fr'[^\]]*\]/, 'fr is missing from supportedLngs');
  assert.match(src, /code: 'fr'[^}]*dir: 'ltr'/, 'fr is not in LANGUAGES as left-to-right');
});

test('French is the default, English the fallback, and the OS locale is never read', () => {
  const src = read('src/renderer/src/i18n/index.ts');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.match(code, /return 'fr';/, 'with nothing saved the app must start in French');
  assert.match(code, /fallbackLng: 'en'/, 'a missing French key must fall back to English');
  assert.ok(!code.includes('navigator'), 'the default language must never come from the OS');
});

test('the picker offers French first, then English, and nothing else', () => {
  const src = read('src/renderer/src/i18n/index.ts');
  const list = src.slice(src.indexOf('export const LANGUAGES'), src.indexOf('] as const'));
  const codes = [...list.matchAll(/code: '([\w-]+)'/g)].map((m) => m[1]);
  assert.deepEqual(codes, ['fr', 'en']);
  assert.match(src, /supportedLngs: \['fr', 'en'\]/);
});

test('fr has exactly the same key tree as en', () => {
  const e = pathsOf(en), f = pathsOf(fr);
  const missing = [...e.keys()].filter((k) => !f.has(k));
  const extra = [...f.keys()].filter((k) => !e.has(k));
  assert.deepEqual(missing, [], 'fr is missing keys — they would silently fall back to English');
  assert.deepEqual(extra, [], 'fr has keys en does not — dead strings');
});

test('no French string is left as its English source', () => {
  // A copied English string is worse than a missing one: a missing key falls
  // back to English deliberately, a copied one looks translated and is not.
  // Strings that are IDENTICAL ON PURPOSE: the French word is spelled the same,
  // or it is a product name or a term French developers use as is.
  const SAME_ON_PURPOSE = new Set([
    // Same word in French.
    'sidebar.terminal', 'sidebar.messages', 'sidebar.traces',
    'settings.general.notifications', 'settings.general.maintenance',
    'settings.connections.port', 'settings.connections.secret',
    'settings.connections.mode', 'settings.connections.organisation',
    'settings.voice.1m', 'settings.voice.2m', 'settings.voice.3m',
    'settings.voice.5m', 'settings.voice.10m',
    'commandCenter.deliveryAuto', 'commandCenter.tabs.terminal',
    'commandCenter.agents', 'commandCenter.budget', 'addAgent.description',
    'triggersTab.organisation', 'webhooksSection.secret',
    'triggerHistory.kindDirective', 'triggerHistory.kindCommunication',
    'gitTab.sectionBranches', 'idePanel.code',
    // Product and feature names.
    'settings.connections.slack', 'settings.voice.freeFlow',
    'onboarding.providerBlurb.claude', 'onboarding.providerBlurb.codex',
    'onboarding.providerBlurb.antigravity', 'onboarding.providerBlurb.gemini',
    // Technical terms kept as is.
    'triggersTab.webhooks', 'triggerHistory.sectionWebhooks',
    'schedulesSection.prompt', 'idePanel.diff'
  ]);
  const e = pathsOf(en), f = pathsOf(fr);
  const untranslated = [];
  for (const [k, v] of e) {
    if (typeof v !== 'string') continue;
    // Placeholder names are English by design; only the words around them count.
    if (!/[A-Za-z]{4}/.test(v.replace(/\{\{[^}]*\}\}/g, ''))) continue;
    if (f.get(k) === v && !SAME_ON_PURPOSE.has(k)) untranslated.push(k);
  }
  assert.deepEqual(untranslated, [], `${untranslated.length} French strings are still English`);
  // The allowlist must not rot into a way of hiding real gaps.
  const stale = [...SAME_ON_PURPOSE].filter((k) => f.get(k) !== e.get(k));
  assert.deepEqual(stale, [], 'allowlisted keys that ARE translated — drop them from the list');
});

test('every interpolation variable survives translation', () => {
  // `{{godName}}` mistyped is a literal "{{godname}}" on screen, and i18next
  // will not warn.
  const e = pathsOf(en), f = pathsOf(fr);
  const vars = (s) => [...String(s).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort().join(',');
  const bad = [];
  for (const [k, v] of e) {
    if (vars(v) !== vars(f.get(k))) bad.push(`${k}: [${vars(v)}] -> [${vars(f.get(k))}]`);
  }
  assert.deepEqual(bad, []);
});

test('inline markup and array shapes are preserved', () => {
  const e = pathsOf(en), f = pathsOf(fr);
  const tags = (s) => [...String(s).matchAll(/<\/?([a-z]+)>/g)].map((m) => m[1]).sort().join(',');
  for (const [k, v] of e) {
    assert.equal(tags(f.get(k)), tags(v), `markup changed in ${k}`);
  }
  const at = (o, p) => p.split('.').reduce((n, s) => n?.[s], o);
  for (const p of ['office.errand.smoke', 'office.suckUp', 'office.gossip', 'office.cheer']) {
    assert.equal(at(fr, p).length, at(en, p).length, `${p} changed length`);
  }
});

test('fr never hardcodes the orchestrator name', () => {
  // The user can rename the orchestrator; a literal "Michael" would undo that.
  const bad = [...pathsOf(fr)].filter(([, v]) => /Michael/i.test(text(v))).map(([k]) => k);
  assert.deepEqual(bad, [], `fr.json hardcodes Michael in: ${bad.join(', ')}`);
});

test('strings about ONE agent interpolate {{name}}, not the orchestrator', () => {
  // "This restarts Michael" on a dialog that restarts Kevin names the wrong
  // target of a destructive action.
  const f = pathsOf(fr);
  for (const k of ['commandCenter.runsTheFloor', 'commandCenter.noTerminal',
                   'commandCenter.confirmRestartEngine', 'commandCenter.restartContinueTitle']) {
    assert.match(text(f.get(k)), /\{\{name\}\}/, `${k} must interpolate {{name}}`);
    assert.doesNotMatch(text(f.get(k)), /\{\{godName\}\}/, `${k} is per-agent, not god`);
  }
});

test('the terminal setting still explains its performance cost, in every locale', () => {
  for (const [code, l] of [['en', en], ['fr', fr]]) {
    const g = l.settings.general;
    assert.ok(g.arabicTerminalDesc.length > 80, `${code}: too short to explain the tradeoff`);
    assert.match(g.arabicTerminalDesc, /GPU/, `${code} no longer names the GPU renderer`);
    assert.ok(g.arabicTerminalFollowsLanguage, `${code} never says the value follows the language`);
  }
});
