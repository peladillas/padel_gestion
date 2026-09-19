export function Card({ variant = 'default', className = '', children, style, ...props }) {
  const cls = [
    'bp-card',
    variant !== 'default' ? `bp-card-${variant}` : '',
    className,
  ].filter(Boolean).join(' ');
  return <div className={cls} style={style} {...props}>{children}</div>;
}

export default Card;
