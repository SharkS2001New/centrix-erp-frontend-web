/**
 * Client-side image compression before multipart upload.
 * PDFs and other non-images are returned unchanged.
 */

export const IMAGE_COMPRESS_PRESETS = {
  /** Default for photos / general image uploads. */
  default: {
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 0.72,
    targetMaxBytes: 450_000,
    mimeType: "image/jpeg",
  },
  /** Company logos and brand marks — keep crisp but small. */
  logo: {
    maxWidth: 800,
    maxHeight: 800,
    quality: 0.7,
    targetMaxBytes: 220_000,
    mimeType: "image/jpeg",
  },
  /** Camera / profile photos. */
  photo: {
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 0.72,
    targetMaxBytes: 450_000,
    mimeType: "image/jpeg",
  },
  /** Scanned invoices, attachments, proof photos (need readable text). */
  document: {
    maxWidth: 1400,
    maxHeight: 1400,
    quality: 0.74,
    targetMaxBytes: 600_000,
    mimeType: "image/jpeg",
  },
};

const TINY_JPEG_SKIP_BYTES = 40_000;

function isCompressibleImage(file) {
  if (!(file instanceof File) && !(file instanceof Blob)) return false;
  const type = String(file.type ?? "").toLowerCase();
  return (
    type.startsWith("image/") &&
    !type.includes("svg") &&
    !type.includes("gif")
  );
}

function resolvePreset(options = {}) {
  const named =
    typeof options.preset === "string"
      ? IMAGE_COMPRESS_PRESETS[options.preset]
      : null;
  return {
    ...IMAGE_COMPRESS_PRESETS.default,
    ...(named ?? {}),
    ...options,
  };
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image file."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

function drawScaledImage(image, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return canvas;
}

/**
 * Resize and re-encode images before upload to cut bandwidth and storage.
 * Non-image files are returned unchanged.
 *
 * @param {File|Blob} file
 * @param {{
 *   preset?: keyof typeof IMAGE_COMPRESS_PRESETS,
 *   maxWidth?: number,
 *   maxHeight?: number,
 *   quality?: number,
 *   targetMaxBytes?: number,
 *   mimeType?: string,
 * }} [options]
 * @returns {Promise<File|Blob>}
 */
export async function compressImageFile(file, options = {}) {
  if (!isCompressibleImage(file) || typeof window === "undefined") {
    return file;
  }

  const {
    maxWidth,
    maxHeight,
    quality: startQuality,
    targetMaxBytes,
    mimeType,
  } = resolvePreset(options);

  const type = String(file.type ?? "").toLowerCase();
  const isPngOrWebp = type.includes("png") || type.includes("webp");
  // Tiny JPEGs that are already small can skip — still compress PNG/WebP (often huge).
  if (file.size < TINY_JPEG_SKIP_BYTES && !isPngOrWebp) {
    return file;
  }

  try {
    const image = await loadImageFromFile(file);
    let canvas = drawScaledImage(image, maxWidth, maxHeight);
    if (!canvas) return file;

    let quality = startQuality;
    let blob = await canvasToBlob(canvas, mimeType, quality);
    if (!blob) return file;

    // Step quality down until under the size budget.
    while (blob.size > targetMaxBytes && quality > 0.42) {
      quality = Math.max(0.42, quality - 0.08);
      blob = await canvasToBlob(canvas, mimeType, quality);
      if (!blob) break;
    }

    // Still too large — shrink dimensions once more and re-encode.
    if (blob && blob.size > targetMaxBytes) {
      const shrink = drawScaledImage(image, Math.round(maxWidth * 0.75), Math.round(maxHeight * 0.75));
      if (shrink) {
        canvas = shrink;
        blob = await canvasToBlob(canvas, mimeType, Math.min(quality, 0.65));
      }
    }

    if (!blob || blob.size >= file.size) {
      return file;
    }

    const originalName =
      file instanceof File && file.name
        ? file.name.replace(/\.[^.]+$/, "") || "upload"
        : "upload";

    return new File([blob], `${originalName}.jpg`, {
      type: mimeType,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

/**
 * @param {File|Blob|null|undefined} file
 * @param {Parameters<typeof compressImageFile>[1]} [options]
 */
export async function compressImageFileIfNeeded(file, options = {}) {
  if (!file) return file;
  return compressImageFile(file, options);
}

/** Guess a compress preset from an upload path or field name. */
export function compressPresetForUpload(path = "", fieldName = "image") {
  const haystack = `${path} ${fieldName}`.toLowerCase();
  if (haystack.includes("logo")) return "logo";
  if (
    haystack.includes("document") ||
    haystack.includes("attachment") ||
    haystack.includes("invoice") ||
    haystack.includes("proof") ||
    haystack.includes("signature")
  ) {
    return "document";
  }
  if (haystack.includes("photo") || haystack.includes("shop-image") || haystack.includes("face")) {
    return "photo";
  }
  return "default";
}
