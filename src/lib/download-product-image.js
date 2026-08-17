import { apiFetchBlob } from "@/lib/api";
import { downloadBlob } from "@/components/catalog/catalog-import-export-shared";

function isHttpUrl(value) {
  try {
    const parsed = new URL(String(value ?? "").trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function imageFilename(base, blob) {
  const safe = String(base || "product-image")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "product-image";
  const type = String(blob?.type || "");
  const ext = type.includes("png")
    ? "png"
    : type.includes("webp")
      ? "webp"
      : type.includes("gif")
        ? "gif"
        : "jpg";
  return `${safe}.${ext}`;
}

/**
 * Save a product photo to the user's computer.
 * Prefers the stored authenticated copy; falls back to a pasted HTTP URL.
 */
export async function downloadProductImageToPc({
  productCode,
  productName,
  httpUrl,
  blobUrl,
} = {}) {
  const filenameBase = productName || productCode || "product-image";

  if (blobUrl?.startsWith("blob:") || blobUrl?.startsWith("data:")) {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${String(filenameBase).replace(/[^\w.-]+/g, "_") || "product-image"}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  if (productCode) {
    const blob = await apiFetchBlob(
      `/products/${encodeURIComponent(productCode)}/image/file?download=1`,
    );
    downloadBlob(blob, imageFilename(filenameBase, blob));
    return;
  }

  const remote = String(httpUrl ?? "").trim();
  if (remote && isHttpUrl(remote)) {
    try {
      const res = await fetch(remote);
      if (!res.ok) throw new Error("Could not download image");
      const blob = await res.blob();
      downloadBlob(blob, imageFilename(filenameBase, blob));
      return;
    } catch {
      window.open(remote, "_blank", "noopener,noreferrer");
      return;
    }
  }

  throw new Error("No image to download");
}

export function productHasPhoto(product) {
  return Boolean(product?.has_image || product?.image_path || product?.image_url);
}
