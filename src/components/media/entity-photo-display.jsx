"use client";

import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth-storage";
import { apiBaseOrigin, resolveCustomerMediaUrl } from "@/lib/api";

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
      const tryUrls = [fileUrl, resolveCustomerMediaUrl(imageUrl)].filter(Boolean);

      for (const url of tryUrls) {
        try {
          const headers = { Accept: "image/*" };
          if (token) headers.Authorization = `Bearer ${token}`;
          const res = await fetch(url, { headers });
          if (!res.ok) continue;
          const blob = await res.blob();
          if (!blob.type.startsWith("image/")) continue;
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
    return <span className={placeholderClassName}>Loading…</span>;
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
