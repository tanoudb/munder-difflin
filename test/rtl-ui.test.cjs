'use strict';

// Right-to-left layout, from the UI half of PR #213.
//
// Open Space ships French and English only, so the Arabic locale that PR added
// is gone, but the RTL machinery it built stays in the code: registering an
// RTL language in LANGUAGES is still all it takes to turn it back on. It stays
// under the ONE condition it landed under: NOTHING CHANGES FOR A USER WHO HAS
// NOT SELECTED AN RTL LANGUAGE. Not layout, not direction, not fonts, not
// spacing. These tests are that condition.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** Source with comments removed, for assertions about what the CODE does. */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// --- the gate: inert for everyone who did not pick an RTL language ----------

test('direction is decided by the SELECTED language and nothing else', () => {
  const src = read('src/renderer/src/i18n/useDirection.ts');
  // Comments stripped throughout this file: these modules explain at length what
  // they refuse to read, and naming an API must not read as calling it.
  const code = strip(src);
  // Not the OS, not the browser, not the content on screen. Each of these would
  // mirror the UI of a user who never asked for it.
  for (const sniff of ['navigator', 'matchMedia', 'textContent']) {
    assert.ok(!code.includes(sniff), `useDirection reads ${sniff} — that is not a user choice`);
  }
  assert.match(code, /isRtlLanguage\(i18n\.language\)/);
});

test('an unregistered language code is left-to-right, never guessed at', () => {
  const src = read('src/renderer/src/i18n/index.ts');
  // Exact set membership. A prefix match ('ar-EG'.startsWith('ar')) or a script
  // guess would let an unknown value mirror somebody's UI, and LTR is the
  // direction every existing user already has.
  assert.match(src, /RTL_CODES\.has\(lng\)/,
    'isRtlLanguage must be exact-match on a registered code');
  assert.match(src, /LANGUAGES\.filter\(\(l: Language\) => l\.dir === 'rtl'\)/,
    'the RTL set must be derived from LANGUAGES, not maintained separately');
});

