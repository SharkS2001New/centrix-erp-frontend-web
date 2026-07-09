"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetchBlob, ApiError } from "@/lib/api";
import { notifyError } from "@/lib/notify";

function isImageBlob(blob) {
  if (!blob || blob.size <= 0) return false;
  if (blob.type.startsWith("image/")) return true;
  return blob.type === "" || blob.type === "application/octet-stream";
}

function isPdfBlob(blob) {
  return blob?.type === "application/pdf";
}

/**
 * Modal preview for protected API files with loading state (prevents double-fetch / over-clicking).
 */
export function ProtectedFilePreviewModal({
  open,
  title = "Attachment",
  filePath,
  onClose,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [blobType, setBlobType] = useState(null);
  const activeFetch = useRef(null);

  useEffect(() => {
    if (!open || !filePath) {
      setLoading(false);
      setError(null);
      setPreviewUrl(null);
      setBlobType(null);
      return undefined;
    }

    const fetchId = Symbol("protected-file-fetch");
    activeFetch.current = fetchId;
    let objectUrl = null;

    setLoading(true);
    setError(null);
    setPreviewUrl(null);
    setBlobType(null);

    apiFetchBlob(filePath)
      .then((blob) => {
        if (activeFetch.current !== fetchId) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
        setBlobType(blob.type || "");
      })
      .catch((err) => {
        if (activeFetch.current !== fetchId) return;
        setError(err instanceof ApiError ? err.message : "Could not load file.");
      })
      .finally(() => {
        if (activeFetch.current === fetchId) setLoading(false);
      });

    return () => {
      activeFetch.current = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, filePath]);

  if (!open) return null;

  const showImage = previewUrl && (isImageBlob({ type: blobType, size: 1 }) || blobType === "");
  const showPdf = previewUrl && isPdfBlob({ type: blobType });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="theme-panel relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="protected-file-preview-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 id="protected-file-preview-title" className="theme-heading text-sm font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
        <div className="flex min-h-[240px] flex-1 items-center justify-center bg-slate-50 p-4 dark:bg-slate-900/40">
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-sm text-slate-500">
              <span
                className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-[#185FA5]"
                aria-hidden
              />
              Loading…
            </div>
          ) : error ? (
            <p className="text-center text-sm text-red-600">{error}</p>
          ) : previewUrl && showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={title}
              className="max-h-[min(70vh,640px)] max-w-full rounded-lg bg-white object-contain p-2"
            />
          ) : previewUrl && showPdf ? (
            <iframe
              title={title}
              src={previewUrl}
              className="h-[min(70vh,640px)] w-full rounded-lg bg-white"
            />
          ) : previewUrl ? (
            <div className="flex flex-col items-center gap-3 text-center text-sm">
              <p className="text-slate-600">Preview is not available for this file type.</p>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#185FA5] hover:underline"
              >
                Open file in new tab
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Link/button that opens protected files with loading state.
 * Images and PDFs open in a modal; other types open in a new browser tab after fetch.
 */
export function ProtectedPhotoEnlarge({
  filePath,
  alt = "Photo",
  className = "block w-full text-left",
  children,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!filePath || disabled) {
    return children;
  }

  return (
    <>
      <button
        type="button"
        className={`${className} disabled:cursor-default`}
        disabled={busy}
        onClick={() => {
          if (busy || open) return;
          setBusy(true);
          setOpen(true);
        }}
        aria-label={`Enlarge ${alt}`}
      >
        {children}
        {busy && open ? (
          <span className="sr-only">Loading photo…</span>
        ) : null}
      </button>
      <ProtectedFilePreviewModal
        open={open}
        title={alt}
        filePath={filePath}
        onClose={() => {
          setOpen(false);
          setBusy(false);
        }}
      />
    </>
  );
}

export function ProtectedFileLink({
  filePath,
  label,
  title,
  className = "",
  busyLabel = "Loading…",
  disabled = false,
  mode = "auto",
  onBusyChange,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function setBusyState(next) {
    setBusy(next);
    onBusyChange?.(next);
  }

  async function openInNewTab() {
    if (busy || disabled || !filePath) return;
    setBusyState(true);
    try {
      const blob = await apiFetchBlob(filePath);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not open file.");
    } finally {
      setBusyState(false);
    }
  }

  function handleClick() {
    if (busy || disabled || !filePath) return;
    if (mode === "tab") {
      void openInNewTab();
      return;
    }
    setBusyState(true);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) setBusyState(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only clear busy when modal closes
  }, [open]);

  return (
    <>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={handleClick}
        className={`font-medium text-[#185FA5] hover:underline disabled:cursor-wait disabled:opacity-60 ${className}`}
      >
        {busy ? busyLabel : label}
      </button>
      {mode !== "tab" ? (
        <ProtectedFilePreviewModal
          open={open}
          title={title ?? label}
          filePath={filePath}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
