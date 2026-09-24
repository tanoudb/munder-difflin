'use strict';

/**
 * The company around the agents: the human is the chief executive (the PDG by
 * default), the orchestrator is the director, a deputy director leads one team,
 * everyone else is an employee. Every agent must be told who the human is and
 * where it sits, in the system prompt it is spawned with, and the director and
 * the deputies must see who is in which team on the live roster.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

// hooks.ts pulls Notification from electron; seed the cache with what it touches.
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const company = loadTs('src/shared/company.ts');
const { HiveManager } = loadTs('src/main/hive.ts');
const { HookServer } = loadTs('src/main/hooks.ts');

const COMPANY = { ceoName: 'Alex', ceoTitle: 'PDG', titles: { deputy: 'Chef d’équipe' } };

/** The system prompt a Claude agent is spawned with. */
function promptOf(injection) {
  const i = injection.args.indexOf('--append-system-prompt');
  assert.ok(i >= 0, 'no --append-system-prompt on a Claude spawn');
  return injection.args[i + 1];
}

async function office(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-company-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  const spawn = (meta) => hive.ensureAgent({ provider: 'claude', cwd: home, ...meta }, { company: COMPANY });
  const god = await spawn({ id: 'god-1', name: 'Michael', isGod: true });
  const lead = await spawn({ id: 'dwight-1', name: 'Dwight', rank: 'deputy', team: 'Code' });
  const member = await spawn({ id: 'jim-1', name: 'Jim', rank: 'employee', team: 'Code' });
  const loner = await spawn({ id: 'pam-1', name: 'Pam', rank: 'employee', team: '' });
  return { home, hive, prompts: { god: promptOf(god), lead: promptOf(lead), member: promptOf(member), loner: promptOf(loner) } };
}

// --- the shared model ------------------------------------------------------

test('blank settings fall back to PDG, Directeur, Directeur adjoint, Employé', () => {
  const c = company.resolveCompany(undefined);
  assert.equal(c.ceoTitle, 'PDG');
  assert.equal(c.ceoName, '');
  assert.deepEqual(c.titles, { director: 'Directeur', deputy: 'Directeur adjoint', employee: 'Employé' });
  const custom = company.resolveCompany({ ceoName: '  Alex  ', titles: { employee: '   ' } });
  assert.equal(custom.ceoName, 'Alex', 'names are trimmed');
  assert.equal(custom.titles.employee, 'Employé', 'a blank title keeps the default');
});

test('the orchestrator is the director whatever its record says', () => {
  assert.equal(company.rankOf({ isGod: true, rank: 'deputy' }), 'director');
  assert.equal(company.rankOf({ rank: 'deputy' }), 'deputy');
  assert.equal(company.rankOf({}), 'employee', 'records from before ranks existed are employees');
  assert.equal(company.rankOf({ rank: 'nonsense' }), 'employee');
});

test('a spawn always carries both rank and team, so a demotion is not lost', () => {
  assert.deepEqual(company.orgForSpawn({ isGod: true }), {});
  assert.deepEqual(company.orgForSpawn({}), { rank: 'employee', team: '' });
  assert.deepEqual(company.orgForSpawn({ rank: 'deputy', team: '  Code  ' }), { rank: 'deputy', team: 'Code' });
});

// --- every agent knows who the human is --------------------------------------

test('every agent is told the human is the chief executive, by name and title', async (t) => {
  const { prompts } = await office(t);
  for (const [who, prompt] of Object.entries(prompts)) {
    assert.match(prompt, /CHAIN OF COMMAND: the human you work for is Alex, the PDG/, `${who} is not told who the human is`);
    assert.match(prompt, /above every agent including the director/, `${who} is not told the human outranks the director`);
    assert.match(prompt, /"the human", it means the PDG/, `${who} cannot map "the human" to the PDG`);
  }
});