test('every RTL CSS rule is scoped to [dir="rtl"], so LTR sees no change at all', () => {
  const css = read('src/renderer/src/design/global.css');
  const marker = css.indexOf('─── RTL app language');
  assert.ok(marker > 0, 'the RTL section vanished');
  // Start at the comment's OPENING delimiter, or strip() sees a dangling `*/`
  // and eats the wrong span.
  const start = css.lastIndexOf('/*', marker);
  const next = css.indexOf('/* ───', marker + 20);
  // Comments stripped first: this section explains WHY each rule exists, in
  // prose that otherwise reads like a selector list.
  const body = strip(next > 0 ? css.slice(start, next) : css.slice(start));
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const selectors = lines.filter((l) => /^[.[#a-z]/.test(l) && (l.includes('{') || l.endsWith(',')));
  assert.ok(selectors.length >= 5, `expected the RTL rules, found ${selectors.length}`);
  for (const sel of selectors) {
    assert.ok(sel.includes('[dir="rtl"]'),
      `an unscoped rule in the RTL section changes layout for everyone: ${sel.trim()}`);
  }
});

test('the terminal grid is pinned LTR under an RTL page', () => {
  // `direction` inherits. Without this the xterm viewport picks up rtl from
  // <html>, right-aligns the whole cell grid, and reverses every box-drawing
  // frame — while the pty still addresses columns from the left. Per-row
  // direction is a different layer (.cth-bidi) and is not affected.
  const css = strip(read('src/renderer/src/design/global.css'));
  // Every part of the grid, checked one at a time. A single regex over the whole
  // rule passes while three of the four selectors are missing — the root alone
  // does cover the rows by inheritance, but the viewport carries the scrollbar
  // and the measure container decides cell width, and a partial removal here
  // must not read as green.
  const rule = css.slice(css.indexOf('[dir="rtl"] .xterm'));
  const decl = rule.slice(0, rule.indexOf('}') + 1);
  assert.match(decl, /direction: ltr;/, 'the xterm pin lost its declaration');
  for (const sel of ['.xterm', '.xterm-viewport', '.xterm-screen', '.xterm-rows',
                     '.xterm-width-cache-measure-container']) {
    // Anchored on the selector's END. `.xterm` is a prefix of every other name
    // here, so a plain substring test reports the root as pinned when only
    // `.xterm-viewport` survives.
    const re = new RegExp(`\\[dir="rtl"\\] \\${sel}(?=\\s*[,{])`);
    assert.match(decl, re,
      `${sel} is not pinned to ltr, so an RTL app language mirrors part of the terminal`);
  }
});

test('content direction in components is gated, never content-sniffed', () => {
  // `dir="auto"` resolves from the first strong character, so ungated it flips
  // a block of an ENGLISH user's UI the moment an agent writes a line of
  // Arabic into it. Every site has to be behind the language gate.
  const files = [
    'components/AddAgentModal', 'components/AgentStrip', 'components/AskMeTab',
    'components/CommandCenterPanel', 'components/FullscreenTerminal',
    'components/MemoryPanel', 'components/MessageQueueComposer',
    'components/TasksKanban', 'components/ThreadsPanel',
    'components/triggers/ContextSection', 'components/triggers/SchedulesSection',
    'components/triggers/TriggerHistoryTab'
  ];
  let gated = 0;
  for (const f of files) {
    const src = read(`src/renderer/src/${f}.tsx`);
    const bare = src.match(/dir="auto"/g) ?? [];
    assert.equal(bare.length, 0,
      `${f} has an UNGATED dir="auto" — it fires for an English user`);
    const g = src.match(/dir=\{rtl \? 'auto' : undefined\}/g) ?? [];
    if (g.length) {
      assert.match(src, /const rtl = useRtl\(\);/, `${f} uses rtl without reading it`);
      assert.match(src, /from '@\/i18n\/useDirection'/, `${f} never imports the gate`);
    }
    gated += g.length;
  }
  assert.ok(gated >= 17, `expected the PR's dir sites to be carried over, found ${gated}`);
});

test('the markdown auto-direction plugin only runs for an RTL language', () => {
  // The one piece Kevin held explicitly, because it is content-driven by design:
  // an English user reading a document that happens to contain Arabic would
  // have had blocks of it mirrored.
  const src = read('src/renderer/src/markdown/MarkdownPreview.tsx');
  assert.match(src, /rehypePlugins=\{rtl \? AUTO_DIR_PLUGINS : NO_PLUGINS\}/,
    'rehypeAutoDir is not behind the language gate');
  assert.match(src, /const rtl = useRtl\(\);/);
  // And the security invariant it sits next to is unchanged.
  assert.ok(!src.includes('rehypeRaw'), 'rehype-raw must never be added here');
});

test('no unbundled webfont rides in with the Arabic locale', () => {
  // PR #213 added IBM Plex Sans Arabic to every token stack and re-added the
  // Google Fonts <link> that 41ea4c37 deliberately removed — a network fetch on
  // boot, blocked in mainland China, and an ungated font change for every user.
  // The bundled stacks already name system Arabic faces, so nothing is needed.
  const tokens = read('src/renderer/src/design/tokens.css');
  const html = read('src/renderer/index.html');
  assert.ok(!tokens.includes('IBM Plex Sans Arabic'),
    'an unbundled font in a token stack changes type for every user');
  assert.doesNotMatch(html, /<link[^>]*fonts\.googleapis\.com/,
    'the Google Fonts link is back — the app must render its own type offline');
  assert.match(html, /font-src 'self'/,
    'the CSP no longer pins fonts to the bundle');
  for (const face of ['Geeza Pro', 'Noto Naskh Arabic']) {
    assert.ok(tokens.includes(face), `${face} fallback is missing from the token stacks`);
  }
});
