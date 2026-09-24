import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, type Agent, type QueuedMessage } from '@/store/store';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { PixelButton } from './PixelButton';
import { cleanTeam, rankOf } from '@shared/company';
import type { ChatItem, ChatSnapshot } from '@shared/chat';

const POLL_MS = 1500;
const NO_QUEUE: QueuedMessage[] = [];

/** One row of the conversation: a message, a system line, or a run of tool
 *  calls folded into one expandable line so they do not drown the answers. */
type Row =
  | { kind: 'item'; item: ChatItem }
  | { kind: 'tools'; id: string; items: ChatItem[] };

function toRows(items: ChatItem[]): Row[] {
  const rows: Row[] = [];
  for (const item of items) {
    const last = rows[rows.length - 1];
    if (item.role === 'tool') {
      if (last && last.kind === 'tools') last.items.push(item);
      else rows.push({ kind: 'tools', id: item.id, items: [item] });
    } else {
      rows.push({ kind: 'item', item });
    }
  }
  return rows;
}

/**
 * The Chat tab: talk to any agent the way you would in the Claude app.
 *
 * The conversation is read from the agent's own session transcript, so it shows
 * exactly what the agent saw and said. What you type goes through the same
 * message queue as the terminal's composer — it is delivered the moment the
 * agent is free, never typed over its work. The selector at the top switches
 * who you are talking to: the director, a deputy, or any employee.
 */
