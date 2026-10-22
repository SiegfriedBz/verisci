/**
 * LabsTrail's mark: a heartbeat whose last beat is a check, health research verified, drawn from
 * the off-chain record's blue into the on-chain proof's teal. `app/icon.svg` is the same
 * drawing, for the browser tab.
 */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient
          id="logo-signal"
          x1="5"
          y1="20"
          x2="27"
          y2="10"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" style={{ stopColor: "var(--accent)" }} />
          <stop offset="1" style={{ stopColor: "var(--accent-2)" }} />
        </linearGradient>
      </defs>
      <rect
        x="0.75"
        y="0.75"
        width="30.5"
        height="30.5"
        rx="9"
        style={{ fill: "var(--page)", stroke: "var(--accent)" }}
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      <path
        d="M5.6 17H9.8l2.2-6.3 2.7 11.1 2.3-4.9 3.2 3.5 5.8-8.6"
        fill="none"
        stroke="url(#logo-signal)"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="25.9" cy="11.8" r="2" style={{ fill: "var(--accent-2)" }} />
    </svg>
  );
}

/** The mark and the name, for the header. */
export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight">
        Labs<span className="text-accent">Trail</span>
      </span>
    </span>
  );
}
