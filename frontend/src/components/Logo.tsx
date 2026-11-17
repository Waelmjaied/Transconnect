export function Logo() {
  return (
    <div className="logo" dir="ltr" aria-label="TransConnect">
      <svg viewBox="0 0 56 48" width="54" height="46" aria-hidden="true">
        <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#0B4FB3" /><stop offset="1" stopColor="#2B8BF0" /></linearGradient></defs>
        <circle cx="22" cy="22" r="18" style={{ fill: 'var(--logo-globe)' }} stroke="url(#lg)" strokeWidth="2.4" />
        <ellipse cx="22" cy="22" rx="7.5" ry="18" fill="none" stroke="url(#lg)" strokeWidth="1.6" opacity=".7" />
        <path d="M5 22h34M8 13h28M8 31h28" stroke="url(#lg)" strokeWidth="1.4" opacity=".55" />
        <rect x="24" y="19" width="18" height="15" rx="2.4" fill="url(#lg)" />
        <path d="M43 23h6.4l4.6 5.6V34H43z" fill="url(#lg)" />
        <path d="M46 25.2h3.4l2.2 2.6H46z" style={{ fill: 'var(--logo-globe)' }} />
        <circle cx="31" cy="35.5" r="3.6" style={{ fill: 'var(--surface)' }} stroke="#2B7BE0" strokeWidth="2.2" />
        <circle cx="48" cy="35.5" r="3.6" style={{ fill: 'var(--surface)' }} stroke="#2B7BE0" strokeWidth="2.2" />
      </svg>
      <div className="logo-text">
        <strong><span>Trans</span>Connect</strong>
        <small>Voyagez • Transportez • Livrez</small>
      </div>
    </div>
  )
}
