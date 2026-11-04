"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { Field, PrimaryButton, SecondaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { aiTrainingApiBase } from "@/lib/platform-ai-training";
import { notifyError, notifySuccess } from "@/lib/notify";

export function PlatformDemoVideoSettingsPanel({ field, title, description }) {
  const apiBase = aiTrainingApiBase();
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await apiRequest(`${apiBase}/settings`);
      setVideoUrl(String(res?.settings?.[field] ?? ""));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to load demo video settings.";
      setLoadError(message);
      notifyError(message);
    } finally {
      setLoading(false);
    }
  }, [apiBase, field]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await apiRequest(`${apiBase}/settings`, {
        method: "PATCH",
        body: { [field]: videoUrl.trim() || null },
      });
      setVideoUrl(String(res?.settings?.[field] ?? ""));
      notifySuccess("Demo video link saved.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save demo video settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-sm font-semibold theme-heading">{title}</h2>
        <p className="mt-1 text-xs theme-subtext">{description}</p>
      </div>

      {loading ? (
        <p className="text-sm theme-subtext">Loading demo video settings…</p>
      ) : loadError ? (
        <div className="space-y-3" role="alert">
          <p className="text-sm text-rose-700">{loadError}</p>
          <SecondaryButton type="button" onClick={loadSettings} disabled={loading}>
            Try again
          </SecondaryButton>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Video link">
            <input
              type="url"
              className={inputClassName()}
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=abcdefghijk"
              maxLength={500}
            />
          </Field>
          <PrimaryButton type="button" showIcon={false} onClick={saveSettings} disabled={saving}>
            {saving ? "Saving…" : "Save video link"}
          </PrimaryButton>
        </div>
      )}
    </section>
  );
}
