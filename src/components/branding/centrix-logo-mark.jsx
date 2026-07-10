import Image from "next/image";

/**
 * Centrix brand mark — nested C + center dot on a white disc
 * so it stays readable on dark and light chrome.
 */
export function CentrixLogoMark({ size = 32, className = "" }) {
  return (
    <span
      className={`centrix-logo-mark inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-black/5 ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Image
        src="/branding/centrix-mark.png"
        alt=""
        width={size}
        height={size}
        priority
        className="block"
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    </span>
  );
}
