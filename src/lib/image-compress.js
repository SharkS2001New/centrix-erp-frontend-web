const DEFAULTS = {
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.82,
  mimeType: "image/jpeg",
};

function isCompressibleImage(file) {
  return file instanceof File && String(file.type ?? "").startsWith("image/");
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

/**
 * Resize and re-encode large photos before upload to reduce bandwidth and storage.
 * Non-image files are returned unchanged.
 *
 * @param {File} file
 * @param {{ maxWidth?: number, maxHeight?: number, quality?: number, mimeType?: string }} [options]
 * @returns {Promise<File>}
 */
export async function compressImageFile(file, options = {}) {
  if (!isCompressibleImage(file) || typeof window === "undefined") {
    return file;
  }

  const { maxWidth, maxHeight, quality, mimeType } = { ...DEFAULTS, ...options };
  if (file.size < 250_000 && !file.type.includes("png")) {
    return file;
  }

  try {
    const image = await loadImageFromFile(file);
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, mimeType, quality);
    });
    if (!blob || blob.size >= file.size) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "upload";
    return new File([blob], `${baseName}.jpg`, {
      type: mimeType,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

/** @param {File | null | undefined} file */
export async function compressImageFileIfNeeded(file, options = {}) {
  if (!file) return file;
  return compressImageFile(file, options);
}
