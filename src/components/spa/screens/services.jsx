"use client";

import { useState } from "react";
import { AppNavLink } from "@/components/layout/app-nav-link";
import { RecordFormActions, RecordFormDialog, useRecordExit } from "@/components/record-form-page";
import { toast } from "@/lib/toast";
import { ksh } from "@/lib/spa/format";
import { isPublicImageUrl, readServicePhoto, serviceImageSrc } from "@/lib/spa/image";
import { useSpa } from "@/lib/spa/store";
import { useAppRouter } from "@/lib/use-app-router";
import { Badge, Button, Empty, Field, MobileFields, PageHeader, SpaFilters, SpaSelect, Table, inputClass, primaryLinkClass, toOptions } from "@/components/spa/ui";

const CATEGORIES = ["Haircut", "Beard Trim", "Hair Coloring", "Facial Treatment", "Massage", "Manicure", "Pedicure"];

export function ServicesScreen() {
  const spa = useSpa();
  const router = useAppRouter();
  const [category, setCategory] = useState("All");
  const rows = spa.services.filter((item) => category === "All" || item.category === category);

  return (
    <div>
      <PageHeader title="Services" detail="Prices, duration, who can perform them, and commission.">
        <AppNavLink href="/spa/services/new" className={primaryLinkClass}>Add service</AppNavLink>
      </PageHeader>
      <SpaFilters>
        <SpaSelect toolbar aria-label="Service category" value={category} onChange={(event) => setCategory(event.target.value)} options={toOptions(["All", ...CATEGORIES])} />
      </SpaFilters>
      <Table columns={["Service", "Category", "Price", "Duration", "Commission", "Status", ""]} rows={rows} rowKey={(service) => service.id} onCreate={() => router.push("/spa/services/new")} createLabel="Add service" card={(service) => (
        <>
          <div className="flex items-center gap-3">
            <ServiceThumb src={serviceImageSrc(service)} />
            <div className="min-w-0">
              <p className="font-semibold">{service.name}{service.combo ? " · combo" : ""}</p>
              <p className="theme-subtext text-sm">{service.category}</p>
            </div>
          </div>
          <MobileFields rows={[{ label: "Price", value: ksh(service.price) }, { label: "Duration", value: `${service.duration} min` }, { label: "Commission", value: `${service.commission}%` }]} />
          <div className="mt-3 flex items-center justify-between gap-2">
            <Badge tone={service.active ? "green" : "slate"}>{service.active ? "Active" : "Inactive"}</Badge>
            <AppNavLink className="text-sm font-medium text-[var(--theme-accent-text)]" href={`/spa/services/${service.id}/edit`}>Edit</AppNavLink>
          </div>
        </>
      )} render={(service) => (
        <tr key={service.id} className="border-b border-slate-50">
          <td className="px-4 py-3 font-medium">
            <span className="flex items-center gap-3">
              <ServiceThumb src={serviceImageSrc(service)} />
              <span>{service.name}{service.combo ? " · combo" : ""}</span>
            </span>
          </td>
          <td className="px-4 py-3">{service.category}</td>
          <td className="px-4 py-3">{ksh(service.price)}</td>
          <td className="px-4 py-3">{service.duration} min</td>
          <td className="px-4 py-3">{service.commission}%</td>
          <td className="px-4 py-3"><Badge tone={service.active ? "green" : "slate"}>{service.active ? "Active" : "Inactive"}</Badge></td>
          <td className="px-4 py-3 text-right"><AppNavLink className="text-sm font-medium text-[var(--theme-accent-text)]" href={`/spa/services/${service.id}/edit`}>Edit</AppNavLink></td>
        </tr>
      )} />
    </div>
  );
}

function blankService() {
  return { name: "", category: "Haircut", price: 500, duration: 30, staffIds: [], commission: 10, active: true, combo: false, image: "", imageUrl: "" };
}

function ServiceThumb({ src, large = false }) {
  const size = large ? "h-28 w-28 rounded-xl text-xs" : "h-10 w-10 rounded-lg text-[10px]";
  if (!src) {
    return <span className={`theme-subtext grid shrink-0 place-items-center bg-[var(--theme-surface-muted)] ${size}`}>Photo</span>;
  }
  return <img src={src} alt="" className={`shrink-0 object-cover ${size}`} />;
}

function FormBlock({ title, detail, children }) {
  return (
    <section className="theme-panel rounded-xl border p-4 shadow-sm sm:p-5">
      <h2 className="theme-heading text-sm font-semibold">{title}</h2>
      {detail ? <p className="theme-subtext mt-1 text-sm">{detail}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Choice({ checked, onChange, label, detail }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--theme-border)] px-3 py-2.5">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={onChange} />
      <span>
        <span className="theme-heading block text-sm font-medium">{label}</span>
        {detail ? <span className="theme-subtext mt-0.5 block text-xs">{detail}</span> : null}
      </span>
    </label>
  );
}

