"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiUpload } from "@/lib/api";
import { notifyError } from "@/lib/notify";

const TOOLS = [
  { cmd: "bold", label: "B", title: "Bold" },
  { cmd: "italic", label: "I", title: "Italic" },
  { cmd: "underline", label: "U", title: "Underline" },
  { cmd: "insertUnorderedList", label: "• List", title: "Bullet list" },
  { cmd: "insertOrderedList", label: "1. List", title: "Numbered list" },
  { cmd: "formatBlock", arg: "h2", label: "H2", title: "Heading" },
  { cmd: "formatBlock", arg: "p", label: "P", title: "Paragraph" },
];

function sanitizeEditorHtml(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll("script,style,iframe,object,embed,svg,math").forEach((node) => node.remove());

  for (const element of parsed.body.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === "style" && /url\s*\(|expression\s*\(|@import/i.test(value)) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name !== "href" && name !== "src") continue;

      const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
      const safeLink = name === "href" && (!scheme || ["http", "https", "mailto", "tel"].includes(scheme));
      const safeImage =
        name === "src" &&
        (!scheme || ["http", "https"].includes(scheme) || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(value));
      if (!safeLink && !safeImage) element.removeAttribute(attribute.name);
    }
  }

  return parsed.body.innerHTML;
}

/**
 * Pitch Predictions–style blog editor: toolbar + image upload into HTML body.
 */
export function MarketingBlogEditor({ value, onChange, disabled = false }) {
  const ref = useRef(null);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const syncing = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || syncing.current) return;
    const next = value || "";
    if (el.innerHTML !== next) {
      el.innerHTML = next;
    }
  }, [value]);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    syncing.current = true;
    onChange(el.innerHTML);
    queueMicrotask(() => {
      syncing.current = false;
    });
  }, [onChange]);

  function run(cmd, arg) {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(cmd, false, arg ?? null);
    emit();
  }

  function insertLink() {
    if (disabled) return;
    const url = window.prompt("Link URL");
    if (!url) return;
    run("createLink", url);
  }

  async function onPickImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || disabled) return;
    setUploading(true);
    try {
      const res = await apiUpload("/admin/marketing-blogs/upload-image", file, "image", {
        preset: "photo",
      });
      const url = res?.url;
      if (!url) throw new Error("Upload did not return a URL.");
      ref.current?.focus();
      document.execCommand("insertImage", false, url);
      ref.current?.querySelectorAll("img").forEach((img) => {
        if (img.getAttribute("src") !== url) return;
        img.setAttribute("loading", "lazy");
        img.setAttribute("decoding", "async");
        img.style.maxWidth = "100%";
        img.style.height = "auto";
      });
      emit();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function onPaste(event) {
    const html = event.clipboardData?.getData("text/html");
    if (!html) return;

    event.preventDefault();
    ref.current?.focus();
    document.execCommand("insertHTML", false, sanitizeEditorHtml(html));
    emit();
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--theme-border)] bg-[var(--theme-surface-subtle)] px-2 py-1.5">
        {TOOLS.map((tool) => (
          <button
            key={`${tool.cmd}-${tool.arg || tool.label}`}
            type="button"
            title={tool.title}
            disabled={disabled}
            className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--theme-text)] hover:bg-[var(--theme-surface)] disabled:opacity-50"
            onClick={() => run(tool.cmd, tool.arg)}
          >
            {tool.label}
          </button>
        ))}
        <button
          type="button"
          title="Insert link"
          disabled={disabled}
          className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--theme-text)] hover:bg-[var(--theme-surface)] disabled:opacity-50"
          onClick={insertLink}
        >
          Link
        </button>
        <button
          type="button"
          title="Insert image"
          disabled={disabled || uploading}
          className="rounded-md bg-[var(--theme-primary)] px-2.5 py-1 text-xs font-semibold text-[var(--theme-primary-fg)] disabled:opacity-50"
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? "Uploading…" : "Image"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void onPickImage(event)}
        />
      </div>
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Blog body"
        className="marketing-blog-editor min-h-[280px] px-3 py-3 text-sm leading-6 text-[var(--theme-text)] outline-none prose-img:max-w-full [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg"
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
      />
    </div>
  );
}

export function MarketingBlogWordImportButton({ onImport, disabled = false }) {
  const documentRef = useRef(null);
  const [importing, setImporting] = useState(false);

  async function onImportDocument(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || disabled) return;
    if (!file.name.toLowerCase().endsWith(".docx")) {
      notifyError("Choose a Word document (.docx).");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      notifyError("Word documents must be 20 MB or smaller.");
      return;
    }

    setImporting(true);
    try {
      const mammoth = await import("mammoth/mammoth.browser.js");
      const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      const html = sanitizeEditorHtml(result.value);
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const images = [...parsed.querySelectorAll("img[src^='data:image/']")];
      if (images.length > 20) {
        throw new Error("A Word document can contain up to 20 embedded images.");
      }

      for (const [index, image] of images.entries()) {
        const response = await fetch(image.src);
        if (!response.ok) throw new Error("Could not read an embedded image.");
        const blob = await response.blob();
        if (blob.size > 12 * 1024 * 1024) {
          throw new Error("Embedded images must be 12 MB or smaller.");
        }
        const extension = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
        const imageFile = new File([blob], `word-image-${index + 1}.${extension}`, {
          type: blob.type,
        });
        const uploaded = await apiUpload(
          "/admin/marketing-blogs/upload-image",
          imageFile,
          "image",
          { preset: "photo" },
        );
        if (!uploaded?.url) throw new Error("Image upload did not return a URL.");
        image.src = uploaded.url;
      }

      const body = parsed.body.innerHTML.trim();
      if (!body) throw new Error("No article content could be read from this document.");
      if (body.length > 500000) {
        throw new Error("The converted article is too large to save (maximum 500 KB).");
      }
      onImport(body);
    } catch (err) {
      notifyError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not import this Word document.",
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        title="Import a Word document"
        disabled={disabled || importing}
        className="theme-primary-btn rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        onClick={() => documentRef.current?.click()}
      >
        {importing ? "Importing…" : "Import"}
      </button>
      <input
        ref={documentRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(event) => void onImportDocument(event)}
      />
    </>
  );
}
