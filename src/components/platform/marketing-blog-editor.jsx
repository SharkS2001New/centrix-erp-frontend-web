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
    // Prefer HTML when available; strip heavy Google Docs wrappers later on save.
    const html = event.clipboardData?.getData("text/html");
    if (html && html.includes("<img")) {
      // Let the browser paste; backend extracts data-URIs on save.
      return;
    }
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
        className="marketing-blog-editor min-h-[280px] max-h-[560px] overflow-y-auto px-3 py-3 text-sm leading-6 text-[var(--theme-text)] outline-none prose-img:max-w-full [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg"
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
      />
    </div>
  );
}
