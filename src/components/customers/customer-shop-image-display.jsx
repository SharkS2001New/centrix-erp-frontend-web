"use client";

import {
  EntityPhotoDisplay,
  customerPhotoFileUrl,
} from "@/components/media/entity-photo-display";
import { ProtectedPhotoEnlarge } from "@/components/media/protected-file-preview";

export function CustomerShopImageDisplay({
  customerNum,
  imageUrl,
  alt = "Shop",
  className = "h-full w-full object-cover",
  placeholderClassName = "px-2 text-center text-xs text-slate-400",
  enlargeable = true,
}) {
  const photo = (
    <EntityPhotoDisplay
      fileUrl={customerNum ? customerPhotoFileUrl(customerNum) : null}
      imageUrl={imageUrl}
      alt={alt}
      className={className}
      placeholderClassName={placeholderClassName}
    />
  );

  if (!enlargeable || !customerNum) {
    return photo;
  }

  return (
    <ProtectedPhotoEnlarge
      filePath={customerPhotoFileUrl(customerNum)}
      alt={alt}
      className="block h-full w-full"
    >
      <div className="h-full w-full overflow-hidden ring-offset-2 transition hover:ring-2 hover:ring-[#185FA5]/30">
        {photo}
      </div>
    </ProtectedPhotoEnlarge>
  );
}
