"use client";

export function SignOutButton({ className = "", onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`theme-toggle-btn inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium text-red-600 transition disabled:opacity-50 dark:text-red-400 ${className}`}
    >
      Sign out
    </button>
  );
}
