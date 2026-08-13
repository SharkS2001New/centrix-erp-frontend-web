"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { FormModal, PrimaryButton } from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";

const POLL_MS = 4000;
const TIMEOUT_MS = 90000;

/**
 * Live fingerprint test — Centrix asks CentrixAttendanceAgent to poll the terminal for a new punch.
 */
export function LiveFingerprintTestModal({ open, onClose, device, organizationApiPath }) {
  const [status, setStatus] = useState("waiting");
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(TIMEOUT_MS / 1000));
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const sinceRef = useRef(null);
  const appliedRef = useRef(false);
  const inFlightRef = useRef(false);

  const base = device?.id
    ? organizationApiPath(`/attendance-clock-devices/${device.id}/hikvision`)
    : null;

  const poll = useCallback(async () => {
    if (!base || !sinceRef.current || appliedRef.current || inFlightRef.current) return;
    inFlightRef.current = true;
    setChecking(true);
    try {
      const data = await apiRequest(`${base}/test/live-punch`, {
        method: "POST",
        loading: false,
        body: {
          since: sinceRef.current,
          apply: true,
        },
      });

      if (appliedRef.current) return;

      const latest = data.latest;
      if (!latest) {
        setStatus((prev) => (prev === "error" ? "waiting" : prev === "timeout" ? "timeout" : "waiting"));
        return;
      }

      const isFingerprint =
        data.fingerprint_detected ||
        String(latest.verification_method ?? "")
          .toLowerCase()
          .includes("finger");

      if (isFingerprint || latest.employee_no) {
        appliedRef.current = true;
        setResult({ ...data, latest });
        setStatus("success");
        notifySuccess(
          `Punch recorded — ${latest.employee_no ?? "unknown"} @ ${latest.punched_at ?? ""}`,
        );
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Live test poll failed";
      setStatus("error");
      setResult({ error: msg });
      notifyError(msg);
    } finally {
      inFlightRef.current = false;
      setChecking(false);
    }
  }, [base]);

  useEffect(() => {
    if (!open || !device?.id) return undefined;

    appliedRef.current = false;
    inFlightRef.current = false;
    setResult(null);
    setStatus("waiting");
    setChecking(false);
    setSecondsLeft(Math.floor(TIMEOUT_MS / 1000));
    // Look back a few seconds so a punch just before opening the modal still counts.
    sinceRef.current = new Date(Date.now() - 8000).toISOString();

    const pollTimer = setInterval(() => {
      void poll();
    }, POLL_MS);

    const countdown = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setStatus((prev) => (prev === "waiting" || prev === "checking" ? "timeout" : prev));
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    void poll();

    return () => {
      clearInterval(pollTimer);
      clearInterval(countdown);
      inFlightRef.current = false;
    };
  }, [open, device?.id, poll]);

  function handleClose() {
    sinceRef.current = null;
    appliedRef.current = false;
    inFlightRef.current = false;
    onClose?.();
  }

  function handleCheckNow() {
    if (status === "timeout" || status === "error") {
      appliedRef.current = false;
      setResult(null);
      setStatus("waiting");
      setSecondsLeft(Math.floor(TIMEOUT_MS / 1000));
      sinceRef.current = new Date(Date.now() - 8000).toISOString();
    }
    void poll();
  }

  const showCheckButton = status === "waiting" || status === "timeout" || status === "error";

  return (
    <FormModal
      title="Test fingerprint"
      open={open}
      onClose={handleClose}
      onSubmit={handleClose}
      submitLabel="Close"
    >
      <div className="space-y-3 text-sm text-slate-700">
        <p className="font-medium text-slate-900">
          Place your finger on <strong>{device?.device_no ?? "the terminal"}</strong> now.
        </p>
        <p className="text-xs text-slate-500">
          Centrix asks <strong>CentrixAttendanceAgent</strong> on the office PC to read the latest punch
          from the Hikvision ({device?.host ?? "LAN IP not set"}). Keep the Windows service running.
        </p>

        {status === "waiting" ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-center">
            <p className="text-blue-900">
              {checking ? "Checking via CentrixAttendanceAgent…" : "Waiting for fingerprint…"}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-blue-800">{secondsLeft}s</p>
          </div>
        ) : null}

        {status === "timeout" ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            No punch detected within {TIMEOUT_MS / 1000} seconds. Confirm the agent service is running,
            place your finger again, then click Check now.
          </p>
        ) : null}

        {status === "error" && result?.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
            {result.error}
          </p>
        ) : null}

        {status === "success" && result?.latest ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
            <p className="font-medium">Live punch detected</p>
            <ul className="mt-2 space-y-1 font-mono text-xs">
              <li>Employee: {result.latest.employee_no ?? "—"}</li>
              <li>Time: {result.latest.punched_at ?? "—"}</li>
              <li>Verify: {result.latest.verification_method ?? "—"}</li>
              <li>Status: {result.latest.attendance_status ?? "—"}</li>
            </ul>
            {result.applied ? (
              <p className="mt-2 text-xs">
                Applied to Centrix attendance — stored {result.applied.stored ?? 0}, applied{" "}
                {result.applied.applied ?? 0}.
              </p>
            ) : null}
          </div>
        ) : null}

        {showCheckButton ? (
          <PrimaryButton
            type="button"
            showIcon={false}
            disabled={checking}
            onClick={handleCheckNow}
          >
            {checking ? "Checking…" : "Check now"}
          </PrimaryButton>
        ) : null}
      </div>
    </FormModal>
  );
}
