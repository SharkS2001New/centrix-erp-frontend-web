"use client";

import Link from "next/link";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";

export const EMPTY_OTHER_CONTACT = {
  label: "",
  phone: "",
  email: "",
};

export const EMPTY_SUPPLIER_FORM = {
  supplier_name: "",
  contact_person: "",
  phone: "",
  alternate_phone: "",
  email: "",
  town: "",
  tax_pin: "",
  address: "",
  contacts: [],
  is_active: true,
};

function normalizeContacts(contacts) {
  const list = Array.isArray(contacts) ? contacts : [];
  const cleaned = list
    .map((c) => ({
      label: (c.label ?? "").trim(),
      phone: (c.phone ?? "").trim(),
      email: (c.email ?? "").trim(),
    }))
    .filter((c) => c.label || c.phone || c.email);

  return cleaned.length ? cleaned : null;
}

export function supplierToForm(supplier) {
  return {
    supplier_name: supplier.supplier_name ?? "",
    contact_person: supplier.contact_person ?? "",
    phone: supplier.phone ?? "",
    alternate_phone: supplier.alternate_phone ?? "",
    email: supplier.email ?? "",
    town: supplier.town ?? "",
    tax_pin: supplier.tax_pin ?? "",
    address: supplier.address ?? "",
    contacts:
      Array.isArray(supplier.contacts) && supplier.contacts.length
        ? supplier.contacts.map((c) => ({
            label: c.label ?? "",
            phone: c.phone ?? "",
            email: c.email ?? "",
          }))
        : [],
    is_active: supplier.is_active !== false,
  };
}

export function buildSupplierBody(form) {
  return {
    supplier_name: form.supplier_name.trim(),
    contact_person: form.contact_person.trim() || null,
    phone: form.phone.trim() || null,
    alternate_phone: form.alternate_phone.trim() || null,
    email: form.email.trim() || null,
    town: form.town.trim() || null,
    tax_pin: form.tax_pin.trim() || null,
    address: form.address.trim() || null,
    contacts: normalizeContacts(form.contacts),
    is_active: Boolean(form.is_active),
  };
}

export function SupplierOtherContactsEditor({ contacts, onChange }) {
  const rows = Array.isArray(contacts) ? contacts : [];

  function updateRow(index, key, value) {
    const next = rows.map((row, i) => (i === index ? { ...row, [key]: value } : row));
    onChange(next);
  }

  function addRow() {
    onChange([...rows, { ...EMPTY_OTHER_CONTACT }]);
  }

  function removeRow(index) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="md:col-span-2 xl:col-span-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-slate-500">Other contacts</p>
          <p className="text-xs text-slate-400">
            Additional people at this supplier (e.g. accounts, warehouse).
          </p>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-[#185FA5] hover:bg-slate-50"
        >
          Add contact
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
          No other contacts yet. Use Add contact for extra phone numbers or emails.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, index) => (
            <li
              key={index}
              className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-3"
            >
              <Field label="Role / label">
                <input
                  type="text"
                  value={row.label}
                  onChange={(e) => updateRow(index, "label", e.target.value)}
                  className={inputClassName()}
                  placeholder="Accounts"
                />
              </Field>
              <Field label="Phone">
                <input
                  type="tel"
                  value={row.phone}
                  onChange={(e) => updateRow(index, "phone", e.target.value)}
                  className={inputClassName()}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={row.email}
                  onChange={(e) => updateRow(index, "email", e.target.value)}
                  className={inputClassName()}
                />
              </Field>
              <div className="sm:col-span-3">
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="text-xs font-medium text-red-600 hover:text-red-700"
                >
                  Remove contact
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SupplierFormFields({ form, onChange, supplierCode = null }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 md:grid-cols-2 xl:grid-cols-3">
      {supplierCode != null && (
        <div className="md:col-span-2 xl:col-span-3">
          <Field label="Supplier code">
            <input
              type="text"
              value={supplierCode}
              readOnly
              className={`${inputClassName()} bg-slate-50 font-mono text-slate-500`}
            />
          </Field>
        </div>
      )}

      <Field label="Supplier name">
        <input
          type="text"
          value={form.supplier_name}
          onChange={(e) => onChange("supplier_name", e.target.value)}
          required
          className={inputClassName()}
          placeholder="Coca Cola Beverages"
        />
      </Field>

      <Field label="Contact person">
        <input
          type="text"
          value={form.contact_person}
          onChange={(e) => onChange("contact_person", e.target.value)}
          className={inputClassName()}
          placeholder="John Doe"
        />
      </Field>

      <Field label="Phone">
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => onChange("phone", e.target.value)}
          className={inputClassName()}
          placeholder="0712345678"
        />
      </Field>

      <Field label="Alt. phone">
        <input
          type="tel"
          value={form.alternate_phone}
          onChange={(e) => onChange("alternate_phone", e.target.value)}
          className={inputClassName()}
        />
      </Field>

      <Field label="Email">
        <input
          type="email"
          value={form.email}
          onChange={(e) => onChange("email", e.target.value)}
          className={inputClassName()}
          placeholder="contact@supplier.com"
        />
      </Field>

      <Field label="Town">
        <input
          type="text"
          value={form.town}
          onChange={(e) => onChange("town", e.target.value)}
          className={inputClassName()}
          placeholder="Nairobi"
        />
      </Field>

      <Field label="KRA PIN">
        <input
          type="text"
          value={form.tax_pin}
          onChange={(e) => onChange("tax_pin", e.target.value)}
          className={inputClassName()}
        />
      </Field>

      <SupplierOtherContactsEditor
        contacts={form.contacts}
        onChange={(contacts) => onChange("contacts", contacts)}
      />

      <div className="md:col-span-2 xl:col-span-3">
        <Field label="Physical address">
          <textarea
            value={form.address}
            onChange={(e) => onChange("address", e.target.value)}
            rows={3}
            className={inputClassName()}
          />
        </Field>
      </div>

      <div className="md:col-span-2 xl:col-span-3">
        <fieldset>
          <legend className="mb-2 block text-xs font-medium text-slate-500">Status</legend>
          <div className="flex gap-6 text-sm text-slate-800">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="supplier_status"
                checked={form.is_active}
                onChange={() => onChange("is_active", true)}
              />
              Active
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="supplier_status"
                checked={!form.is_active}
                onChange={() => onChange("is_active", false)}
              />
              Inactive
            </label>
          </div>
        </fieldset>
      </div>
    </div>
  );
}

export function SupplierFormPageShell({ backHref, backLabel, title, subtitle, children }) {
  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      <div className="w-full">
        <div className="mb-6">
          <Link href={backHref} className="text-sm text-[#185FA5] hover:text-[#144f8a]">
            {backLabel}
          </Link>
          <h1 className="mt-2 text-xl font-medium text-slate-900">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

export function SupplierFormCard({ children, onSubmit, actions }) {
  return (
    <form
      onSubmit={onSubmit}
      className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:p-8"
    >
      {children}
      {actions}
    </form>
  );
}
