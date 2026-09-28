"use client";

import { illustrationStyle } from "@/lib/platform-marketing";

/** Simple SVG scenes so portfolios look illustrated without photo assets. */
const ILLUSTRATION_SVG = {
  hero_retail: (
    <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect x="24" y="48" width="90" height="100" rx="8" fill="rgba(255,255,255,0.18)" />
      <rect x="128" y="36" width="70" height="112" rx="8" fill="rgba(255,255,255,0.22)" />
      <rect x="212" y="56" width="84" height="92" rx="8" fill="rgba(255,255,255,0.16)" />
      <circle cx="70" cy="80" r="18" fill="rgba(255,255,255,0.35)" />
      <rect x="40" y="118" width="58" height="10" rx="3" fill="rgba(255,255,255,0.45)" />
    </svg>
  ),
  hero_supermarket: (
    <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect x="20" y="40" width="280" height="110" rx="10" fill="rgba(255,255,255,0.12)" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={36 + i * 52} y="56" width="40" height="78" rx="4" fill="rgba(255,255,255,0.22)" />
      ))}
    </svg>
  ),
  hero_hotel: (
    <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect x="70" y="30" width="180" height="120" rx="8" fill="rgba(255,255,255,0.18)" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <rect
            key={`${r}-${c}`}
            x={90 + c * 48}
            y={48 + r * 32}
            width="28"
            height="20"
            rx="3"
            fill="rgba(255,255,255,0.35)"
          />
        )),
      )}
    </svg>
  ),
  hero_spa: (
    <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" aria-hidden>
      <ellipse cx="160" cy="100" rx="90" ry="40" fill="rgba(255,255,255,0.18)" />
      <circle cx="130" cy="70" r="28" fill="rgba(255,255,255,0.28)" />
      <circle cx="190" cy="70" r="22" fill="rgba(255,255,255,0.22)" />
    </svg>
  ),
  hero_distribution: (
    <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect x="40" y="70" width="120" height="55" rx="8" fill="rgba(255,255,255,0.22)" />
      <rect x="150" y="85" width="90" height="40" rx="6" fill="rgba(255,255,255,0.28)" />
      <circle cx="70" cy="130" r="14" fill="rgba(255,255,255,0.4)" />
      <circle cx="210" cy="130" r="14" fill="rgba(255,255,255,0.4)" />
      <path d="M40 55h60" stroke="rgba(255,255,255,0.5)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  ),
  ill_pos: (
    <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect x="90" y="40" width="140" height="90" rx="10" fill="rgba(255,255,255,0.2)" />
      <rect x="110" y="55" width="100" height="50" rx="4" fill="rgba(255,255,255,0.35)" />
      <rect x="120" y="140" width="80" height="12" rx="4" fill="rgba(255,255,255,0.3)" />
    </svg>
  ),
  ill_stock: (
    <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" aria-hidden>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={60 + i * 70} y={50 + (i % 2) * 10} width="55" height="70" rx="6" fill="rgba(255,255,255,0.22)" />
      ))}
    </svg>
  ),
  ill_finance: (
    <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" aria-hidden>
      <polyline
        points="50,130 100,90 150,105 200,60 260,75"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="260" cy="75" r="8" fill="rgba(255,255,255,0.7)" />
    </svg>
  ),
  ill_hr: (
    <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" aria-hidden>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${70 + i * 70} 55)`}>
          <circle cx="30" cy="22" r="16" fill="rgba(255,255,255,0.35)" />
          <rect x="8" y="48" width="44" height="40" rx="14" fill="rgba(255,255,255,0.25)" />
        </g>
      ))}
    </svg>
  ),
  ill_manager: (
    <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect x="40" y="40" width="240" height="100" rx="10" fill="rgba(255,255,255,0.15)" />
      <rect x="58" y="58" width="70" height="64" rx="6" fill="rgba(255,255,255,0.28)" />
      <rect x="140" y="58" width="120" height="18" rx="4" fill="rgba(255,255,255,0.35)" />
      <rect x="140" y="88" width="100" height="14" rx="4" fill="rgba(255,255,255,0.25)" />
      <rect x="140" y="112" width="80" height="14" rx="4" fill="rgba(255,255,255,0.2)" />
    </svg>
  ),
  ill_hotel: (
    <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect x="50" y="50" width="100" height="90" rx="8" fill="rgba(255,255,255,0.2)" />
      <rect x="170" y="70" width="100" height="70" rx="8" fill="rgba(255,255,255,0.25)" />
      <rect x="70" y="70" width="24" height="18" rx="2" fill="rgba(255,255,255,0.4)" />
      <rect x="108" y="70" width="24" height="18" rx="2" fill="rgba(255,255,255,0.4)" />
    </svg>
  ),
  ill_spa: (
    <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" aria-hidden>
      <path
        d="M160 40c40 30 60 55 60 80a60 60 0 1 1-120 0c0-25 20-50 60-80z"
        fill="rgba(255,255,255,0.22)"
      />
      <circle cx="160" cy="110" r="18" fill="rgba(255,255,255,0.35)" />
    </svg>
  ),
};

function IllustrationArt({ imageKey }) {
  return ILLUSTRATION_SVG[imageKey] || ILLUSTRATION_SVG.ill_manager;
}

export function PortfolioIllustration({ meta, imageKey, className = "" }) {
  const style = illustrationStyle(meta, imageKey);
  const key = imageKey || "ill_manager";
  return (
    <div
      className={`relative overflow-hidden rounded-2xl text-white shadow-sm ${className}`}
      style={{ background: style.background, minHeight: 140 }}
    >
      <div className="absolute inset-0 opacity-25" style={dotPattern} />
      <IllustrationArt imageKey={key} />
      <div className="relative flex h-full min-h-[140px] flex-col justify-end p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">Centrix</p>
        <p className="mt-1 text-lg font-semibold leading-snug">{style.label}</p>
        {style.hint ? <p className="mt-1 text-sm text-white/85">{style.hint}</p> : null}
      </div>
    </div>
  );
}

const dotPattern = {
  backgroundImage: "radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)",
  backgroundSize: "18px 18px",
};

export function PortfolioPreview({ portfolio, meta, className = "" }) {
  const sections = Array.isArray(portfolio?.sections) ? portfolio.sections : [];
  const biz = portfolio?.business_name || portfolio?.prospect_name || "Prospect";

  return (
    <div className={`space-y-6 ${className}`}>
      <header className="space-y-3">
        <PortfolioIllustration
          meta={meta}
          imageKey={portfolio?.hero_image_key || sections[0]?.image_key || "hero_retail"}
          className="min-h-[200px]"
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">Centrix portfolio</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{portfolio?.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Prepared for {biz}
            {portfolio?.location ? ` · ${portfolio.location}` : ""}
            {" · Kenyan Shillings (KES)"}
          </p>
        </div>
      </header>

      {sections.map((section) => (
        <section
          key={section.key || section.title}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="grid gap-0 md:grid-cols-[1.1fr_0.9fr]">
            <div className="p-5 md:p-6">
              <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
              {section.body ? (
                <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {section.body}
                </div>
              ) : (
                <p className="mt-3 text-sm italic text-slate-400">Generate with AI to fill this section.</p>
              )}
              {Array.isArray(section.bullets) && section.bullets.length > 0 ? (
                <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
                  {section.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <PortfolioIllustration
              meta={meta}
              imageKey={section.image_key || portfolio?.hero_image_key || "ill_manager"}
              className="rounded-none md:min-h-full"
            />
          </div>
        </section>
      ))}
    </div>
  );
}
