"use client";

import { podRecordPhotoPath, podRecordSignaturePath } from "@/lib/api";
import { ProtectedFileLink, ProtectedFilePreviewModal } from "@/components/media/protected-file-preview";

export { ProtectedFilePreviewModal as PodAttachmentPreviewModal };

export function PodAttachmentLink({ recordId, kind, label, className = "", disabled = false, onBusyChange }) {
  const path =
    kind === "signature" ? podRecordSignaturePath(recordId) : podRecordPhotoPath(recordId);

  return (
    <ProtectedFileLink
      filePath={path}
      label={label}
      title={label}
      className={`text-xs ${className}`}
      disabled={disabled}
      onBusyChange={onBusyChange}
    />
  );
}
