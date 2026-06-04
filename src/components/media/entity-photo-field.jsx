"use client";

import { useRef } from "react";
import { Field } from "@/components/catalog/catalog-shared";
import { EntityPhotoDisplay } from "@/components/media/entity-photo-display";

export function EntityPhotoField({
  label = "Photo",
  fileUrl,
  previewUrl,
  onFileSelect,
  onRemove,
  removing = false,
}) {
  const inputRef = useRef(null);

  return (
    <div className="md:col-span-2 xl:col-span-3">
      <Field label={label}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <EntityPhotoDisplay
              fileUrl={fileUrl}
              imageUrl={previewUrl}
              alt={label}
            />
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#E6F1FB] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#0C447C]"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFileSelect(file);
              }}
            />
            <p className="text-xs text-slate-500">JPEG, PNG or WebP, up to 5 MB.</p>
            {previewUrl && onRemove ? (
              <button
                type="button"
                disabled={removing}
                onClick={onRemove}
                className="self-start text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                {removing ? "Removing…" : "Remove photo"}
              </button>
            ) : null}
          </div>
        </div>
      </Field>
    </div>
  );
}
