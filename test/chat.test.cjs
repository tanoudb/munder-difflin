'use strict';

/**
 * The Chat tab reads an agent's Claude Code transcript and shows it as a
 * conversation: what the person wrote, what the agent answered, one line per
 * tool call. Everything else in the transcript (thinking, tool results, hook
 * attachments, harness notifications, meta records) must stay out of it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { parseTranscriptLines, summarizeToolUse } = loadTs('src/shared/chat.ts');
const { inboxNudgeText } = loadTs('src/shared/hiveNudge.ts');
const { readChatItems } = loadTs('src/main/chat.ts');

let n = 0;
const rec = (type, content, extra = {}) =>
  JSON.stringify({ type, uuid: `u${++n}`, timestamp: '2026-09-24T10:00:00Z', message: { role: type, content }, ...extra });

test('what the person wrote and what the agent answered become bubbles', () => {
  const items = parseTranscriptLines([
    rec('user', 'Refais la page d’accueil'),
    rec('assistant', [{ type: 'thinking', thinking: 'plan' }, { type: 'text', text: 'Je m’en occupe.' }])
  ]);
  assert.deepEqual(items.map((i) => [i.role, i.text]), [
    ['user', 'Refais la page d’accueil'],
    ['assistant', 'Je m’en occupe.']
  ]);
});

test('machinery never reaches the chat', () => {
  const items = parseTranscriptLines([
    rec('user', 'Stop hook feedback: commit', { isMeta: true }),
    rec('user', '<task-notification>\n<task-type>x</task-type>'),
    rec('user', '<system-reminder>be nice</system-reminder>'),
    rec('user', '<local-command-stdout>ok</local-command-stdout>'),
    rec('user', [{ type: 'tool_result', tool_use_id: 't1', content: 'output' }]),
    rec('assistant', [{ type: 'text', text: 'side' }], { isSidechain: true }),
    JSON.stringify({ type: 'attachment', uuid: 'a1' }),
    JSON.stringify({ type: 'queue-operation', uuid: 'q1' }),
    '{not json',
    ''
  ]);
  assert.deepEqual(items, []);
});

test('interruptions, slash commands, inbox nudges and compactions are system lines', () => {
  const items = parseTranscriptLines([
    rec('user', [{ type: 'text', text: '[Request interrupted by user]' }]),
    rec('user', '<command-name>/compact</command-name>\n<command-args></command-args>'),
    rec('user', inboxNudgeText(['m-1'])),
    JSON.stringify({ type: 'system', subtype: 'compact_boundary', uuid: 'c1' })
  ]);
  assert.deepEqual(items.map((i) => [i.role, i.event, i.text]), [
    ['system', 'interrupted', ''],
    ['system', 'command', '/compact'],
    ['system', 'inbox', ''],
    ['system', 'compacted', '']
  ]);
});

test('each tool call is one line that says what it did', () => {
  assert.equal(summarizeToolUse('Bash', { command: 'npm test', description: 'Run the tests' }), 'Bash — Run the tests');
  assert.equal(summarizeToolUse('Bash', { command: 'npm  test\n --watch' }), 'Bash — npm test --watch');
  assert.equal(summarizeToolUse('Read', { file_path: '/repo/a.ts' }), 'Read — /repo/a.ts');
  assert.equal(summarizeToolUse('TodoWrite', {}), 'TodoWrite');
  assert.ok(summarizeToolUse('Bash', { command: 'x'.repeat(500) }).length <= 140, 'long commands are clipped');

  const items = parseTranscriptLines([rec('assistant', [{ type: 'tool_use', name: 'Edit', input: { file_path: 'src/app.ts' } }])]);
  assert.deepEqual(items.map((i) => [i.role, i.tool, i.text]), [['tool', 'Edit', 'Edit — src/app.ts']]);
});

test('an answer streamed as several records reads as one bubble', () => {
  const items = parseTranscriptLines([
    rec('assistant', [{ type: 'text', text: 'Première partie.' }]),
    rec('assistant', [{ type: 'text', text: 'Suite.' }]),
    rec('assistant', [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }]),
    rec('assistant', [{ type: 'text', text: 'Après l’outil.' }])
  ]);
  assert.deepEqual(items.map((i) => [i.role, i.text]), [
    ['assistant', 'Première partie.\n\nSuite.'],
    ['tool', 'Bash — ls'],
    ['assistant', 'Après l’outil.']
  ]);
});

test('only the most recent items are kept, oldest first', () => {
  const lines = Array.from({ length: 10 }, (_, i) => rec('user', `message ${i}`));
  const items = parseTranscriptLines(lines, 3);
  assert.deepEqual(items.map((i) => i.text), ['message 7', 'message 8', 'message 9']);
});

test('ids are stable across polls, so the list does not re-render from scratch', () => {
  const lines = [rec('user', 'bonjour'), rec('assistant', [{ type: 'text', text: 'salut' }])];
  assert.deepEqual(parseTranscriptLines(lines).map((i) => i.id), parseTranscriptLines(lines).map((i) => i.id));
});

test('a long transcript is read from its tail, starting on a whole line', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-chat-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 's.jsonl');
  // ~5 MB of old conversation, then the recent messages the tab must show.
  const filler = rec('assistant', [{ type: 'text', text: 'é'.repeat(1000) }]);
  const old = Array.from({ length: 2600 }, () => filler).join('\n');
  fs.writeFileSync(file, `${old}\n${rec('user', 'dernier message')}\n${rec('assistant', [{ type: 'text', text: 'dernière réponse' }])}\n`);
  assert.ok(fs.statSync(file).size > 4 * 1024 * 1024, 'the fixture must be larger than the tail window');

  const items = readChatItems(file);
  assert.ok(items && items.length > 0);
  assert.deepEqual(items.slice(-2).map((i) => i.text), ['dernier message', 'dernière réponse']);
  assert.equal(readChatItems(file), items, 'an unchanged file is served from the cache');
  assert.equal(readChatItems(path.join(dir, 'missing.jsonl')), null);
});
