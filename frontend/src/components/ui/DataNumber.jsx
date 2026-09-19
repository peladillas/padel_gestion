/* DataNumber — scores, stats, niveles.
   Space Grotesk 500–600, tracking -0.02em, line-height 1.
   size: hero(56px), xl(40px), lg(28px), md(20px), sm(16px)
   tone: default | ok (court-deep) | crimson | clay | muted */

const SIZES = {
  hero: { fontSize: 56, fontWeight: 600 },
  xl:   { fontSize: 40, fontWeight: 600 },
  lg:   { fontSize: 28, fontWeight: 500 },
  md:   { fontSize: 20, fontWeight: 500 },
  sm:   { fontSize: 16, fontWeight: 500 },
};

const TONES = {
  default: 'inherit',
  ok:      'var(--court-deep)',
  crimson: 'var(--crimson)',
  clay:    'var(--clay)',
  muted:   'var(--ink-soft)',
};

export function DataNumber({ size = 'lg', tone = 'default', children, style, className = '' }) {
  const { fontSize, fontWeight } = SIZES[size] || SIZES.lg;
  return (
    <span
      className={className}
      style={{
        fontFamily:    'var(--display)',
        fontSize,
        fontWeight,
        letterSpacing: '-0.02em',
        lineHeight:    1,
        color:         TONES[tone] || TONES.default,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export default DataNumber;
