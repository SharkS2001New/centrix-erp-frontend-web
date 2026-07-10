/**
 * Centrix brand mark — circular nested C + center dot.
 * Uses currentColor for the C so it stays visible on light and dark surfaces.
 * Pass className with a text-* color (e.g. text-white on the sidebar).
 */
export function CentrixLogoMark({ size = 32, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`centrix-logo-mark text-[#185FA5] ${className}`.trim()}
      aria-hidden
      style={{ flexShrink: 0, aspectRatio: "1 / 1", display: "block" }}
    >
      {/* Outer C — radius 26, opening ±42° on the right (radii match endpoints) */}
      <path
        d="M51.321 49.393 A 26 26 0 1 0 51.321 14.607"
        stroke="currentColor"
        strokeWidth="6.5"
        strokeLinecap="butt"
      />
      {/* Inner C — radius 16 */}
      <path
        d="M43.89 42.71 A 16 16 0 1 0 43.89 21.29"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="butt"
      />
      {/* Center dot — always brand green */}
      <circle cx="32" cy="32" r="4.25" className="centrix-logo-mark-dot" fill="#22C55E" />
    </svg>
  );
}
