"use client";

import { useState } from "react";

function EyeIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1 1 0 0 1 0-.644C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function EyeOffIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
      />
    </svg>
  );
}

/** Remove trailing newlines/spaces often included when copying from chat or email. */
export function normalizePasswordClipboardText(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/\uFEFF/g, "")
    .replace(/^[\s\u0000-\u001F\u007F]+|[\s\u0000-\u001F\u007F]+$/g, "");
}

function dispatchValueChange(input, value, onChange) {
  if (!onChange) return;
  onChange({
    ...({ target: input }),
    target: {
      ...input,
      value,
      name: input.name,
      type: input.type,
    },
  });
}

export function PasswordInput({
  className = "",
  onChange,
  onPaste,
  onInput,
  ...props
}) {
  const [visible, setVisible] = useState(false);

  function handlePaste(e) {
    onPaste?.(e);
    if (e.defaultPrevented || !onChange) return;

    const raw = e.clipboardData?.getData("text/plain");
    if (raw == null) return;

    const cleaned = normalizePasswordClipboardText(raw);
    if (cleaned === raw) return;

    e.preventDefault();
    const input = e.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = `${input.value.slice(0, start)}${cleaned}${input.value.slice(end)}`;
    dispatchValueChange(input, next, onChange);
  }

  function handleChange(e) {
    onChange?.(e);
  }

  function handleInput(e) {
    onInput?.(e);
  }

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`${className} pr-10`.trim()}
        onChange={handleChange}
        onInput={handleInput}
        onPaste={handlePaste}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        onMouseDown={(e) => e.preventDefault()}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
