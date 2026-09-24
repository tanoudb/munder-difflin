/**
 * The company around the agents: who the human is, and who reports to whom.
 *
 * Open Space runs an office. The human at the keyboard is its chief executive
 * (the "PDG" by default), the orchestrator is the director, a deputy director
 * leads one team, and everyone else is an employee — in a team, or reporting
 * straight to the director. Every agent is told this in its system prompt, so
 * it always knows who is talking to it.
 *
 * Shared by main (the prompt block, the roster) and the renderer (Settings,
 * the agent editor, the badges on the floor), so the defaults live in one place.
 */

/** Where an agent sits. The orchestrator is always the director. */
export type AgentRank = 'director' | 'deputy' | 'employee';

/** What the human calls each position. Free text, shown in the UI and quoted
 *  to the agents verbatim. */
export interface CompanyTitles {
  director: string;
  deputy: string;
  employee: string;
}

/** Settings → Company, as stored in the config. Every field is optional; the
 *  defaults below fill whatever is left blank. */
export interface CompanyConfig {
  /** The human's name, as the agents should address them. */
  ceoName?: string;
  /** The human's title. */
  ceoTitle?: string;
  titles?: Partial<CompanyTitles>;
}

export const DEFAULT_CEO_TITLE = 'PDG';
export const DEFAULT_TITLES: CompanyTitles = {
  director: 'Directeur',
  deputy: 'Directeur adjoint',
  employee: 'Employé'
};

export interface ResolvedCompany {
  ceoName: string;
  ceoTitle: string;
  titles: CompanyTitles;
}

const clean = (value: unknown, max = 60): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** The company with every blank filled from the defaults. Never throws. */
export function resolveCompany(config?: CompanyConfig | null): ResolvedCompany {
  const titles = config?.titles ?? {};
  return {
    ceoName: clean(config?.ceoName),
    ceoTitle: clean(config?.ceoTitle) || DEFAULT_CEO_TITLE,
    titles: {
      director: clean(titles.director) || DEFAULT_TITLES.director,
      deputy: clean(titles.deputy) || DEFAULT_TITLES.deputy,
      employee: clean(titles.employee) || DEFAULT_TITLES.employee
    }
  };
}

/** A team name as stored: trimmed, single-spaced, capped. '' means no team. */
export function cleanTeam(team: unknown): string {
  return clean(team, 40);
}

/** The rank of an agent record. Anything that is not the orchestrator and not
 *  explicitly a deputy is an employee — including records written before ranks
 *  existed. */
export function rankOf(agent: { isGod?: boolean; rank?: string | null }): AgentRank {
  if (agent.isGod) return 'director';
  return agent.rank === 'deputy' ? 'deputy' : 'employee';
}

/** The rank and team to carry on a hive spawn. The orchestrator carries none
 *  (it is the director by definition). Everyone else carries BOTH, even an
 *  empty team: the registry merges a spawn over the previous record, so an
 *  omitted field would keep a rank or team the human has since taken away. */
export function orgForSpawn(agent: { isGod?: boolean; rank?: string | null; team?: string | null }):
  { rank?: 'deputy' | 'employee'; team?: string } {
  if (agent.isGod) return {};
  const rank = rankOf(agent);
  return { rank: rank === 'deputy' ? 'deputy' : 'employee', team: cleanTeam(agent.team) };
}

/**
 * The chain-of-command block for an agent's system prompt.
 *
 * Built once per spawn from values that only change when the human edits them
 * (their name and titles, the agent's own rank and team), so it keeps the
 * prompt prefix cache-stable. Who is in which team RIGHT NOW is volatile and
 * travels on the live roster instead.
 */
export function chainOfCommandPrompt(opts: {
  company: ResolvedCompany;
  rank: AgentRank;
  /** The team this agent leads (deputy) or belongs to (employee). */
  team?: string;
  /** The orchestrator's display name. */
  directorName: string;
  /** For an employee in a team: the name of the deputy leading it, if known. */
  teamLeadName?: string;
}): string {
  const { company, rank, directorName } = opts;
  const { ceoName, ceoTitle, titles } = company;
  const team = cleanTeam(opts.team);
  const ceo = ceoName ? `${ceoName}, the ${ceoTitle}` : `the ${ceoTitle}`;
  const address = ceoName ? `"${ceoTitle}" or by name (${ceoName})` : `"${ceoTitle}"`;

  const common = `CHAIN OF COMMAND: the human you work for is ${ceo} — the chief executive of this company and the top of its hierarchy, above every agent including the director. Wherever this protocol says "the human", it means the ${ceoTitle}. Anything typed straight into your session comes from the ${ceoTitle}: treat it as an instruction from the boss, address them as ${address}, and keep knowing who they are after any context compaction. Positions in this company: "${titles.director}" is the director (${directorName}), a "${titles.deputy}" is a deputy director who leads one team, an "${titles.employee}" is a team member.`;

  let position: string;
  if (rank === 'director') {
    position = `YOUR POSITION: you are the "${titles.director}". You answer to the ${ceoTitle} alone. Each "${titles.deputy}" leads a team (the LIVE ROSTER shows who leads which team and who is in it): route work that belongs to a team through its "${titles.deputy}", who breaks it down for their people. Dispatch straight to an "${titles.employee}" when they have no team, or when the ${ceoTitle} names them.`;
  } else if (rank === 'deputy') {
    const led = team ? `the team "${team}"` : 'a team';
    position = `YOUR POSITION: you are a "${titles.deputy}" and you lead ${led}. You answer to the director (${directorName}) and, above them, to the ${ceoTitle}. Work for your team reaches you from the director or straight from the ${ceoTitle}: break it into tasks, dispatch them to your team members (the LIVE ROSTER lists them) by messaging their agent ids, follow up, check what they deliver, and report back to whoever asked. Do the work yourself only when your team is idle or the task is too small to hand off. Escalate to the director anything that crosses teams or needs a decision above your level.`;
  } else if (team) {
    const lead = opts.teamLeadName ? `${opts.teamLeadName}, its "${titles.deputy}"` : `its "${titles.deputy}"`;
    position = `YOUR POSITION: you are an "${titles.employee}" in the team "${team}", led by ${lead}. Your tasks come from your "${titles.deputy}", from the director (${directorName}) or straight from the ${ceoTitle}. Report results to whoever gave you the task, and tell your "${titles.deputy}" when you are blocked.`;
  } else {
    position = `YOUR POSITION: you are an "${titles.employee}" and you report directly to the director (${directorName}). Your tasks come from the director or straight from the ${ceoTitle}; report results to whoever gave you the task.`;
  }
  return `${common} ${position}`;
}

/** One agent's rank and team as a short roster tag: `deputy, leads "Code"`,
 *  `team "Code"`, or '' for the director and team-less employees. */
export function rosterOrgTag(agent: { isGod?: boolean; rank?: string | null; team?: string | null }): string {
  const rank = rankOf(agent);
  const team = cleanTeam(agent.team);
  if (rank === 'deputy') return team ? `deputy, leads "${team}"` : 'deputy';
  if (rank === 'employee' && team) return `team "${team}"`;
  return '';
}
