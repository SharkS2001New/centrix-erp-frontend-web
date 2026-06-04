"use client";

import { EntityPhotoField } from "@/components/media/entity-photo-field";
import { customerPhotoFileUrl } from "@/components/media/entity-photo-display";

export function CustomerShopImageField({
  customerNum,
  previewUrl,
  onFileSelect,
  onRemove,
  removing = false,
}) {
  return (
    <EntityPhotoField
      label="Shop photo"
      fileUrl={customerNum ? customerPhotoFileUrl(customerNum) : null}
      previewUrl={previewUrl}
      onFileSelect={onFileSelect}
      onRemove={onRemove}
      removing={removing}
    />
  );
}
