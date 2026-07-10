/** Centrix brand mark — circular nested C with open spacing (never aspect-squeezed). */
export function CentrixLogoMark({ size = 32, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
      style={{ flexShrink: 0, aspectRatio: "1 / 1", display: "block" }}
    >
      {/* Outer C — wider opening, lighter stroke */}
      <path
        d="M52.8 49.8 A 26 26 0 1 0 52.8 14.2"
        stroke="#185FA5"
        strokeWidth="6.5"
        strokeLinecap="butt"
      />
      {/* Inner C — clear gap from outer and from center */}
      <path
        d="M45.2 44.2 A 16 16 0 1 0 45.2 19.8"
        stroke="#185FA5"
        strokeWidth="5"
        strokeLinecap="butt"
      />
      {/* Center dot */}
      <circle cx="32" cy="32" r="4.25" fill="#22C55E" />
    </svg>
  );
}
