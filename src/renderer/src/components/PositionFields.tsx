import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store/store';
import { cleanTeam } from '@shared/company';
import type { AccentColorName } from '@/design/tokens';

/**
 * Where an agent sits in the company: its position (employee or deputy
 * director) and its team. Shared by Add Agent and Edit Agent so both describe
 * the hierarchy the same way. The orchestrator is the director by definition,
 * so for it this renders a read-only line instead of controls.
 */
export function PositionFields({
  isGod,
  rank,
  team,
  accent,
  selfId,
  onRank,
  onTeam
}: {
  isGod?: boolean;
  rank: 'deputy' | 'employee';
  team: string;
  accent: AccentColorName;
  /** The agent being edited, left out of the "existing teams" suggestions'
   *  source so renaming your own team does not suggest the old name back. */
  selfId?: string;
  onRank: (rank: 'deputy' | 'employee') => void;
  onTeam: (team: string) => void;
}) {
  const { t } = useTranslation();
  const titles = useStore((s) => s.company.titles);
  const agents = useStore((s) => s.agents);

  if (isGod) {
    return (
      <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-700)' }}>
        {t('position.directorNote', { director: titles.director })}
      </span>
    );
  }

  const teams = [...new Set(agents
    .filter((a) => a.id !== selfId && !a.isGod)
    .map((a) => cleanTeam(a.team))
    .filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const listId = `teams-${selfId ?? 'new'}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={labelStyle}>{t('position.rank')}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['employee', 'deputy'] as const).map((r) => {
            const active = rank === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => onRank(r)}
                style={{
                  padding: '3px 8px 1px',
                  background: active ? `var(--cth-${accent}-light)` : 'var(--cth-cream-100)',
                  boxShadow: active ? 'inset 0 0 0 1.5px var(--cth-ink-500)' : 'inset 0 0 0 1px var(--cth-ink-100)',
                  fontFamily: 'var(--cth-font-ui)', fontSize: 12,
                  color: 'var(--cth-ink-900)', cursor: 'pointer', border: 'none'
                }}
              >
                {r === 'deputy' ? titles.deputy : titles.employee}
              </button>
            );
          })}
        </div>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={labelStyle}>{rank === 'deputy' ? t('position.teamLed') : t('position.team')}</span>
        <input
          value={team}
          onChange={(e) => onTeam(e.target.value)}
          placeholder={rank === 'deputy' ? t('position.teamLedPlaceholder') : t('position.teamPlaceholder')}
          list={listId}
          maxLength={40}
          style={inputStyle}
        />
        <datalist id={listId}>
          {teams.map((name) => <option key={name} value={name} />)}
        </datalist>
      </label>

      <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>
        {rank === 'deputy'
          ? t('position.deputyHint', { deputy: titles.deputy })
          : t('position.employeeHint', { director: titles.director })}
      </span>
    </div>
  );
}

const labelStyle: CSSProperties = {
  fontFamily: 'var(--cth-font-display)',
  fontSize: 8, lineHeight: '12px',
  color: 'var(--cth-ink-700)',
  textTransform: 'uppercase'
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '6px 8px 4px',
  background: 'var(--cth-paper-100)',
  border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 14,
  color: 'var(--cth-ink-900)',
  outline: 'none',
  boxSizing: 'border-box'
};
