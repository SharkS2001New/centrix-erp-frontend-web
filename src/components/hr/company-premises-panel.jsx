"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useSettingsApi } from "@/contexts/settings-api-context";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";

function geolocationErrorMessage(error) {
  if (!error) {
    return "Could not read your location. Allow location access and try again.";
  }
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location permission denied. Allow location for this site in your browser settings, then try again.";
    case error.POSITION_UNAVAILABLE:
      return "Location unavailable on this device. Enter latitude and longitude manually, or try again with a clearer GPS signal.";
    case error.TIMEOUT:
      return "Location request timed out. Try again or enter coordinates manually.";
    default:
      return error.message || "Could not read your location. Allow location access and try again.";
  }
}

function requestCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported in this browser."));
      return;
    }

    const options = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };

    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

export function CompanyPremisesPanel({ embedded = false }) {
  const { organizationApiPath } = useSettingsApi();
  const [premises, setPremises] = useState(null);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [draftLat, setDraftLat] = useState("");
  const [draftLng, setDraftLng] = useState("");

  const branches = premises?.branches ?? [];
  const multiBranch = branches.length > 1;

  const selectedBranch = useMemo(
    () => branches.find((b) => String(b.branch_id) === String(selectedBranchId)) ?? null,
    [branches, selectedBranchId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest(organizationApiPath("/attendance/company-premises"));
      setPremises(data);
      const list = data.branches ?? [];
      setSelectedBranchId((prev) => {
        if (prev && list.some((b) => String(b.branch_id) === String(prev))) return prev;
        return list[0]?.branch_id != null ? String(list[0].branch_id) : "";
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load premises location");
    } finally {
      setLoading(false);
    }
  }, [organizationApiPath]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedBranch) {
      setDraftLat("");
      setDraftLng("");
      return;
    }
    setDraftLat(selectedBranch.latitude != null ? String(selectedBranch.latitude) : "");
    setDraftLng(selectedBranch.longitude != null ? String(selectedBranch.longitude) : "");
  }, [selectedBranch]);

  async function captureCurrentLocation() {
    setMessage(null);
    setError(null);

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("Location capture requires HTTPS. Open Centrix over a secure (https://) connection.");
      return;
    }

    setLocating(true);
    try {
      const pos = await requestCurrentPosition();
      setDraftLat(String(pos.coords.latitude));
      setDraftLng(String(pos.coords.longitude));
      setMessage("Current location captured. Enter your password and save.");
    } catch (err) {
      setError(geolocationErrorMessage(err));
    } finally {
      setLocating(false);
    }
  }

  async function saveLocation() {
    if (!selectedBranchId) {
      setError("Select a branch first.");
      return;
    }
    if (!draftLat || !draftLng) {
      setError("Capture or enter latitude and longitude first.");
      return;
    }
    if (!password.trim()) {
      setError("Your password is required to save the branch premises location.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest(organizationApiPath("/attendance/company-premises"), {
        method: "POST",
        body: {
          password,
          branch_id: Number(selectedBranchId),
          latitude: Number(draftLat),
          longitude: Number(draftLng),
          radius_metres: selectedBranch?.radius_metres ?? premises?.default_radius_metres ?? 5,
        },
      });
      setPassword("");
      setMessage(res.message ?? "Branch premises location saved.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save location");
    } finally {
      setSaving(false);
    }
  }

  const shellClass = embedded
    ? "mt-4 space-y-4 rounded-xl border border-[#185FA5]/20 bg-[#E6F1FB]/30 p-4"
    : "mb-8 rounded-xl border border-[#185FA5]/20 bg-[#E6F1FB]/30 p-5 shadow-sm";

  return (
    <section className={shellClass}>
      <h2 className={embedded ? "text-sm font-medium text-slate-900" : "text-[15px] font-medium text-slate-900"}>
        Branch premises (GPS)
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Employees mark attendance on the shared company phone using face scan and GPS.
        {multiBranch
          ? " Configure premises separately for each branch."
          : " Save the premises coordinates here (password required)."}
        {" "}First scan enrolls each employee&apos;s face.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 rounded-lg border border-[#27500A]/20 bg-[#EAF3DE] px-3 py-2 text-sm text-[#27500A]">
          {message}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading premises…</p>
      ) : branches.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No active branches found for this organization.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {multiBranch ? (
            <Field label="Branch">
              <select
                className={inputClassName()}
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
              >
                {branches.map((branch) => (
                  <option key={branch.branch_id} value={String(branch.branch_id)}>
                    {branch.branch_name}
                    {branch.has_premises_location ? " — configured" : " — not set"}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Latitude">
              <input
                type="text"
                className={inputClassName()}
                value={draftLat}
                onChange={(e) => setDraftLat(e.target.value)}
                placeholder="-1.292100"
              />
            </Field>
            <Field label="Longitude">
              <input
                type="text"
                className={inputClassName()}
                value={draftLng}
                onChange={(e) => setDraftLng(e.target.value)}
                placeholder="36.821900"
              />
            </Field>
            <Field label="Radius (m)">
              <input
                type="text"
                readOnly
                className={`${inputClassName()} bg-slate-50`}
                value={String(selectedBranch?.radius_metres ?? premises?.default_radius_metres ?? 5)}
              />
            </Field>
            <Field label="Status">
              <input
                type="text"
                readOnly
                className={`${inputClassName()} bg-slate-50`}
                value={selectedBranch?.has_premises_location ? "Configured" : "Not set"}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <PrimaryButton
              type="button"
              showIcon={false}
              disabled={locating}
              onClick={() => void captureCurrentLocation()}
            >
              {locating ? "Locating…" : "Use my location"}
            </PrimaryButton>
            <Field label="Your password to confirm">
              <input
                type="password"
                autoComplete="current-password"
                className={inputClassName()}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Required to save"
              />
            </Field>
            <PrimaryButton
              type="button"
              disabled={saving}
              showIcon={false}
              onClick={() => void saveLocation()}
            >
              {saving ? "Saving…" : multiBranch ? "Save branch premises" : "Save premises location"}
            </PrimaryButton>
          </div>
          {draftLat && draftLng ? (
            <p className="text-xs text-slate-500">
              Map preview:{" "}
              <a
                href={`https://www.google.com/maps?q=${encodeURIComponent(`${draftLat},${draftLng}`)}`}
                target="_blank"
                rel="noreferrer"
                className="text-[#185FA5] hover:underline"
              >
                Open in Google Maps
              </a>
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
