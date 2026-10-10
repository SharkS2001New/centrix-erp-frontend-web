import { apiRequest } from "@/lib/api";

const MAX_EDGE = 480;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_STORED_CHARS = 180000;

export function isPublicImageUrl(value) {
  try {
    const parsed = new URL(String(value ?? "").trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function shrinkImage(img) {
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare that photo.");
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
  if (dataUrl.length > MAX_STORED_CHARS) {
    throw new Error("That photo is still too large. Choose a smaller one.");
  }
  return dataUrl;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that photo."));
    img.src = src;
  });
}

/** Shrink a chosen photo so it can be stored with the service. */
export function readServicePhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || "").startsWith("image/")) {
      reject(new Error("Choose a photo."));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      reject(new Error("That photo is larger than 8 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that photo."));
    reader.onload = () => {
      loadImage(String(reader.result || ""))
        .then((img) => resolve(shrinkImage(img)))
        .catch(reject);
    };
    reader.readAsDataURL(file);
  });
}

export function servicePhoto(value) {
  return typeof value === "string" && value.startsWith("data:image/") ? value : "";
}

export function serviceImageSrc(service) {
  const stored = servicePhoto(service?.image);
  if (stored) return stored;
  const url = String(service?.imageUrl ?? "").trim();
  return isPublicImageUrl(url) ? url : "";
}

/** Ask Centrix to download a public image link and keep a small local copy. */
export async function importRemoteServicePhoto(url) {
  const clean = String(url ?? "").trim();
  if (!isPublicImageUrl(clean)) throw new Error("Enter a public http or https image URL.");
  const payload = await apiRequest("/media/import-image", {
    method: "POST",
    body: { url: clean },
    loading: false,
    reportIssues: false,
  });
  const dataUrl = String(payload?.data_url ?? "");
  if (!dataUrl.startsWith("data:image/")) throw new Error("Could not download that image.");
  const img = await loadImage(dataUrl);
  return shrinkImage(img);
}
