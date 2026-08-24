"use client";

import Link from "next/link";
import {
  latexToPlain,
  parseMarkdownHeading,
  splitMarkdownContentBlocks,
} from "@/lib/ai-message-format";

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/gi;
/** Match Centrix paths even when wrapped in markdown emphasis. */
const PATH_PATTERN = /(?<![A-Za-z0-9])(\/[a-z][\w\-\/]*(?:\/[\w\-]+)*)/gi;

/**
 * @param {string} text
 * @param {string} keyPrefix
 * @param {((event: import("react").MouseEvent, href: string) => void) | undefined} onNavigate
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
          onClick={
            typeof onNavigate === "function"
              ? (event) => {
                  event.preventDefault();
                  void onNavigate(event, seg.href);
                }
              : undefined
          }
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

const HEADING_CLASS = {
  1: "m-0 text-base font-semibold text-slate-900",
  2: "m-0 text-[0.95rem] font-semibold text-slate-900",
  3: "m-0 text-sm font-semibold text-slate-800",
};

/**
 * @param {{ headers: string[], rows: string[][], startIndex: number }} table
 * @param {((event: import("react").MouseEvent, href: string) => void) | undefined} onNavigate
 */
function renderMarkdownTable(table, onNavigate) {
  return (
    <div key={`table-${table.startIndex}`} className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full min-w-[16rem] border-collapse text-left text-sm">
        <thead className="bg-slate-50">
          <tr>
            {table.headers.map((header, colIndex) => (
              <th
                key={`th-${table.startIndex}-${colIndex}`}
                className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-800"
              >
                {renderInline(header, `th-${table.startIndex}-${colIndex}`, onNavigate)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={`tr-${table.startIndex}-${rowIndex}`} className="odd:bg-white even:bg-slate-50/60">
              {row.map((cell, colIndex) => (
                <td
                  key={`td-${table.startIndex}-${rowIndex}-${colIndex}`}
                  className="border-t border-slate-100 px-3 py-2 align-top text-slate-800"
                >
                  {renderInline(cell, `td-${table.startIndex}-${rowIndex}-${colIndex}`, onNavigate)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Render assistant/user chat text with markdown emphasis, tables, and clickable Centrix paths. */
export function AiMessageContent({ content, onNavigate, className = "" }) {
  if (!content) return null;

  const lines = latexToPlain(String(content)).replace(/\r\n/g, "\n").split("\n");
  const blocks = splitMarkdownContentBlocks(lines);

  return (
    <div className={`space-y-2 text-sm leading-relaxed ${className}`}>
      {blocks.map((block) => {
        if (block.type === "table") {
          return renderMarkdownTable(block, onNavigate);
        }

        const line = block.line;
        const lineIndex = block.index;
        const heading = parseMarkdownHeading(line);
        if (heading) {
          const Tag = heading.level === 1 ? "h3" : heading.level === 2 ? "h4" : "h5";
          const nodes = renderInline(heading.text, `h${lineIndex}`, onNavigate);
          return (
            <Tag key={`line-${lineIndex}`} className={HEADING_CLASS[heading.level] ?? HEADING_CLASS[3]}>
              {nodes}
            </Tag>
          );
        }

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
