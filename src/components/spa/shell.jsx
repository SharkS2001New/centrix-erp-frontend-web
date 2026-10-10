"use client";

import { Button } from "@/components/spa/ui";

export function BusinessChooser({ onChoose }) {
  const options = [
    { id: "spa", title: "Centrix SPA", detail: "Therapist scheduling, treatment rooms, packages and session tracking." },
    { id: "kinyozi", title: "Centrix Kinyozi", detail: "Walk-in checkout, barber assignment, chairs and service combos." },
    { id: "combined", title: "SPA & Kinyozi", detail: "One shop with both treatment rooms and barber chairs." },
  ];
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="w-full max-w-4xl">
        <p className="text-center text-sm font-medium text-[var(--theme-accent-text)]">Business type</p>
        <h1 className="theme-heading mt-2 text-center text-2xl font-medium">How does this branch work?</h1>
        <p className="theme-subtext mx-auto mt-2 max-w-xl text-center text-sm">This choice turns on the tools that match the shop. You can change it later in Administration → SPA & Kinyozi.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {options.map((option) => (
            <article key={option.id} className="theme-panel flex flex-col rounded-xl border p-5 shadow-sm">
              <h2 className="theme-heading text-lg font-semibold">{option.title}</h2>
              <p className="theme-subtext mt-2 flex-1 text-sm">{option.detail}</p>
              <Button className="mt-5" onClick={() => onChoose(option.id)}>Select</Button>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
