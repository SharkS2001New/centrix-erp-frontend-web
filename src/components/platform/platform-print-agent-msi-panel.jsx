"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiRequest, apiUploadForm, ApiError } from "@/lib/api";
import {
  PrimaryButton,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { PasswordInput } from "@/components/auth/password-input";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const emptyForm = {
  object_key: "print-agent/CentrixPrintAgent.msi",
  public_url: "",
  github_repo: "",
  github_ref: "main",
  workflow_file: "build-print-agent-msi.yml",
  github_token: "",
};

function looksLikeGithubToken(value) {
  return /^(ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)/i.test(String(value ?? "").trim());
}

function isValidGithubRepo(value) {
  const repo = String(value ?? "").trim();
  if (!repo || looksLikeGithubToken(repo)) return false;
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo);
}

export function PlatformPrintAgentMsiPanel() {
  const fileRef = useRef(null);
  const [form, setForm] = useState(emptyForm);
  const [tokenHint, setTokenHint] = useState("");
  const [tokenSet, setTokenSet] = useState(false);
  const [effective, setEffective] = useState(null);
  const [hints, setHints] = useState(null);
  const [meta, setMeta] = useState({
    last_build_status: "",
    last_build_at: "",
    last_build_message: "",
    last_upload_at: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [building, setBuilding] = useState(false);
  const [uploading, setUploading] = useState(false);

  const applyPayload = useCallback((payload) => {
    const settings = payload?.settings ?? {};
    const repo = settings.github_repo || "";
    setForm({
      object_key: settings.object_key || emptyForm.object_key,
      public_url: settings.public_url || "",
      github_repo: looksLikeGithubToken(repo) ? "" : repo,
      github_ref: settings.github_ref || "main",
      workflow_file: settings.workflow_file || "build-print-agent-msi.yml",
      github_token: "",
    });
    setTokenSet(Boolean(settings.github_token_set || payload?.effective?.github_token_set));
    setTokenHint(settings.github_token_hint || "");
    setEffective(payload?.effective ?? null);
    setHints(payload?.hints ?? null);
    setMeta({
      last_build_status: settings.last_build_status || "",
      last_build_at: settings.last_build_at || "",
      last_build_message: settings.last_build_message || "",
      last_upload_at: settings.last_upload_at || "",
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/print-agent-msi", { loading: false });
      applyPayload(res);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load Print Agent MSI settings.");
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildBody() {
    const body = {
      object_key: form.object_key.trim(),
      public_url: form.public_url.trim(),
      github_repo: form.github_repo.trim(),
      github_ref: form.github_ref.trim() || "main",
      workflow_file: form.workflow_file.trim() || "build-print-agent-msi.yml",
    };
    const token = form.github_token.trim();
    if (token && !token.startsWith("••••")) {
      body.github_token = token;
    }
    return body;
  }

  function validateBeforeSave() {
    if (looksLikeGithubToken(form.github_repo)) {
      notifyError(
        "GitHub repo must be owner/name (e.g. acme/centrix-erp-frontend-web). Move the token into the GitHub token field.",
      );
      return false;
    }
    if (form.github_repo.trim() && !isValidGithubRepo(form.github_repo)) {
      notifyError("GitHub repo must look like owner/repository.");
      return false;
    }
    return true;
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!validateBeforeSave()) return;
    setSaving(true);
    try {
      const res = await apiRequest("/admin/print-agent-msi", {
        method: "PUT",
        body: buildBody(),
        loading: false,
      });
      applyPayload(res);
      notifySuccess("Print Agent MSI settings saved.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleBuild() {
    if (!validateBeforeSave()) return;
    setBuilding(true);
    try {
      await apiRequest("/admin/print-agent-msi", {
        method: "PUT",
        body: buildBody(),
        loading: false,
      });
      const res = await apiRequest("/admin/print-agent-msi/build", {
        method: "POST",
        loading: false,
      });
      if (res?.settings) applyPayload(res.settings);
      else await load();
      notifySuccess(res?.message || "MSI build queued on GitHub Actions.", { duration: 9000 });
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not start MSI build.");
      void load();
    } finally {
      setBuilding(false);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await apiRequest("/admin/print-agent-msi", {
        method: "PUT",
        body: buildBody(),
        loading: false,
      });
      const res = await apiUploadForm("/admin/print-agent-msi/upload", { file }, "file");
      if (res?.settings) applyPayload(res.settings);
      notifySuccess(res?.message || "MSI uploaded to R2.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "MSI upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function fillDerivedUrl() {
    const base = String(effective?.r2_public_url || "").replace(/\/$/, "");
    const key = form.object_key.trim().replace(/^\//, "");
    if (!base || !key) {
      notifyError("Set Cloudflare R2 public URL (Platform → Cloudflare R2) and an object key first.");
      return;
    }
    if (base.includes("r2.cloudflarestorage.com")) {
      notifyError(
        "Platform → Cloudflare R2 “Public URL” is still the S3 API host. Set it to your public r2.dev (or custom domain) base, then click Fill again.",
      );
      return;
    }
    updateField("public_url", `${base}/${key}`);
  }

  const checklist = [
    {
      ok: Boolean(effective?.r2_configured),
      label: "Cloudflare R2 configured",
      detail: (
        <>
          <Link href="/platform/settings?tab=r2" className="font-medium underline">
            Platform → Cloudflare R2
          </Link>
        </>
      ),
    },
    {
      ok: Boolean(tokenSet || form.github_token.trim()),
      label: "GitHub token",
      detail: "PAT with workflow scope — paste below (or API env PRINT_AGENT_MSI_GITHUB_TOKEN)",
    },
    {
      ok: isValidGithubRepo(form.github_repo),
      label: "GitHub repo owner/name",
      detail: "e.g. your-org/centrix-erp-frontend-web — not a ghp_ token",
    },
    {
      ok: Boolean(effective?.public_url_ok || (form.public_url.trim() && !form.public_url.includes("r2.cloudflarestorage.com"))),
      label: "Public MSI download URL",
      detail: "Full https://…/print-agent/CentrixPrintAgent.msi link (r2.dev / CDN), not the API endpoint alone",
    },
  ];

  const buildReady = Boolean(effective?.r2_configured && effective?.build_configured);
  const missing = Array.isArray(effective?.missing) ? effective.missing : [];

  if (loading) {
    return <p className="text-sm text-slate-500">Loading Print Agent MSI settings…</p>;
  }

  return (
    <form onSubmit={handleSave} className="theme-panel space-y-5 rounded-xl border p-5 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Print Agent Windows MSI</h2>
        <p className="mt-1 text-xs text-slate-500">
          Host the till installer on the same Cloudflare R2 bucket as MySQL backups. Tills download from the public
          URL below.{" "}
          <Link href="/platform/settings?tab=r2" className="font-medium text-[#185FA5] hover:underline">
            R2 credentials
          </Link>
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm font-medium text-slate-800">Setup checklist</p>
        <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
          {checklist.map((item) => (
            <li key={item.label} className="flex gap-2">
              <span className={item.ok ? "text-emerald-600" : "text-amber-700"} aria-hidden>
                {item.ok ? "✓" : "○"}
              </span>
              <span>
                <span className="font-medium">{item.label}</span>
                <span className="text-slate-500"> — {item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        {missing.length > 0 ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-950">
            Still needed: {missing.join(" · ")}
          </p>
        ) : (
          <p className="mt-2 text-xs text-emerald-800">All set — you can build or upload the MSI.</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-slate-700">R2 object path</span>
          <input
            className={`${inputClass} mt-1 font-mono text-xs`}
            value={form.object_key}
            onChange={(e) => updateField("object_key", e.target.value)}
            placeholder="print-agent/CentrixPrintAgent.msi"
          />
          <span className="mt-1 block text-xs text-slate-500">{hints?.path}</span>
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="flex flex-wrap items-center justify-between gap-2 font-medium text-slate-700">
            Public download URL
            <button type="button" className="text-xs font-normal text-[#185FA5] hover:underline" onClick={fillDerivedUrl}>
              Fill from R2 public URL + path
            </button>
          </span>
          <input
            className={`${inputClass} mt-1 font-mono text-xs`}
            value={form.public_url}
            onChange={(e) => updateField("public_url", e.target.value)}
            placeholder="https://pub-….r2.dev/print-agent/CentrixPrintAgent.msi"
          />
          <span className="mt-1 block text-xs text-slate-500">{hints?.url}</span>
        </label>
      </div>

      {effective?.public_url && effective?.public_url_ok ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          Active download URL:{" "}
          <a href={effective.public_url} className="break-all font-medium underline" target="_blank" rel="noreferrer">
            {effective.public_url}
          </a>
        </p>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          No usable public MSI URL yet. In Cloudflare, enable a public{" "}
          <code className="rounded bg-white px-1">r2.dev</code> domain (or custom domain) for the bucket, put that base
          in Platform → Cloudflare R2 → Public URL, then click <strong>Fill from R2 public URL + path</strong>.
        </p>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm font-medium text-slate-800">Build & upload</p>
        <p className="mt-1 text-xs text-slate-500">{hints?.build}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs sm:col-span-2">
            <span className="font-medium text-slate-600">GitHub token (PAT)</span>
            <PasswordInput
              autoComplete="off"
              className={`${inputClass} mt-1 font-mono`}
              value={form.github_token}
              onChange={(e) => updateField("github_token", e.target.value)}
              placeholder={tokenSet ? tokenHint || "•••• token saved — leave blank to keep" : "ghp_… or github_pat_…"}
            />
            <span className="mt-1 block text-xs text-slate-500">{hints?.token}</span>
          </label>
          <label className="block text-xs sm:col-span-2">
            <span className="font-medium text-slate-600">GitHub repo (owner/name)</span>
            <input
              className={`${inputClass} mt-1 font-mono`}
              value={form.github_repo}
              onChange={(e) => updateField("github_repo", e.target.value)}
              placeholder="owner/centrix-erp-frontend-web"
            />
            <span className="mt-1 block text-xs text-slate-500">{hints?.repo}</span>
          </label>
          <label className="block text-xs">
            <span className="font-medium text-slate-600">Git ref</span>
            <input
              className={`${inputClass} mt-1 font-mono`}
              value={form.github_ref}
              onChange={(e) => updateField("github_ref", e.target.value)}
              placeholder="main"
            />
          </label>
          <label className="block text-xs">
            <span className="font-medium text-slate-600">Workflow file</span>
            <input
              className={`${inputClass} mt-1 font-mono`}
              value={form.workflow_file}
              onChange={(e) => updateField("workflow_file", e.target.value)}
              placeholder="build-print-agent-msi.yml"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <PrimaryButton
            type="button"
            showIcon={false}
            disabled={building || uploading || saving || !buildReady}
            title={!buildReady ? "Complete the checklist first" : undefined}
            onClick={() => void handleBuild()}
          >
            {building ? "Queuing build…" : "Build MSI & upload to R2"}
          </PrimaryButton>
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            disabled={uploading || building || saving || !effective?.r2_configured}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? "Uploading…" : "Upload MSI to R2"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".msi,application/octet-stream"
            className="hidden"
            onChange={(e) => void handleUpload(e)}
          />
        </div>
        {meta.last_build_status || meta.last_upload_at ? (
          <p className="mt-3 text-xs text-slate-600">
            Last status: <strong>{meta.last_build_status || "—"}</strong>
            {meta.last_build_at ? ` · ${new Date(meta.last_build_at).toLocaleString()}` : ""}
            {meta.last_build_message ? ` — ${meta.last_build_message}` : ""}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <PrimaryButton type="submit" showIcon={false} disabled={saving || building || uploading}>
          {saving ? "Saving…" : "Save settings"}
        </PrimaryButton>
        <button type="button" className={SECONDARY_BTN_CLASS} disabled={loading} onClick={() => void load()}>
          Refresh
        </button>
      </div>
    </form>
  );
}
