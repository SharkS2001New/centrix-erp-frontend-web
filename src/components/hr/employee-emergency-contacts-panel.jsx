"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, ApiError } from "@/lib/api";
import { P } from "@/lib/permission-codes";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  createEmptyEmergencyContact,
  createEmptyNextOfKin,
  emergencyContactsToForm,
  nextOfKinToForm,
  validateEmergencyContacts,
  validateNextOfKin,
} from "@/components/hr/hr-shared";
import {
  syncEmployeeEmergencyContacts,
  syncEmployeeNextOfKin,
} from "@/components/hr/employee-form";

function DetailRow({ label, value }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-900">{value || "—"}</dd>
    </div>
  );
}

export function EmployeeEmergencyContactsPanel({ employeeId, employee, onUpdated }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(P.hr.manage);

  const [editing, setEditing] = useState(false);
  const [emergencyContacts, setEmergencyContacts] = useState([]);
  const [nextOfKin, setNextOfKin] = useState(createEmptyNextOfKin());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const resetFromEmployee = useCallback((emp) => {
    setEmergencyContacts(emergencyContactsToForm(emp?.emergency_contacts ?? emp?.emergencyContacts));
    setNextOfKin(nextOfKinToForm(emp?.next_of_kin ?? emp?.nextOfKin));
    setFieldErrors({});
    setError(null);
  }, []);

  useEffect(() => {
    resetFromEmployee(employee);
  }, [employee, resetFromEmployee]);

  function updateContact(index, patch) {
    setEmergencyContacts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function addContact() {
    setEmergencyContacts((prev) => [...prev, createEmptyEmergencyContact()]);
  }

  function removeContact(index) {
    setEmergencyContacts((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) return [createEmptyEmergencyContact({ isPrimary: true })];
      if (!next.some((c) => c.is_primary)) next[0] = { ...next[0], is_primary: true };
      return next;
    });
  }

  function setPrimary(index) {
    setEmergencyContacts((prev) => prev.map((c, i) => ({ ...c, is_primary: i === index })));
  }

  async function save() {
    const errors = {
      ...validateEmergencyContacts(emergencyContacts),
      ...validateNextOfKin(nextOfKin),
    };
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setError(null);
    try {
      await syncEmployeeEmergencyContacts(employeeId, emergencyContacts);
      await syncEmployeeNextOfKin(employeeId, nextOfKin);
      const refreshed = await apiRequest(`/employees/${employeeId}`);
      onUpdated?.(refreshed);
      resetFromEmployee(refreshed);
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const contacts = employee?.emergency_contacts ?? employee?.emergencyContacts ?? [];
  const primaryEmergency = contacts.find((c) => c.is_primary) ?? contacts[0];
  const nok = employee?.next_of_kin ?? employee?.nextOfKin;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-medium text-slate-900">Emergency & next of kin</h2>
          <p className="mt-0.5 text-xs text-slate-500">Contacts for emergencies and beneficiary records.</p>
        </div>
        {canManage && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-[#185FA5] hover:text-[#144f8a]"
          >
            Edit
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {!editing ? (
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="mb-2 text-slate-500">Emergency contacts</dt>
            {contacts.length === 0 ? (
              <dd className="text-slate-600">—</dd>
            ) : (
              <dd className="space-y-3">
                {contacts.map((c) => (
                  <div key={c.id} className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="font-medium text-slate-900">
                      {c.is_primary ? "★ " : ""}
                      {c.full_name}
                      {c.relationship ? ` (${c.relationship})` : ""}
                    </p>
                    <p className="text-slate-600">{c.phone}</p>
                    {c.email ? <p className="text-slate-600">{c.email}</p> : null}
                    {c.address ? <p className="text-slate-500">{c.address}</p> : null}
                  </div>
                ))}
              </dd>
            )}
          </div>
          <DetailRow
            label="Next of kin"
            value={
              nok?.full_name
                ? `${nok.full_name}${nok.relationship ? ` (${nok.relationship})` : ""} · ${nok.phone}${nok.national_id ? ` · ID ${nok.national_id}` : ""}${nok.address ? ` · ${nok.address}` : ""}`
                : "—"
            }
          />
          {!canManage && contacts.length === 0 && !nok?.full_name ? (
            <p className="text-xs text-slate-500">
              No contacts on file.{" "}
              <Link href={`/hr/employees/${employeeId}/edit`} className="text-[#185FA5] hover:underline">
                Edit employee
              </Link>{" "}
              to add them.
            </p>
          ) : null}
        </dl>
      ) : (
        <div className="mt-4 space-y-6">
          <div className="space-y-4">
            {emergencyContacts.map((contact, index) => (
              <div key={contact._key ?? index} className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">Contact {index + 1}</span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input
                        type="radio"
                        name="panel_emergency_primary"
                        checked={!!contact.is_primary}
                        onChange={() => setPrimary(index)}
                      />
                      Primary
                    </label>
                    {emergencyContacts.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeContact(index)}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Full name">
                    <input
                      className={inputClassName()}
                      value={contact.full_name}
                      onChange={(e) => updateContact(index, { full_name: e.target.value })}
                    />
                    {fieldErrors[`emergency_${index}_full_name`] ? (
                      <p className="mt-1 text-xs text-red-600">{fieldErrors[`emergency_${index}_full_name`]}</p>
                    ) : null}
                  </Field>
                  <Field label="Relationship">
                    <input
                      className={inputClassName()}
                      value={contact.relationship}
                      onChange={(e) => updateContact(index, { relationship: e.target.value })}
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      className={inputClassName()}
                      value={contact.phone}
                      onChange={(e) => updateContact(index, { phone: e.target.value })}
                    />
                    {fieldErrors[`emergency_${index}_phone`] ? (
                      <p className="mt-1 text-xs text-red-600">{fieldErrors[`emergency_${index}_phone`]}</p>
                    ) : null}
                  </Field>
                  <Field label="Email">
                    <input
                      className={inputClassName()}
                      value={contact.email}
                      onChange={(e) => updateContact(index, { email: e.target.value })}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Address">
                      <input
                        className={inputClassName()}
                        value={contact.address}
                        onChange={(e) => updateContact(index, { address: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addContact}
              className="text-sm font-medium text-[#185FA5] hover:text-[#144f8a]"
            >
              + Add contact
            </button>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-medium text-slate-900">Next of kin</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Full name">
                <input
                  className={inputClassName()}
                  value={nextOfKin.full_name}
                  onChange={(e) => setNextOfKin((p) => ({ ...p, full_name: e.target.value }))}
                />
                {fieldErrors.nok_full_name ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.nok_full_name}</p>
                ) : null}
              </Field>
              <Field label="Relationship">
                <input
                  className={inputClassName()}
                  value={nextOfKin.relationship}
                  onChange={(e) => setNextOfKin((p) => ({ ...p, relationship: e.target.value }))}
                />
              </Field>
              <Field label="Phone">
                <input
                  className={inputClassName()}
                  value={nextOfKin.phone}
                  onChange={(e) => setNextOfKin((p) => ({ ...p, phone: e.target.value }))}
                />
                {fieldErrors.nok_phone ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.nok_phone}</p>
                ) : null}
              </Field>
              <Field label="National ID">
                <input
                  className={inputClassName()}
                  value={nextOfKin.national_id}
                  onChange={(e) => setNextOfKin((p) => ({ ...p, national_id: e.target.value }))}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Address">
                  <input
                    className={inputClassName()}
                    value={nextOfKin.address}
                    onChange={(e) => setNextOfKin((p) => ({ ...p, address: e.target.value }))}
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#144f8a] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save contacts"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                resetFromEmployee(employee);
                setEditing(false);
              }}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
