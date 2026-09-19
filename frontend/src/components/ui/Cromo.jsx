export function Cromo({ name, level, ovr, size = 'sm', me = false, className = '' }) {
  const parts = (name || '').trim().split(' ');
  const first = parts[0] || '?';
  const last  = parts.slice(1).join(' ') || '';
  const initials = parts.map(p => p[0] || '').slice(0, 2).join('').toUpperCase() || '?';

  const cls = ['bp-cromo', `bp-cromo-${size}`, me ? 'me' : '', className].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      <div className="bp-cromo-strip">
        <span>{level ? `NIV·${level}` : '—'}</span>
        <span>{ovr || '—'}</span>
      </div>
      <div className="bp-cromo-body">
        <div className="bp-cromo-initials">{initials}</div>
      </div>
      <div className="bp-cromo-foot">
        <div className="bp-cromo-first">{first}</div>
        {last && <div className="bp-cromo-last">{last}</div>}
      </div>
    </div>
  );
}

export default Cromo;
