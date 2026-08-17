"use client";

import { useRef, useState } from "react";
import { Field } from "@/components/catalog/catalog-shared";
import { EntityPhotoDisplay } from "@/components/media/entity-photo-display";
import { downloadProductImageToPc } from "@/lib/download-product-image";
import { notifyError } from "@/lib/notify";

export function isHttpImageUrl(value) {
  try {
    const parsed = new URL(String(value ?? "").trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const SOURCE_BTN =
  "rounded-md px-2.5 py-1 text-xs font-medium transition";
const SOURCE_BTN_ACTIVE = "bg-[#185FA5] text-white";
const SOURCE_BTN_IDLE = "bg-white text-slate-600 hover:bg-slate-50";

export function ProductImageField({
  label = "Product image",
  source = "upload",
  imageUrl = "",
  previewUrl = null,
  fileUrl = null,
  productCode = null,
  productName = null,
  onSourceChange,
  onFileSelect,
  onUrlChange,
  onRemove,
}) {
  const inputRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const urlPreview = source === "url" && isHttpImageUrl(imageUrl) ? imageUrl.trim() : null;
  const showPreview = Boolean(urlPreview || previewUrl || fileUrl);
  const canDownload = Boolean(urlPreview || previewUrl || fileUrl);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      const localPreview =
        previewUrl?.startsWith("blob:") || previewUrl?.startsWith("data:") ? previewUrl : null;
      await downloadProductImageToPc({
        productCode: urlPreview || localPreview ? null : productCode,
        productName: productName || productCode || "product-image",
        httpUrl: urlPreview,
        blobUrl: localPreview,
      });
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Could not download photo");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="md:col-span-2 xl:col-span-3">
      <Field label={label}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {urlPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urlPreview} alt={label} className="h-full w-full object-cover" />
            ) : (
              <EntityPhotoDisplay fileUrl={fileUrl} imageUrl={previewUrl} alt={label} />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                className={`${SOURCE_BTN} ${source === "upload" ? SOURCE_BTN_ACTIVE : SOURCE_BTN_IDLE}`}
                onClick={() => onSourceChange?.("upload")}
              >
                Upload file
              </button>
              <button
                type="button"
                className={`${SOURCE_BTN} ${source === "url" ? SOURCE_BTN_ACTIVE : SOURCE_BTN_IDLE}`}
                onClick={() => onSourceChange?.("url")}
              >
                Image URL
              </button>
            </div>

            {source === "upload" ? (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#E6F1FB] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#0C447C]"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onFileSelect?.(file);
                  }}
                />
                <p className="text-xs text-slate-500">JPEG, PNG or WebP, up to 5 MB.</p>
              </>
            ) : (
              <>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => onUrlChange?.(e.target.value)}
                  placeholder="https://example.com/product.jpg"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none ring-[#185FA5] focus:ring-2"
                />
                <p className="text-xs text-slate-500">
                  Paste a direct image link. We download and store it when you save — POS and printouts use the saved copy. Use Download to save a copy on this computer.
                </p>
              </>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {canDownload ? (
                <button
                  type="button"
                  onClick={() => void handleDownload()}
                  disabled={downloading}
                  className="self-start text-xs font-medium text-[#185FA5] hover:text-[#0C447C] disabled:opacity-50"
                >
                  {downloading ? "Downloading…" : "Download to this computer"}
                </button>
              ) : null}
              {showPreview && onRemove ? (
                <button
                  type="button"
                  onClick={onRemove}
                  className="self-start text-xs text-red-600 hover:text-red-800"
                >
                  Remove image
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </Field>
    </div>
  );
}
