// Shared toggle switch — extracted from Profile.jsx's local `PrivacyToggle` so
// every on/off control in the app (privacy settings, court active/inactive,
// 2FA, etc.) looks and behaves the same way instead of each page inventing
// its own (Profile had a real switch; Clubs' CourtsPanel used a plain
// ●/○ character — this replaces both with one implementation).
export default function Switch({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: checked ? 'var(--court)' : 'var(--line)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        opacity: disabled ? 0.6 : 1, padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: checked ? 20 : 2, width: 18, height: 18,
        borderRadius: '50%', background: 'white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
      }} />
    </button>
  );
}
