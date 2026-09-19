export function Button({
  variant = 'primary',
  size    = 'md',
  wide    = false,
  className = '',
  children,
  ...props
}) {
  const cls = [
    'bp-btn',
    `bp-btn-${size}`,
    `bp-btn-${variant}`,
    wide ? 'bp-btn-wide' : '',
    className,
  ].filter(Boolean).join(' ');
  return <button className={cls} {...props}>{children}</button>;
}

export default Button;
