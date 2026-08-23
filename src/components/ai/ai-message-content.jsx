"use client";

import Link from "next/link";

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/gi;
const PATH_PATTERN = /(?<=\s|^)(\/[a-z0-9][\w\-\/]*)(?=[\s.,;:!?)}\]"']|$)/gi;

function pushTextParts(parts, text, keyPrefix) {
  if (!text) return;
  parts.push({ key: `${keyPrefix}-text`, type: "text", value: text });
}

function pushLinkParts(parts, content, pattern, keyPrefix, onNavigate) {
  let lastIndex = 0;
  let matchIndex = 0;
  pattern.lastIndex = 0;

  for (const match of content.matchAll(pattern)) {
    const href = match[0];
    const start = match.index ?? 0;
    pushTextParts(parts, content.slice(lastIndex, start), `${keyPrefix}-t${matchIndex}`);
    parts.push({
      key: `${keyPrefix}-l${matchIndex}`,
      type: "link",
      href,
      label: href,
      external: /^https?:\/\//i.test(href),
      onNavigate,
    });
    lastIndex = start + href.length;
    matchIndex += 1;
  }

  pushTextParts(parts, content.slice(lastIndex), `${keyPrefix}-tail`);
}

/** Render assistant/user chat text with clickable internal paths and external URLs. */
export function AiMessageContent({ content, onNavigate, className = "" }) {
  if (!content) return null;

  const parts = [];
  pushLinkParts(parts, content, URL_PATTERN, "url", onNavigate);

  const withPaths = [];
  for (const part of parts) {
    if (part.type !== "text") {
      withPaths.push(part);
      continue;
    }
    pushLinkParts(withPaths, part.value, PATH_PATTERN, part.key, onNavigate);
  }

  return (
    <span className={className}>
      {withPaths.map((part) => {
        if (part.type === "text") {
          return <span key={part.key}>{part.value}</span>;
        }

        if (part.external) {
          return (
            <a
              key={part.key}
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-indigo-600 underline hover:text-indigo-800"
            >
              {part.label}
            </a>
          );
        }

        return (
          <Link
            key={part.key}
            href={part.href}
            className="font-medium text-indigo-600 underline hover:text-indigo-800"
            onClick={part.onNavigate}
          >
            {part.label}
          </Link>
        );
      })}
    </span>
  );
}
