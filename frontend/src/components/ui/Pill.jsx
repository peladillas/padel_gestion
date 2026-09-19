export function Pill({ variant = 'neutral', children, className = '', ...props }) {
  const cls = ['bp-pill', `bp-pill-${variant}`, className].filter(Boolean).join(' ');
  return (
    <span className={cls} {...props}>
      <span className="bp-pill-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export default Pill;
