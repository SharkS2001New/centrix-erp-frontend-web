"use client";

import Link from "next/link";

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/gi;
/** Match Centrix paths even when wrapped in markdown emphasis. */
const PATH_PATTERN = /(?<![A-Za-z0-9])(\/[a-z][\w\-\/]*(?:\/[\w\-]+)*)/gi;

/**
 * @param {string} text
 * @param {string} keyPrefix
 * @param {(() => void) | undefined} onNavigate
 * @returns {import("react").ReactNode[]}
 */
function renderInline(text, keyPrefix, onNavigate) {
  if (!text) return [];

  /** @type {{ type: string, value?: string, href?: string, external?: boolean, children?: import("react").ReactNode[] }[]} */
  const segments = [];
  let remaining = text;
  let guard = 0;

  while (remaining && guard < 200) {
    guard += 1;
    const bold = remaining.match(/\*\*(.+?)\*\*/);
    const italic = remaining.match(/(?<!\*)\*([^*]+)\*(?!\*)/);
    const code = remaining.match(/`([^`]+)`/);

    const candidates = [
      bold ? { kind: "bold", match: bold, at: bold.index ?? 0 } : null,
      italic ? { kind: "italic", match: italic, at: italic.index ?? 0 } : null,
      code ? { kind: "code", match: code, at: code.index ?? 0 } : null,
    ].filter(Boolean);

    if (candidates.length === 0) {
      pushLinkedText(segments, remaining);
      break;
    }

    candidates.sort((a, b) => a.at - b.at);
    const next = candidates[0];
    if (next.at > 0) {
      pushLinkedText(segments, remaining.slice(0, next.at));
    }

    const inner = next.match[1];
    if (next.kind === "bold") {
      segments.push({
        type: "bold",
        children: renderInline(inner, `${keyPrefix}-b${guard}`, onNavigate),
      });
    } else if (next.kind === "italic") {
      segments.push({
        type: "italic",
        children: renderInline(inner, `${keyPrefix}-i${guard}`, onNavigate),
      });
    } else {
      segments.push({ type: "code", value: inner });
    }

    remaining = remaining.slice(next.at + next.match[0].length);
  }

  return segments.map((seg, index) => {
    const key = `${keyPrefix}-${index}`;
    if (seg.type === "text") return <span key={key}>{seg.value}</span>;
    if (seg.type === "bold") return <strong key={key}>{seg.children}</strong>;
    if (seg.type === "italic") return <em key={key}>{seg.children}</em>;
    if (seg.type === "code") {
      return (
        <code key={key} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-800">
          {seg.value}
        </code>
      );
    }
    if (seg.type === "link") {
      if (seg.external) {
        return (
          <a
            key={key}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-indigo-600 underline hover:text-indigo-800"
          >
            {seg.value}
          </a>
        );
      }
      return (
        <Link
          key={key}
          href={seg.href}
          className="font-medium text-indigo-600 underline hover:text-indigo-800"
          onClick={typeof onNavigate === "function" ? onNavigate : undefined}
        >
          {seg.value}
        </Link>
      );
    }
    return null;
  });
}

function pushLinkedText(segments, content) {
  if (!content) return;

  const withUrls = [];
  let last = 0;
  URL_PATTERN.lastIndex = 0;
  for (const match of content.matchAll(URL_PATTERN)) {
    const href = match[0];
    const start = match.index ?? 0;
    if (start > last) withUrls.push({ type: "text", value: content.slice(last, start) });
    withUrls.push({ type: "link", href, value: href, external: true });
    last = start + href.length;
  }
  if (last < content.length) withUrls.push({ type: "text", value: content.slice(last) });
  if (withUrls.length === 0) withUrls.push({ type: "text", value: content });

  for (const part of withUrls) {
    if (part.type !== "text") {
      segments.push(part);
      continue;
    }
    let cursor = 0;
    const text = part.value;
    PATH_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(PATH_PATTERN)) {
      const href = match[1] ?? match[0];
      const start = match.index ?? 0;
      if (start > cursor) segments.push({ type: "text", value: text.slice(cursor, start) });
      segments.push({ type: "link", href, value: href, external: false });
      cursor = start + href.length;
    }
    if (cursor < text.length) segments.push({ type: "text", value: text.slice(cursor) });
  }
}

/** Render assistant/user chat text with markdown emphasis and clickable Centrix paths. */
export function AiMessageContent({ content, onNavigate, className = "" }) {
  if (!content) return null;

  const lines = String(content).replace(/\r\n/g, "\n").split("\n");

  return (
    <div className={`space-y-2 text-sm leading-relaxed ${className}`}>
      {lines.map((line, lineIndex) => {
        const bullet = line.match(/^\s*([-*•]|\d+\.)\s+(.*)$/);
        const body = bullet ? bullet[2] : line;
        const nodes = renderInline(body, `l${lineIndex}`, onNavigate);

        if (bullet) {
          return (
            <div key={`line-${lineIndex}`} className="flex gap-2">
              <span className="shrink-0 text-slate-400" aria-hidden>
                •
              </span>
              <span className="min-w-0">{nodes}</span>
            </div>
          );
        }

        if (!body.trim()) {
          return <div key={`line-${lineIndex}`} className="h-1" />;
        }

        return (
          <p key={`line-${lineIndex}`} className="m-0">
            {nodes}
          </p>
        );
      })}
    </div>
  );
}
