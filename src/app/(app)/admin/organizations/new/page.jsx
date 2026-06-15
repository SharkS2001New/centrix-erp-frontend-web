"use client";

import { useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-[#185FA5] focus:ring-1 focus:ring-[#185FA5]";

function Field({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export default function ProvisionOrganizationPage() {
  const [companyCode, setCompanyCode] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgEmail, setOrgEmail] = useState("");
  const [primaryTel, setPrimaryTel] = useState("");
  const [orgAddress, setOrgAddress] = useState("");
  const [orgPin, setOrgPin] = useState("");
  const [vatRegno, setVatRegno] = useState("");
  const [deploymentProfile, setDeploymentProfile] = useState("wholesale_retail");
  const [managerUsername, setManagerUsername] = useState("admin");
  const [managerEmail, setManagerEmail] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [managerFullName, setManagerFullName] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);

    try {
      const res = await apiRequest("/admin/organizations/provision", {
        method: "POST",
        body: {
          company_code: companyCode.toUpperCase(),
          org_name: orgName,
          org_email: orgEmail,
          primary_tel: primaryTel,
          org_address: orgAddress,
          org_pin: orgPin || null,
          vat_regno: vatRegno || null,
          deployment_profile: deploymentProfile,
          admin_username: managerUsername,
          admin_email: managerEmail,
          admin_password: managerPassword,
          admin_full_name: managerFullName,
        },
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create organization.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CatalogPageShell
      title="Provision organization"
      subtitle="Create a new tenant organization and its manager account. The manager signs in with the company code and manages staff."
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Provision organization" },
        ]}
      />

        {result ? (
          <div className="mt-6 max-w-2xl rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
            <h2 className="text-base font-semibold text-emerald-950">Organization created</h2>
            <p className="mt-2">{result.message}</p>
            <dl className="mt-4 space-y-2">
              <div>
                <dt className="font-medium">Company code</dt>
                <dd className="font-mono">{result.organization?.company_code}</dd>
              </div>
              <div>
                <dt className="font-medium">Organization</dt>
                <dd>{result.organization?.org_name}</dd>
              </div>
              <div>
                <dt className="font-medium">Manager username</dt>
                <dd className="font-mono">{result.manager?.username}</dd>
              </div>
            </dl>
            <p className="mt-4 text-emerald-800">
              Share the manager username and password securely. They sign in with organization code{" "}
              <strong>{result.organization?.company_code}</strong> on the same application URL.
            </p>
            <div className="mt-6 flex gap-3">
              <PrimaryButton type="button" onClick={() => setResult(null)}>
                Create another
              </PrimaryButton>
              <Link
                href="/admin"
                className="inline-flex items-center rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
              >
                Back to admin
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 max-w-3xl space-y-8">
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#185FA5]">
                Organization details
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Company code *">
                  <input
                    className={`${inputClass} uppercase`}
                    value={companyCode}
                    onChange={(e) => setCompanyCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                    placeholder="e.g. ACME"
                    required
                  />
                </Field>
                <Field label="Company name *">
                  <input
                    className={inputClass}
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Email *">
                  <input
                    type="email"
                    className={inputClass}
                    value={orgEmail}
                    onChange={(e) => setOrgEmail(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Telephone *">
                  <input
                    className={inputClass}
                    value={primaryTel}
                    onChange={(e) => setPrimaryTel(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Physical address *" className="sm:col-span-2">
                  <input
                    className={inputClass}
                    value={orgAddress}
                    onChange={(e) => setOrgAddress(e.target.value)}
                    required
                  />
                </Field>
                <Field label="KRA PIN (optional)">
                  <input
                    className={`${inputClass} uppercase`}
                    value={orgPin}
                    onChange={(e) => setOrgPin(e.target.value)}
                  />
                </Field>
                <Field label="VAT reg no (optional)">
                  <input className={inputClass} value={vatRegno} onChange={(e) => setVatRegno(e.target.value)} />
                </Field>
                <Field label="Deployment profile *" className="sm:col-span-2">
                  <select
                    className={inputClass}
                    value={deploymentProfile}
                    onChange={(e) => setDeploymentProfile(e.target.value)}
                    required
                  >
                    <option value="small_shop">Small shop (backend sales only)</option>
                    <option value="wholesale_retail">Wholesale & retail (full stack)</option>
                    <option value="distribution">Distribution (warehouse & routes)</option>
                  </select>
                </Field>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#185FA5]">
                Manager account
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                This user is the organization administrator. They sign in and create staff at Admin → Users.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Full name *">
                  <input
                    className={inputClass}
                    value={managerFullName}
                    onChange={(e) => setManagerFullName(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Username *">
                  <input
                    className={inputClass}
                    value={managerUsername}
                    onChange={(e) => setManagerUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                    required
                  />
                </Field>
                <Field label="Email *">
                  <input
                    type="email"
                    className={inputClass}
                    value={managerEmail}
                    onChange={(e) => setManagerEmail(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Password *">
                  <input
                    type="password"
                    className={inputClass}
                    value={managerPassword}
                    onChange={(e) => setManagerPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </Field>
              </div>
            </section>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
            ) : null}

            <div className="flex gap-3">
              <PrimaryButton type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create organization"}
              </PrimaryButton>
              <Link
                href="/admin"
                className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Link>
            </div>
          </form>
        )}
      </CatalogPageShell>
  );
}
