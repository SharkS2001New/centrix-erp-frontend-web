"use client";

import { useState } from "react";
import { apiFetchBlob, ApiError, resolveProtectedFileUrl } from "@/lib/api";
import { notifyError } from "@/lib/notify";

function approvalReason(item) {
  const request = item?.action_request;
  if (!request) return null;
  const fromPayload = request.payload?.return_reason;
  const direct = request.reason;
  const value = (fromPayload ?? direct ?? "").trim();
  return value || null;
}

function approvalProof(item) {
  return item?.action_request?.payload?.proof ?? null;
}

export function ApprovalNotificationDetails({ item }) {
  const reason = approvalReason(item);
  const proof = approvalProof(item);
  const [loadingProof, setLoadingProof] = useState(false);

  if (!reason && !proof) return null;

  async function openProof() {
    if (!proof?.url) return;
    setLoadingProof(true);
    try {
      const blob = await apiFetchBlob(proof.url);
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not open proof file.");
    } finally {
      setLoadingProof(false);
    }
  }

  return (
    <div className="mt-2 space-y-1 rounded-md bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
      {reason ? (
        <p className="text-slate-700 dark:text-slate-200">
          <span className="font-medium text-slate-500 dark:text-slate-400">Reason: </span>
          {reason}
        </p>
      ) : null}
      {proof?.url ? (
        <p className="text-slate-700 dark:text-slate-200">
          <span className="font-medium text-slate-500 dark:text-slate-400">Proof: </span>
          <button
            type="button"
            disabled={loadingProof}
            onClick={(e) => {
              e.stopPropagation();
              void openProof();
            }}
            className="font-medium text-[#185FA5] hover:underline disabled:opacity-50"
          >
            {loadingProof ? "Opening…" : proof.file_name ?? "View attachment"}
          </button>
        </p>
      ) : null}
    </div>
  );
}

export function resolveApprovalProofUrl(proof) {
  if (!proof?.url) return null;
  return resolveProtectedFileUrl(proof.url);
}
