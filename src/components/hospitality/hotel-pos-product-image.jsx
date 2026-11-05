"use client";

import { memo, useEffect, useState } from "react";
import {
  peekHotelPosCachedImageUrl,
  resolveHotelPosCachedImageUrl,
} from "@/lib/hotel-pos-image-cache";

/**
 * Prefers session/IndexedDB cached photo; fetches once and stores in IndexedDB.
 */
export const HotelPosProductImage = memo(function HotelPosProductImage({
  productCode,
  imageUrl,
  offlineMode = false,
  alt = "Product",
  className = "h-full w-full object-cover",
  placeholderClassName = "flex h-full items-center justify-center px-1 text-center text-[9px] text-slate-400",
}) {
  const [src, setSrc] = useState(() => peekHotelPosCachedImageUrl(productCode));

  useEffect(() => {
    let cancelled = false;
    const directUrl = imageUrl && !imageUrl.includes("/api/v1/products/") ? imageUrl : null;
    const immediate = peekHotelPosCachedImageUrl(productCode);
    if (directUrl && !offlineMode) {
      setSrc(directUrl);
      return undefined;
    }
    if (immediate) {
      setSrc(immediate);
      return undefined;
    }
    setSrc(null);
    if (!productCode) return undefined;

    void resolveHotelPosCachedImageUrl(productCode).then((url) => {
      if (!cancelled && url) setSrc(url);
    });

    return () => {
      cancelled = true;
    };
  }, [imageUrl, offlineMode, productCode]);

  const handleImageError = () => {
    if (src === imageUrl && productCode) {
      void resolveHotelPosCachedImageUrl(productCode).then((url) => {
        if (url) setSrc(url);
      });
      return;
    }
    setSrc(null);
  };

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} className={className} onError={handleImageError} />
    );
  }

  if (offlineMode) {
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