export function ServiceFormScreen({ id }) {
  const spa = useSpa();
  const existing = id ? spa.services.find((item) => item.id === id) : null;
  const title = id ? "Edit service" : "Add service";
  const { exitTo } = useRecordExit(title);
  const service = existing || blankService();
  const [form, setForm] = useState(service);
  const [source, setSource] = useState(service.imageUrl ? "url" : "upload");
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value }));
  async function onPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const image = await readServicePhoto(file);
      setForm((current) => ({ ...current, image, imageUrl: "" }));
      setSource("upload");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not use that photo.");
    }
  }
  function persist(next) {
    const error = spa.saveService(next);
    if (error) toast.error(error);
    else {
      toast.success("Service saved.");
      exitTo("/spa/services");
    }
  }
  function save(event) {
    event.preventDefault();
    if (id && !existing) return;
    if (source === "url") {
      if (!isPublicImageUrl(form.imageUrl)) {
        toast.error("Enter a public http or https image URL.");
        return;
      }
      persist({ ...form, imageUrl: String(form.imageUrl).trim(), image: "" });
      return;
    }
    persist({ ...form, imageUrl: "" });
  }
  const preview = source === "url" ? serviceImageSrc({ imageUrl: form.imageUrl }) : serviceImageSrc(form);
  if (id && !existing) return <Empty title="Service not found" detail="It may have been removed from this browser's sample data." />;
  return (
    <>
    <ServicesScreen />
    <RecordFormDialog
      title={title}
      subtitle="Price, duration, photo, and who can perform this service."
      backHref="/spa/services"
    >
      <form onSubmit={save} className="space-y-4">
        <FormBlock title="Photo" detail="Shown on the service list and on the till.">
          <div className="flex flex-col items-start gap-4 sm:flex-row">
            <ServiceThumb src={preview} large />
            <div className="min-w-0 flex-1">
              <div className="inline-flex max-w-full flex-wrap rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-0.5">
                <button type="button" className={`rounded-md px-3 py-1.5 text-sm font-medium ${source === "upload" ? "theme-primary-btn" : "theme-subtext"}`} onClick={() => setSource("upload")}>Upload file</button>
                <button type="button" className={`rounded-md px-3 py-1.5 text-sm font-medium ${source === "url" ? "theme-primary-btn" : "theme-subtext"}`} onClick={() => setSource("url")}>Image URL</button>
              </div>
              {source === "upload" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="theme-secondary-btn cursor-pointer rounded-lg px-3 py-2 text-sm font-medium">
                    {form.image ? "Change photo" : "Add photo"}
                    <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} />
                  </label>
                  {form.image ? <Button variant="ghost" onClick={() => setForm((current) => ({ ...current, image: "" }))}>Remove photo</Button> : null}
                </div>
              ) : (
                <div className="mt-3 w-full">
                  <input className={inputClass} type="url" value={form.imageUrl || ""} placeholder="https://example.com/haircut.jpg" onChange={set("imageUrl")} />
                  <p className="theme-subtext mt-1 text-xs">Paste a direct image link. Centrix downloads and stores a copy when this salon loads.</p>
                </div>
              )}
            </div>
          </div>
        </FormBlock>

        <FormBlock title="Service details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><input className={inputClass} value={form.name} onChange={set("name")} required /></Field>
            <Field label="Category"><SpaSelect value={form.category} onChange={set("category")} options={toOptions(CATEGORIES)} /></Field>
            <Field label="Price (KSh)"><input className={inputClass} type="number" min="0" value={form.price} onChange={set("price")} /></Field>
            <Field label="Duration (minutes)"><input className={inputClass} type="number" min="5" value={form.duration} onChange={set("duration")} /></Field>
            <Field label="Commission %"><input className={inputClass} type="number" min="0" max="100" value={form.commission} onChange={set("commission")} /></Field>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Choice checked={form.active !== false} onChange={set("active")} label="Active" detail="Offered on the till and in appointments." />
            {spa.features.combos ? <Choice checked={Boolean(form.combo)} onChange={set("combo")} label="Service combo" detail="Several treatments sold as one service." /> : null}
          </div>
        </FormBlock>

        <FormBlock title="Assigned staff" detail="Only the people checked here can be booked for this service.">
          {spa.staff.length === 0 ? (
            <p className="theme-subtext text-sm">No staff yet. Add them under Staff, then assign them here.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {spa.staff.map((person) => (
                <label key={person.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--theme-border)] px-3 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={(form.staffIds || []).includes(person.id)}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      staffIds: event.target.checked ? [...(current.staffIds || []), person.id] : (current.staffIds || []).filter((staffId) => staffId !== person.id),
                    }))}
                  />
                  <span className="theme-heading font-medium">{person.name}</span>
                </label>
              ))}
            </div>
          )}
        </FormBlock>

        <RecordFormActions backHref="/spa/services" />
      </form>
    </RecordFormDialog>
    </>
  );
}
