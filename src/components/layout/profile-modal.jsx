"use client";

import { ProfilePanel } from "@/components/layout/profile-panel";

function CloseIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ProfileModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="velzon-modal relative w-full max-w-3xl rounded-lg border bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="profile-modal-title" className="text-lg font-semibold text-slate-900">
              My profile
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Account details and security. You can also enable two-factor authentication (email or
              Google Authenticator) below.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close profile"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[min(80vh,720px)] overflow-y-auto p-5">
          <ProfilePanel compact onPasswordChangeComplete={onClose} />
        </div>
      </div>
    </div>
  );
}
