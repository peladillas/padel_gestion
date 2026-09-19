// Win/loss maths over the rows returned by GET /tournament-instances/my-matches
// and by the public profile (`matches`). One place, so the cromo in
// Valorations.jsx and the one in PlayerStatsView.jsx can't drift apart.
//
// Row shape (see TournamentService::matchesForPlayer):
//   { status, isTeam1, result: { outcome: 'team1'|'team2', sets: [{t1,t2}]|null,
//     retired: {team, reason}|null, played }, myTeam: [names], opponentTeam: [names] }
// `sets` are always in team1/team2 order; `isTeam1` says which side the
// player was on.

const isFinished = (m) => m?.status === 'completed' && !!m.result?.outcome;

/** true = won, false = lost, null = not decided yet. */
export function didWin(match) {
  if (!isFinished(match)) return null;
  return match.result.outcome === (match.isTeam1 ? 'team1' : 'team2');
}

/** Sets from the player's own point of view: [{ my, rival }]. */
export function setsForMe(match) {
  return (match?.result?.sets || []).map((s) => (
    match.isTeam1 ? { my: s.t1, rival: s.t2 } : { my: s.t2, rival: s.t1 }
  ));
}

export function computeRecord(matches) {
  const done = (matches || []).filter(isFinished);
  const wins = done.filter((m) => didWin(m)).length;
  const total = done.length;
  const setsWon = done.reduce(
    (acc, m) => acc + setsForMe(m).filter((s) => Number(s.my) > Number(s.rival)).length, 0,
  );

  return {
    total,
    wins,
    losses: total - wins,
    winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
    setsWon,
  };
}

/** "3d" / "20h" — the valoration window is 7 days now, so hours alone read badly. */
export function timeLeftLabel(match) {
  const hours = match?.hoursLeft ?? 0;
  return hours >= 48 ? `${Math.ceil(hours / 24)}d` : `${hours}h`;
}
