import { TrophyIcon } from '@heroicons/react/24/solid';
import { formatMatchDateTime, setWinsFromResult } from '../../utils/matchDisplay';

/*
 * Shared match-display components for the NEW tournament engine — used
 * by both the club-admin page (TournamentEngineAdmin.jsx) and the
 * player page (TournamentView.jsx) so the two views actually look like
 * the same product instead of two different one-off layouts.
 */

/** One avatar "sphere" — photo if available, else legible initials. */
export function PlayerAvatar({ player, size = 26, ring = false }) {
  const initials = (player?.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const border = ring ? '2px solid var(--paper)' : '1px solid var(--court)';

  if (player?.avatarUrl) {
    return (
      <img src={player.avatarUrl} alt={player.name} style={{
        width: size, height: size, borderRadius: '50%', objectFit: 'cover', border, flexShrink: 0,
      }} />
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--court-soft)', border,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.max(9, size * 0.4), fontWeight: 800, color: 'var(--court-deep)',
      flexShrink: 0, lineHeight: 1,
    }}>
      {initials}
    </div>
  );
}

/**
 * One team's column inside a match card — each player on its own row
 * (avatar + "Apellido I."), player1 above player2, so pareja 1 and
 * pareja 2 read with the exact same vertical structure.
 */
export function TeamColumn({ players, labels, bold, size = 22, align = 'left' }) {
  const rows = players.length > 0 ? players : [null];
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
      background: bold ? 'var(--ok-soft)' : 'transparent',
      borderRadius: 8,
      padding: bold ? '4px 6px' : 0,
    }}>
      {rows.map((p, i) => (
        <div key={p?.id || i} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexDirection: align === 'right' ? 'row-reverse' : 'row' }}>
          <PlayerAvatar player={p} size={size} />
          <span style={{
            fontSize: 12.5, fontWeight: bold ? 700 : 500, color: bold ? 'var(--ok)' : 'var(--ink-mid)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {p ? (labels[p.id] || p.name) : '—'}
          </span>
          {bold && i === 0 && (
            <TrophyIcon style={{ width: 13, height: 13, color: 'var(--amber)', flexShrink: 0 }} aria-label="Pareja ganadora" />
          )}
        </div>
      ))}
    </div>
  );
}

/** Middle column — sets stacked (set 1 above set 2 above set 3), or a retirement note, or "vs" when still pending. */
function ResultColumn({ result, pending }) {
  if (pending) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>vs</span>;
  }

  if (result?.retired) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--crimson)' }}>Abandono</div>
        <div style={{ fontSize: 9, color: 'var(--ink-soft)', maxWidth: 80 }}>{result.retired.reason}</div>
      </div>
    );
  }

  const sets = result?.sets || [];
  if (!sets.length) return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>vs</span>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
      {sets.map((s, i) => (
        <span key={i} style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
          {s.t1}-{s.t2}
        </span>
      ))}
    </div>
  );
}

/**
 * Compact match card — same look on the admin and player pages.
 * Row 1: fecha/hora — club · pista (+ suspend control). Row 2: pareja 1 |
 * resultado | pareja 2, three columns. Row 3 only appears when there's
 * an action to take on a pending match (`footer`, e.g. admin's "Cargar
 * resultado" button) — a completed match never needs it.
 */
export function MatchCard({
  team1, team2, labels, round, result, status, mine, onClick, footer, suspendControl,
  scheduledAt, courtNumber, clubName,
}) {
  const completed = status === 'completed';
  const suspended = status === 'suspended';
  const { outcome } = setWinsFromResult(result);
  const dateLabel = formatMatchDateTime(scheduledAt);
  const placeLabel = [clubName, courtNumber ? `Pista ${courtNumber}` : null].filter(Boolean).join(' · ');

  return (
    <div
      onClick={onClick}
      style={{
        background: mine ? '#fefce8' : 'white',
        border: `1px solid ${mine ? 'var(--amber-soft)' : completed ? 'var(--ok-soft)' : suspended ? 'var(--crimson-soft)' : 'var(--bone-3)'}`,
        borderRadius: 12,
        padding: '9px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {/* Fila 1: fecha/hora — club y pista */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--ink-soft)', fontWeight: 600 }}>
        <span>{dateLabel || `Fecha ${round}`}</span>
        {placeLabel && <span style={{ color: 'var(--line)' }}>—</span>}
        {placeLabel && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{placeLabel}</span>}
        {suspended && <span style={{ marginLeft: 'auto', color: 'var(--crimson)', fontWeight: 700 }}>Suspendido</span>}
        {suspendControl && <div style={{ marginLeft: suspended ? 6 : 'auto', flexShrink: 0 }}>{suspendControl}</div>}
      </div>

      {/* Fila 2: pareja 1 | resultado | pareja 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
        <TeamColumn players={team1} labels={labels} bold={outcome === 'team1'} />
        <ResultColumn result={result} pending={!completed} />
        <TeamColumn players={team2} labels={labels} bold={outcome === 'team2'} align="right" />
      </div>

      {mine && (
        <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--amber)', fontWeight: 700, marginTop: -4 }}>
          ⭐ Tu partido
        </div>
      )}

      {/* Fila 3: solo partidos pendientes con una acción disponible */}
      {!completed && footer}
    </div>
  );
}
