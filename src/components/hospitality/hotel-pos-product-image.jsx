"use client";

import { memo, useEffect, useState } from "react";
import {
  hotelPosExternalImageUrl,
  hotelPosImageVersionFromUrl,
  peekHotelPosCachedImageUrl,
  resolveHotelPosCachedImageUrl,
} from "@/lib/hotel-pos-image-cache";

/**
 * Prefers session/IndexedDB cached photo (R2 → API → local PC).
 * Falls back to the catalogue remote/CDN URL so tiles still render while import runs.
 * Refreshes only when imageVersion / image path changes after upload or replace.
 */
export const HotelPosProductImage = memo(function HotelPosProductImage({
  productCode,
  imageUrl,
  imageVersion = null,
  offlineMode = false,
  alt = "Product",
  className = "h-full w-full object-cover",
  placeholderClassName = "flex h-full items-center justify-center px-1 text-center text-[9px] text-slate-400",
}) {
  const version =
    imageVersion || hotelPosImageVersionFromUrl(imageUrl) || null;
  const [src, setSrc] = useState(() => peekHotelPosCachedImageUrl(productCode, version));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    const external = hotelPosExternalImageUrl(imageUrl);
    const immediate = peekHotelPosCachedImageUrl(productCode, version);
    if (immediate) {
      setSrc(immediate);
      return undefined;
    }
    if (external && !offlineMode) {
      // Show the saved remote/CDN/R2 URL immediately while /image/file imports to storage.
      setSrc(external);
      if (productCode) {
        void resolveHotelPosCachedImageUrl(productCode, {
          fallbackUrl: imageUrl,
          imageVersion: version,
        }).then((url) => {
          if (!cancelled && url) setSrc(url);
        });
      }
      return undefined;
    }

    setSrc(null);
    if (!productCode) {
      setFailed(true);
      return undefined;
    }

    void resolveHotelPosCachedImageUrl(productCode, {
      fallbackUrl: imageUrl,
      imageVersion: version,
    }).then((url) => {
      if (cancelled) return;
      if (url) {
        setSrc(url);
        return;
      }
      if (external) {
        setSrc(external);
        return;
      }
      setFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [imageUrl, imageVersion, offlineMode, productCode, version]);

  const handleImageError = () => {
    const external = hotelPosExternalImageUrl(imageUrl);
    // Cached blob failed — fall back to the catalogue remote URL once.
    if (src && external && src !== external) {
      setSrc(external);
      return;
    }
    setSrc(null);
    setFailed(true);
  };

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} className={className} onError={handleImageError} />
    );
  }

  if (offlineMode || failed) {
    return <span className={placeholderClassName}>No photo</span>;
  }

  return (
    <span className={`flex items-center justify-center ${placeholderClassName}`}>
      <span
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[var(--theme-accent,#185FA5)]"
        aria-hidden
      />
    </span>
  );
});
