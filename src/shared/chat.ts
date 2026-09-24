/**
 * The Chat tab's view of an agent: its Claude Code session transcript turned
 * into the messages a person would expect to read — what you said, what the
 * agent answered, and one short line per tool it ran.
 *
 * Pure: it takes the transcript's JSONL lines and returns items, so it can be
 * tested without a file, an agent or Electron. Everything that is not part of
 * the conversation (thinking, tool results, hook attachments, queue and cost
 * bookkeeping, meta messages, harness notifications) is left out.
 */
import { isInboxNudge } from './hiveNudge';

export type ChatRole = 'user' | 'assistant' | 'tool' | 'system';

export interface ChatItem {
  /** Stable across polls: the transcript record's uuid, plus the block index. */
  id: string;
  role: ChatRole;
  /** Markdown for user/assistant; a one-line summary for tool; a label for system. */
  text: string;
  /** For `tool`: the tool's name (Bash, Edit, Read…). */
  tool?: string;
  /** For `system`: what happened, so the UI can phrase it in the user's language. */
  event?: 'interrupted' | 'inbox' | 'command' | 'compacted';
  /** ISO timestamp from the transcript, when it has one. */
  ts?: string;
}

export interface ChatSnapshot {
  /** False when this agent has no readable conversation (not a Claude Code
   *  agent, or no session yet); the UI then points at the terminal. */
  supported: boolean;
  /** Why it is not supported, for the UI's message. */
  reason?: 'engine' | 'no-session';
  items: ChatItem[];
}

/** The most items a snapshot carries — the tail of a long session. */
export const CHAT_MAX_ITEMS = 300;
const TOOL_SUMMARY_MAX = 140;

type Block = { type?: string; text?: string; name?: string; input?: Record<string, unknown> };
type RecordLine = {
  type?: string;
  subtype?: string;
  uuid?: string;
  timestamp?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  message?: { role?: string; content?: string | Block[] };
};

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();
const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** A tool call as one line: its own description when it gave one, else the
 *  argument that says what it touched (command, file, pattern, url…). */
export function summarizeToolUse(name: string, input: Record<string, unknown> | undefined): string {
  const pick = (key: string): string | null => {
    const v = input?.[key];
    return typeof v === 'string' && v.trim() ? oneLine(v) : null;
  };
  const detail = pick('description') ?? pick('command') ?? pick('file_path') ?? pick('path')
    ?? pick('pattern') ?? pick('url') ?? pick('query') ?? pick('prompt') ?? pick('skill') ?? '';
  return clip(detail ? `${name} — ${detail}` : name, TOOL_SUMMARY_MAX);
}

/** A user turn's text when it is something the person actually wrote, a
 *  system event when the harness or the CLI put it there, or null to hide it. */
function classifyUserText(raw: string): { role: 'user'; text: string } | { role: 'system'; event: ChatItem['event']; text: string } | null {
  const text = raw.trim();
  if (!text) return null;
  if (text === '[Request interrupted by user]' || text.startsWith('[Request interrupted by user')) {
    return { role: 'system', event: 'interrupted', text: '' };
  }
  if (isInboxNudge(text)) return { role: 'system', event: 'inbox', text: '' };
  // A slash command the person ran: `<command-name>/compact</command-name>…`.
  const command = /^<command-name>\s*([^<]+?)\s*<\/command-name>/.exec(text);
  if (command) return { role: 'system', event: 'command', text: command[1] };
  // Everything else wrapped in a tag is machinery: command output, system
  // reminders, task notifications, bash input echoes.
  if (/^<[a-z][\w-]*[\s>]/i.test(text)) return null;
  return { role: 'user', text };
}

/** Parse transcript JSONL lines (oldest first) into chat items (oldest first),
 *  keeping at most `max` of the most recent ones. Malformed lines are skipped. */
export function parseTranscriptLines(lines: readonly string[], max = CHAT_MAX_ITEMS): ChatItem[] {
  const items: ChatItem[] = [];
  lines.forEach((line, lineNo) => {
    if (!line.trim()) return;
    let rec: RecordLine;
    try { rec = JSON.parse(line) as RecordLine; } catch { return; }
    if (!rec || typeof rec !== 'object' || rec.isMeta || rec.isSidechain) return;
    const base = rec.uuid ?? `line-${lineNo}`;
    const ts = typeof rec.timestamp === 'string' ? rec.timestamp : undefined;

    if (rec.type === 'system' && rec.subtype === 'compact_boundary') {
      items.push({ id: base, role: 'system', event: 'compacted', text: '', ts });
      return;
    }
    if (rec.type !== 'user' && rec.type !== 'assistant') return;
    const content = rec.message?.content;

    if (rec.type === 'user') {
      const texts = typeof content === 'string'
        ? [content]
        : Array.isArray(content) ? content.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text as string) : [];
      texts.forEach((raw, i) => {
        const c = classifyUserText(raw);
        if (!c) return;
        items.push(c.role === 'user'
          ? { id: `${base}:${i}`, role: 'user', text: c.text, ts }
          : { id: `${base}:${i}`, role: 'system', event: c.event, text: c.text, ts });
      });
      return;
    }

    if (!Array.isArray(content)) {
      if (typeof content === 'string' && content.trim()) items.push({ id: base, role: 'assistant', text: content.trim(), ts });
      return;
    }
    content.forEach((block, i) => {
      if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
        const prev = items[items.length - 1];
        // Claude Code writes one record per streamed block; consecutive text
        // blocks of one answer read as one bubble.
        if (prev && prev.role === 'assistant') {
          prev.text = `${prev.text}\n\n${block.text.trim()}`;
        } else {
          items.push({ id: `${base}:${i}`, role: 'assistant', text: block.text.trim(), ts });
        }
      } else if (block?.type === 'tool_use' && typeof block.name === 'string') {
        items.push({ id: `${base}:${i}`, role: 'tool', tool: block.name, text: summarizeToolUse(block.name, block.input), ts });
      }
    });
  });
  return items.length > max ? items.slice(items.length - max) : items;
}