export function ChatTab({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const agents = useStore((s) => s.agents);
  const select = useStore((s) => s.select);
  const setSidebarTab = useStore((s) => s.setSidebarTab);
  const enqueueMessage = useStore((s) => s.enqueueMessage);
  const queued = useStore((s) => s.messageQueues[agent.id]) ?? NO_QUEUE;
  const company = useStore((s) => s.company);

  const [snap, setSnap] = useState<ChatSnapshot | null>(null);
  const [draft, setDraft] = useState('');
  const [openRuns, setOpenRuns] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setSnap(null);
    setOpenRuns(new Set());
    stickToBottom.current = true;
    const tick = async (): Promise<void> => {
      try {
        const next = await window.cth.agentChat(agent.id);
        if (alive && next) setSnap(next);
      } catch { /* keep the last snapshot on screen */ }
      if (alive) timer = setTimeout(() => { void tick(); }, POLL_MS);
    };
    void tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [agent.id]);

  const rows = useMemo(() => toRows(snap?.items ?? []), [snap]);

  // Follow new messages unless the person has scrolled up to read.
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [rows, queued.length]);
  const onScroll = (): void => {
    const el = listRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const send = (): void => {
    const text = draft.trim();
    if (!text) return;
    enqueueMessage(agent.id, text);
    setDraft('');
    stickToBottom.current = true;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter sends; Shift+Enter is a new line; never send mid-IME composition.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const positionOf = (a: Agent): string => {
    const rank = rankOf(a);
    const team = cleanTeam(a.team);
    const title = rank === 'director' ? company.titles.director : rank === 'deputy' ? company.titles.deputy : company.titles.employee;
    return team ? `${title} · ${team}` : title;
  };
  const people = agents.filter((a) => !a.isAssistant);
  const groups: { label: string; list: Agent[] }[] = [
    { label: t('chat.groupDirector'), list: people.filter((a) => rankOf(a) === 'director') },
    { label: t('chat.groupDeputies'), list: people.filter((a) => rankOf(a) === 'deputy') },
    { label: t('chat.groupEmployees'), list: people.filter((a) => rankOf(a) === 'employee') }
  ].filter((g) => g.list.length > 0);

  const you = t('chat.you', { title: company.ceoTitle });

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--cth-paper-100)' }}>
      {/* Who you are talking to. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
        borderBottom: '1px solid var(--cth-ink-100)', flexShrink: 0
      }}>
        <span style={labelStyle}>{t('chat.recipient')}</span>
        <select
          value={agent.id}
          onChange={(e) => select(e.target.value)}
          style={{
            flex: 1, minWidth: 0, padding: '4px 6px', fontFamily: 'var(--cth-font-ui)', fontSize: 13,
            color: 'var(--cth-ink-900)', background: 'var(--cth-cream-100)',
            border: 'none', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', outline: 'none'
          }}
        >
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.list.map((a) => (
                <option key={a.id} value={a.id}>{`${a.name} — ${positionOf(a)}`}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {agent.status === 'blocked' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', flexShrink: 0,
          background: 'var(--cth-lemon-light)', boxShadow: 'inset 0 -1px 0 var(--cth-ink-100)',
          fontSize: 12, color: 'var(--cth-ink-900)'
        }}>
          <span style={{ flex: 1 }}>{t('chat.blocked', { name: agent.name })}</span>
          <PixelButton variant="secondary" size="sm" onClick={() => setSidebarTab('terminal')}>
            {t('chat.openTerminal')}
          </PixelButton>
        </div>
      )}

      {/* The conversation. */}
      <div
        ref={listRef}
        onScroll={onScroll}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {!snap ? (
          <Empty>{t('chat.loading')}</Empty>
        ) : !snap.supported ? (
          <Empty>
            {snap.reason === 'engine' ? t('chat.unsupportedEngine') : t('chat.noSession', { name: agent.name })}
            {agent.ptyId && (
              <div style={{ marginTop: 10 }}>
                <PixelButton variant="secondary" size="sm" onClick={() => setSidebarTab('terminal')}>
                  {t('chat.openTerminal')}
                </PixelButton>
              </div>
            )}
          </Empty>
        ) : rows.length === 0 && queued.length === 0 ? (
          <Empty>{t('chat.empty', { name: agent.name })}</Empty>
        ) : (
          rows.map((row) => {
            if (row.kind === 'tools') {
              const open = openRuns.has(row.id);
              const last = row.items[row.items.length - 1];
              return (
                <div key={row.id} style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
                  <button
                    type="button"
                    onClick={() => setOpenRuns((prev) => {
                      const next = new Set(prev);
                      if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                      return next;
                    })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, maxWidth: '100%',
                      padding: '2px 6px', border: 'none', background: 'transparent', cursor: 'pointer',
                      fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-500)', textAlign: 'left'
                    }}
                  >
                    <span aria-hidden>{open ? '▾' : '▸'}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>
                      {row.items.length === 1 ? t('chat.toolCalls', { count: 1 }) : t('chat.toolCallsPlural', { count: row.items.length })}
                    </span>
                    {!open && (
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        · {last.text}
                      </span>
                    )}
                  </button>
                  {open && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0 2px 20px' }}>
                      {row.items.map((it) => (
                        <span key={it.id} style={{
                          fontFamily: 'var(--cth-font-mono)', fontSize: 11, lineHeight: '15px',
                          color: 'var(--cth-ink-700)', overflowWrap: 'anywhere'
                        }}>› {it.text}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            const { item } = row;
            if (item.role === 'system') {
              const label = item.event === 'interrupted' ? t('chat.interrupted')
                : item.event === 'inbox' ? t('chat.inbox')
                  : item.event === 'compacted' ? t('chat.compacted')
                    : t('chat.command', { command: item.text });
              return (
                <div key={item.id} style={{ alignSelf: 'center', fontSize: 11, color: 'var(--cth-ink-500)', fontStyle: 'italic' }}>
                  — {label} —
                </div>
              );
            }
            const mine = item.role === 'user';
            return (
              <Bubble key={item.id} mine={mine} accent={agent.accent} author={mine ? you : agent.name}>
                {mine
                  ? <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.text}</span>
                  : <MarkdownPreview source={item.text} variant="card" />}
              </Bubble>
            );
          })
        )}

        {/* Waiting in the queue: shown faded until the agent takes them. */}
        {snap?.supported && queued.map((q) => (
          <Bubble key={q.id} mine accent={agent.accent} author={you} faded note={t('chat.queued', { name: agent.name })}>
            <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{q.text}</span>
          </Bubble>
        ))}
      </div>

      {/* The composer. */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'flex-end', padding: 10, flexShrink: 0,
        borderTop: '1px solid var(--cth-ink-100)', background: 'var(--cth-cream-100)'
      }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('chat.placeholder', { name: agent.name })}
          rows={2}
          disabled={!agent.ptyId}
          style={{
            flex: 1, minWidth: 0, resize: 'none', padding: '6px 8px',
            fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '18px',
            color: 'var(--cth-ink-900)', background: 'var(--cth-paper-100)',
            border: 'none', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', outline: 'none'
          }}
        />
        <PixelButton variant="primary" size="sm" onClick={send} disabled={!draft.trim() || !agent.ptyId}>
          {t('chat.send')}
        </PixelButton>
      </div>
    </div>
  );
}

function Bubble({ mine, accent, author, faded, note, children }: {
  mine: boolean;
  accent: Agent['accent'];
  author: string;
  faded?: boolean;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%',
      display: 'flex', flexDirection: 'column', gap: 3, opacity: faded ? 0.6 : 1
    }}>
      <span style={{
        ...labelStyle, alignSelf: mine ? 'flex-end' : 'flex-start', color: 'var(--cth-ink-500)'
      }}>{author}{note ? ` · ${note}` : ''}</span>
      <div style={{
        padding: '8px 10px', fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink-900)',
        background: mine ? `var(--cth-${accent}-light)` : 'var(--cth-cream-100)',
        boxShadow: mine ? `inset 0 0 0 1px var(--cth-${accent})` : 'inset 0 0 0 1px var(--cth-ink-100)',
        overflowWrap: 'anywhere', minWidth: 0
      }}>
        {children}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      margin: 'auto', maxWidth: 320, textAlign: 'center',
      fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink-500)'
    }}>{children}</div>
  );
}

const labelStyle: CSSProperties = {
  fontFamily: 'var(--cth-font-display)',
  fontSize: 8, lineHeight: '12px',
  color: 'var(--cth-ink-700)',
  textTransform: 'uppercase',
  flexShrink: 0
};
