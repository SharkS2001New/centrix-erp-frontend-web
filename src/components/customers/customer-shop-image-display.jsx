"use client";

import {
  EntityPhotoDisplay,
  customerPhotoFileUrl,
} from "@/components/media/entity-photo-display";

export function CustomerShopImageDisplay({
  customerNum,
  imageUrl,
  alt = "Shop",
  className = "h-full w-full object-cover",
  placeholderClassName = "px-2 text-center text-xs text-slate-400",
}) {
  return (
    <EntityPhotoDisplay
      fileUrl={customerNum ? customerPhotoFileUrl(customerNum) : null}
      imageUrl={imageUrl}
      alt={alt}
      className={className}
      placeholderClassName={placeholderClassName}
    />
  );
}
