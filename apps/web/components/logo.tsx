/**
 * VeriSci's mark: a check drawn as three linked graph nodes, a verified record on the
 * knowledge graph. `app/icon.svg` is the same drawing, for the browser tab.
 */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient
          id="logo-signal"
          x1="6"
          y1="24"
          x2="26"
          y2="8"
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
        d="M8.5 15.5 14 21.5 23.5 9.5"
        fill="none"
        stroke="url(#logo-signal)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="15.5" r="2.4" style={{ fill: "var(--accent)" }} />
      <circle cx="14" cy="21.5" r="3" fill="url(#logo-signal)" />
      <circle cx="23.5" cy="9.5" r="2.4" style={{ fill: "var(--accent-2)" }} />
      <circle
        cx="23.5"
        cy="9.5"
        r="4.6"
        fill="none"
        style={{ stroke: "var(--accent-2)" }}
        strokeOpacity="0.35"
      />
    </svg>
  );
}

/** The mark and the name, for the header. */
export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight">
        Veri<span className="text-accent">Sci</span>
      </span>
    </span>
  );
}
