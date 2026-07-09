"use client";

import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth-storage";
import { apiFetchCredentials } from "@/lib/auth-config";
import { apiBaseOrigin, resolveCustomerMediaUrl, resolveProtectedFileUrl } from "@/lib/api";

function isDisplayableImageBlob(blob) {
  if (!blob || blob.size <= 0) return false;
  if (blob.type.startsWith("image/")) return true;
  // Some PHP/file servers return octet-stream for JPEG uploads.
  return blob.type === "" || blob.type === "application/octet-stream";
}

export function EntityPhotoDisplay({
  fileUrl,
  imageUrl,
  alt = "Photo",
  className = "h-full w-full object-cover",
  placeholderClassName = "px-2 text-center text-xs text-slate-400",
}) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl = null;
    setFailed(false);
    setSrc(null);

    async function load() {
      if (!imageUrl && !fileUrl) return;

      if (imageUrl?.startsWith("blob:") || imageUrl?.startsWith("data:")) {
        setSrc(imageUrl);
        return;
      }

      const token = getToken();
      const tryUrls = [
        resolveProtectedFileUrl(fileUrl),
        resolveProtectedFileUrl(imageUrl),
        resolveCustomerMediaUrl(imageUrl),
      ].filter(Boolean);
      const uniqueUrls = [...new Set(tryUrls)];

      for (const url of uniqueUrls) {
        try {
          const headers = { Accept: "image/*,*/*" };
          if (token) headers.Authorization = `Bearer ${token}`;
          const res = await fetch(url, { headers, credentials: apiFetchCredentials() });
          if (!res.ok) continue;
          const blob = await res.blob();
          if (!isDisplayableImageBlob(blob)) continue;
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
          return;
        } catch {
          /* try next */
        }
      }

      setFailed(true);
    }

    load();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileUrl, imageUrl]);

  if ((!imageUrl && !fileUrl) || failed) {
    return <span className={placeholderClassName}>No photo</span>;
  }

  if (!src) {
    return (
      <span className={`flex items-center justify-center gap-2 ${placeholderClassName}`}>
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#185FA5]"
          aria-hidden
        />
        Loading…
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  );
}

export function customerPhotoFileUrl(customerNum) {
  return `${apiBaseOrigin()}/api/v1/customers/${customerNum}/shop-image/file`;
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
