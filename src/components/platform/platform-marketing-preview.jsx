"use client";

import { illustrationStyle } from "@/lib/platform-marketing";

export function PortfolioIllustration({ meta, imageKey, className = "" }) {
  const style = illustrationStyle(meta, imageKey);
  return (
    <div
      className={`relative overflow-hidden rounded-2xl text-white shadow-sm ${className}`}
      style={{ background: style.background, minHeight: 140 }}
    >
      <div className="absolute inset-0 opacity-30" style={dotPattern} />
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
          className="min-h-[180px]"
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
