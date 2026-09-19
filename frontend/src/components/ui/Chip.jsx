export function ChipRow({ children, className = '', style, ...props }) {
  return <div className={['bp-chip-row', className].filter(Boolean).join(' ')} style={style} {...props}>{children}</div>;
}

export function Chip({ active = false, count, children, className = '', onClick, ...props }) {
  const cls = ['bp-chip', active ? 'on' : '', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} onClick={onClick} {...props}>
      {children}
      {count !== undefined && <span className="bp-chip-count">{count}</span>}
    </button>
  );
}

export default Chip;
