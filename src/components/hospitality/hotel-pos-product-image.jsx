"use client";

import { useEffect, useState } from "react";
import { EntityPhotoDisplay, productPhotoFileUrl } from "@/components/media/entity-photo-display";
import { getHotelPosOfflineImageObjectUrl } from "@/lib/hotel-pos-offline";

/**
 * Prefers locally warmed IndexedDB image (offline), else authenticated API fetch.
 */
export function HotelPosProductImage({
  productCode,
  offlineMode = false,
  alt = "Product",
  className = "h-full w-full object-cover",
  placeholderClassName = "flex h-full items-center justify-center px-1 text-center text-[9px] text-slate-400",
}) {
  const [localUrl, setLocalUrl] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    setLocalUrl(null);

    if (!productCode) return undefined;

    void (async () => {
      try {
        objectUrl = await getHotelPosOfflineImageObjectUrl(productCode);
        if (!cancelled && objectUrl) setLocalUrl(objectUrl);
      } catch {
        /* fall through to network */
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [productCode]);

  if (localUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={localUrl} alt={alt} className={className} />
    );
  }

  if (offlineMode) {
    return <span className={placeholderClassName}>No photo</span>;
  }

  return (
    <EntityPhotoDisplay
      fileUrl={productPhotoFileUrl(productCode)}
      alt={alt}
      className={className}
      placeholderClassName={placeholderClassName}
    />
  );
}