test('each position gets its own instructions', async (t) => {
  const { prompts } = await office(t);
  assert.match(prompts.god, /YOUR POSITION: you are the "Directeur"/);
  assert.match(prompts.god, /route work that belongs to a team through its "Chef d’équipe"/);

  assert.match(prompts.lead, /you are a "Chef d’équipe" and you lead the team "Code"/);
  assert.match(prompts.lead, /answer to the director \(Michael\)/);

  assert.match(prompts.member, /you are an "Employé" in the team "Code", led by Dwight/);
  assert.match(prompts.loner, /you report directly to the director \(Michael\)/);
});

test('the prompt block holds nothing volatile, so the prefix stays cache-stable', () => {
  const block = company.chainOfCommandPrompt({
    company: company.resolveCompany(COMPANY), rank: 'employee', team: 'Code', directorName: 'Michael', teamLeadName: 'Dwight'
  });
  assert.doesNotMatch(block, /\d{4}-\d{2}-\d{2}|ctx \d+%|tok\b/, 'no dates, context meters or token counts');
  assert.equal(block, company.chainOfCommandPrompt({
    company: company.resolveCompany(COMPANY), rank: 'employee', team: 'Code', directorName: 'Michael', teamLeadName: 'Dwight'
  }), 'same inputs, same text');
});

test('the registry keeps rank and team, and a demotion overwrites them', async (t) => {
  const { hive, home } = await office(t);
  assert.equal(hive.registry().agents['dwight-1'].rank, 'deputy');
  assert.equal(hive.registry().agents['dwight-1'].team, 'Code');
  await hive.ensureAgent({ id: 'dwight-1', name: 'Dwight', provider: 'claude', cwd: home, rank: 'employee', team: '' }, { company: COMPANY });
  assert.equal(hive.registry().agents['dwight-1'].rank, 'employee');
  assert.equal(hive.registry().agents['dwight-1'].team, '');
  assert.equal(hive.isDeputy('dwight-1'), false);
});

// --- the live roster ---------------------------------------------------------

function snapshot(hive) {
  hive.writeFleetSnapshot({
    ts: Date.now(),
    agents: [
      { id: 'god-1', name: 'Michael', role: 'orchestrator', isGod: true, lastActiveSecAgo: 5 },
      { id: 'dwight-1', name: 'Dwight', role: 'agent', rank: 'deputy', team: 'Code', lastActiveSecAgo: 5 },
      { id: 'jim-1', name: 'Jim', role: 'agent', rank: 'employee', team: 'Code', lastActiveSecAgo: 5 },
      { id: 'pam-1', name: 'Pam', role: 'agent', rank: 'employee', team: '', lastActiveSecAgo: 5 }
    ]
  });
}

test('the roster shows who leads which team and who is in it', async (t) => {
  const { hive } = await office(t);
  snapshot(hive);
  const line = hive.rosterContext();
  assert.match(line, /god-1 "Michael" \(orchestrator, director,/);
  assert.match(line, /dwight-1 "Dwight" \(agent, deputy, leads "Code",/);
  assert.match(line, /jim-1 "Jim" \(agent, team "Code",/);
  assert.match(line, /pam-1 "Pam" \(agent, active/, 'a team-less employee carries no team tag');
});

test('a deputy gets the roster too, marked on its own row; employees still do not', async (t) => {
  const { hive } = await office(t);
  snapshot(hive);
  const server = new HookServer(hive, () => null, () => ({ notifications: false }), undefined, undefined);
  const fire = (agent_id, hook_event_name) => server.handle({ agent_id, hook_event_name, session_id: 's1' });
  const context = (res) => res?.hookSpecificOutput?.additionalContext ?? '';

  const lead = context(await fire('dwight-1', 'UserPromptSubmit'));
  assert.match(lead, /LIVE ROSTER/);
  assert.match(lead, /dwight-1 "Dwight" \([^)]*\byou\)/, 'the deputy has to spot itself');
  assert.doesNotMatch(lead, /god-1 "Michael" \([^)]*\byou\)/);

  assert.doesNotMatch(context(await fire('jim-1', 'UserPromptSubmit')), /LIVE ROSTER/);
  assert.match(context(await fire('god-1', 'UserPromptSubmit')), /god-1 "Michael" \([^)]*\byou\)/);
});
