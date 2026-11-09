"use client";

import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth-storage";
import { apiFetchCredentials } from "@/lib/auth-config";
import { apiBaseOrigin, resolveCustomerMediaUrl, resolveProtectedFileUrl } from "@/lib/api";
import {
  peekEntityPhotoCache,
  resolveEntityPhotoUrl,
} from "@/lib/entity-photo-cache";

export function EntityPhotoDisplay({
  fileUrl,
  imageUrl,
  alt = "Photo",
  className = "h-full w-full object-cover",
  placeholderClassName = "px-2 text-center text-xs text-slate-400",
  compact = false,
}) {
  const tryUrls = [
    resolveProtectedFileUrl(fileUrl),
    resolveProtectedFileUrl(imageUrl),
    resolveCustomerMediaUrl(imageUrl),
  ].filter(Boolean);
  const uniqueUrls = [...new Set(tryUrls)];
  const warm =
    imageUrl?.startsWith("blob:") || imageUrl?.startsWith("data:")
      ? imageUrl
      : uniqueUrls.map((u) => peekEntityPhotoCache(u)).find(Boolean) ?? null;

  const [src, setSrc] = useState(warm);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    async function load() {
      if (!imageUrl && !fileUrl) {
        setSrc(null);
        return;
      }

      if (imageUrl?.startsWith("blob:") || imageUrl?.startsWith("data:")) {
        setSrc(imageUrl);
        return;
      }

      const urls = [
        resolveProtectedFileUrl(fileUrl),
        resolveProtectedFileUrl(imageUrl),
        resolveCustomerMediaUrl(imageUrl),
      ].filter(Boolean);
      const unique = [...new Set(urls)];

      const peeked = unique.map((u) => peekEntityPhotoCache(u)).find(Boolean);
      if (peeked) {
        if (!cancelled) setSrc(peeked);
        return;
      }

      if (!cancelled) setSrc(null);

      const token = getToken();
      const headers = { Accept: "image/*,*/*" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const credentials = apiFetchCredentials();

      for (const url of unique) {
        const objectUrl = await resolveEntityPhotoUrl(url, { headers, credentials });
        if (cancelled) return;
        if (objectUrl) {
          setSrc(objectUrl);
          return;
        }
      }

      if (!cancelled) setFailed(true);
    }

    load();

    return () => {
      cancelled = true;
      // Object URLs are owned by the session cache — do not revoke here.
    };
  }, [fileUrl, imageUrl]);

  if ((!imageUrl && !fileUrl) || failed) {
    if (compact) {
      return (
        <span className="flex h-full w-full items-center justify-center text-slate-300" aria-hidden>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="8.5" cy="10" r="1.5" />
            <path d="M21 16l-5-5-7 7" />
          </svg>
        </span>
      );
    }
    return <span className={placeholderClassName}>No photo</span>;
  }

  if (!src) {
    return (
      <span className={`flex items-center justify-center ${compact ? "" : "gap-2"} ${placeholderClassName}`}>
        <span
          className={`inline-block animate-spin rounded-full border-2 border-slate-300 border-t-[#185FA5] ${compact ? "h-3.5 w-3.5" : "h-4 w-4"}`}
          aria-hidden
        />
        {compact ? null : "Loading…"}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} loading="lazy" decoding="async" />
  );
}

export function customerPhotoFileUrl(customerNum) {
  return `${apiBaseOrigin()}/api/v1/customers/${customerNum}/shop-image/file`;
}

export function productPhotoFileUrl(productCode) {
  return `${apiBaseOrigin()}/api/v1/products/${encodeURIComponent(productCode)}/image/file`;
}

export function employeePhotoFileUrl(employeeId) {
  return `${apiBaseOrigin()}/api/v1/employees/${employeeId}/photo/file`;
}

export function organizationLogoFileUrl(organizationId) {
  return `${apiBaseOrigin()}/api/v1/organizations/${organizationId}/logo/file`;
}

export function fieldAttendancePhotoFileUrl(sessionId, kind, variant = "sales") {
  const segment = kind === "sign-out" ? "sign-out-photo" : "sign-in-photo";
  const prefix =
    variant === "hr" ? "/attendance/field-sessions" : "/sales/mobile-field-attendance";
  return `${apiBaseOrigin()}/api/v1${prefix}/${sessionId}/${segment}/file`;
}
