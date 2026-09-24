'use strict';

// Shareable hires arrive as openspace://hire?src=<https-url>. The scheme is the
// one electron-builder.yml registers and main/index.ts claims at startup; a
// link carrying any other scheme is not ours and must never reach the fetcher.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { parseHireDeepLink } = loadTs('src/shared/hire.ts');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const SRC = 'https://example.com/hires/janitor.json';

test('both openspace:// forms resolve to the manifest URL', () => {
  assert.equal(parseHireDeepLink(`openspace://hire?src=${encodeURIComponent(SRC)}`), SRC);
  assert.equal(parseHireDeepLink(`openspace:hire?src=${encodeURIComponent(SRC)}`), SRC);
});

test('the old munderdifflin:// scheme is not ours any more', () => {
  assert.equal(parseHireDeepLink(`munderdifflin://hire?src=${encodeURIComponent(SRC)}`), null);
});

test('a remote http manifest is still refused', () => {
  assert.equal(parseHireDeepLink(`openspace://hire?src=${encodeURIComponent('http://example.com/x.json')}`), null);
});

test('the scheme the app registers is the one it parses', () => {
  assert.match(read('electron-builder.yml'), /schemes:\n\s+- openspace\n/);
  const main = read('src/main/index.ts');
  assert.match(main, /setAsDefaultProtocolClient\('openspace'\)/);
  assert.ok(!main.includes('munderdifflin'), 'main still claims the old scheme somewhere');
});
