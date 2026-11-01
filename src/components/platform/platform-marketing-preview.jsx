"use client";

import Image from "next/image";
import { illustrationStyle, portfolioFontCss } from "@/lib/platform-marketing";
import { resolveCustomerMediaUrl } from "@/lib/api";

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

export function PortfolioIllustration({ meta, imageKey, imageUrl, className = "" }) {
  const style = illustrationStyle(meta, imageKey);
  const key = imageKey || "ill_manager";
  return (
    <div
      className={`relative overflow-hidden rounded-2xl text-white ${className}`}
      style={{ background: style.background, minHeight: 140 }}
    >
      {imageUrl ? (
        <Image src={imageUrl} alt="" fill sizes="100vw" unoptimized className="object-cover" />
      ) : (
        <>
          <div className="absolute inset-0 opacity-25" style={dotPattern} />
          <IllustrationArt imageKey={key} />
          <div className="relative flex h-full min-h-[140px] flex-col justify-end p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">Centrix</p>
            <p className="mt-1 text-lg font-semibold leading-snug">{style.label}</p>
            {style.hint ? <p className="mt-1 text-sm text-white/85">{style.hint}</p> : null}
          </div>
        </>
      )}
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
  const template = portfolio?.template_key || "modern";
  const colors = template === "editorial"
    ? { accent: "#173B3F", secondary: "#A66B42", paper: "#F6F4EF" }
    : template === "bold"
      ? { accent: "#382274", secondary: "#E86A33", paper: "#F4F1FA" }
      : { accent: "#185FA5", secondary: "#16A085", paper: "#F3F7FA" };
  const cover = sections.find((section) => section.key === "cover");
  const coverUrl = resolveCustomerMediaUrl(cover?.image_path) || resolveCustomerMediaUrl(cover?.image_url);

  return (
    <article
      className={`mx-auto max-w-5xl space-y-5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:p-8 ${className}`}
      style={{
        "--portfolio-accent": colors.accent,
        "--portfolio-secondary": colors.secondary,
        fontFamily: portfolioFontCss(portfolio?.font_family),
      }}
    >
      <header className="overflow-hidden rounded-2xl" style={{ backgroundColor: colors.paper }}>
        <PortfolioIllustration
          meta={meta}
          imageKey={cover?.image_key || portfolio?.hero_image_key || "hero_retail"}
          imageUrl={coverUrl}
          className="min-h-[280px] rounded-none sm:min-h-[340px]"
        />
        <div className="px-5 py-5 sm:px-8 sm:py-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: colors.accent }}>Centrix ERP · Business portfolio</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{portfolio?.title}</h1>
          <p className="mt-2 text-sm text-slate-600">
            Prepared for {biz}
            {portfolio?.location ? ` · ${portfolio.location}` : ""}
            {" · Kenyan Shillings (KES)"}
          </p>
        </div>
      </header>

      {sections.filter((section) => section.key !== "cover").map((section, index) => (
        <section
          key={section.key || section.title}
          className={`overflow-hidden rounded-2xl border border-slate-200 ${template === "bold" ? "border-l-4" : ""}`}
          style={{ background: template === "editorial" ? "#fff" : colors.paper, borderLeftColor: colors.accent }}
        >
          <div className={`grid gap-5 p-5 md:items-center md:gap-8 md:p-7 ${index % 2 ? "md:grid-cols-[0.9fr_1.1fr]" : "md:grid-cols-[1.1fr_0.9fr]"}`}>
            <div className={index % 2 ? "md:order-2" : ""}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: colors.secondary }}>
                {String(index + 1).padStart(2, "0")}
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{section.title}</h2>
              {section.body ? (
                <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {section.body}
                </div>
              ) : (
                <p className="mt-3 text-sm italic text-slate-400">Generate with AI to fill this section.</p>
              )}
              {Array.isArray(section.bullets) && section.bullets.length > 0 ? (
                <ul className="mt-4 space-y-2 text-sm text-slate-700">
                  {section.bullets.map((b) => (
                    <li key={b} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colors.secondary }} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <PortfolioIllustration
              meta={meta}
              imageKey={section.image_key || portfolio?.hero_image_key || "ill_manager"}
              imageUrl={resolveCustomerMediaUrl(section.image_path) || resolveCustomerMediaUrl(section.image_url)}
              className={`min-h-[220px] md:min-h-[260px] ${index % 2 ? "md:order-1" : ""}`}
            />
          </div>
        </section>
      ))}
      <footer className="border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
        Centrix ERP · Kenya · Prepared for {biz}
      </footer>
    </article>
  );
}
