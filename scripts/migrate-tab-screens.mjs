#!/usr/bin/env node
/**
 * Migrate all (app) tab-workspace pages into tab-screens + registry entries.
 *
 * Usage: node scripts/migrate-tab-screens.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APP_ROOT = path.join(ROOT, "src/app/(app)");
const SCREENS_DIR = path.join(ROOT, "src/components/tab-screens");
const REGISTRY_OUT = path.join(ROOT, "src/lib/screen-registry.generated.js");
const COMPONENTS_OUT = path.join(ROOT, "src/lib/screen-registry-components.generated.jsx");

/** Prefer these existing screen modules instead of re-extracting. */
const PREFERRED_SCREENS = {
  dashboard: {
    importPath: "@/components/dashboard/overview-dashboard",
    exportName: "OverviewDashboard",
    title: "Business summary",
  },
  "sales-pos": {
    importPath: "@/components/sales/pos-screen",
    exportName: "default",
    title: "Create order",
  },
  customers: {
    importPath: "@/components/customers/customers-list-screen",
    exportName: "CustomersListScreen",
    title: "Customers",
  },
};

function walkPages(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "platform") continue;
      walkPages(full, out);
    } else if (entry.name === "page.jsx") {
      out.push(full);
    }
  }
  return out;
}

function routeFromPageFile(file) {
  const rel = path.relative(APP_ROOT, path.dirname(file));
  if (!rel || rel === ".") return "/";
  return `/${rel.split(path.sep).join("/")}`;
}

function screenIdFromRoute(route) {
  if (route === "/") return "home";
  return route
    .replace(/^\//, "")
    .split("/")
    .map((seg) => (seg.startsWith("[") && seg.endsWith("]") ? seg.slice(1, -1) : seg))
    .join("-")
    .replace(/[^a-zA-Z0-9-]/g, "-");
}

function toPascalCase(id) {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function titleFromRoute(route) {
  const parts = route.split("/").filter(Boolean);
  if (parts.length === 0) return "Home";
  const last = parts[parts.length - 1];
  if (last.startsWith("[")) {
    const prev = parts[parts.length - 2] || "Item";
    return humanize(prev.replace(/\[|\]/g, ""));
  }
  return humanize(last);
}

function humanize(segment) {
  return segment.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build sibling static names for each dynamic route so /customers/[id] won't steal /customers/new. */
function buildSiblingExclusions(routes) {
  /** @type {Map<string, Set<string>>} */
  const byParent = new Map();
  for (const route of routes) {
    const parts = route.split("/").filter(Boolean);
    for (let i = 0; i < parts.length; i += 1) {
      const parent = "/" + parts.slice(0, i).join("/");
      const seg = parts[i];
      if (seg.startsWith("[")) continue;
      if (!byParent.has(parent === "/" ? "" : parent)) {
        byParent.set(parent === "/" ? "" : parent, new Set());
      }
      byParent.get(parent === "/" ? "" : parent).add(seg);
    }
  }
  return byParent;
}

function specificityScore(route) {
  const parts = route.split("/").filter(Boolean);
  const dynamic = parts.filter((p) => p.startsWith("[")).length;
  return parts.length * 100 - dynamic * 10 + (dynamic === 0 ? 5 : 0);
}

function buildMatchSource(route, siblingExclusions) {
  const parts = route.split("/").filter(Boolean);
  if (parts.length === 0) {
    return { kind: "exact", value: "/" };
  }

  const hasDynamic = parts.some((p) => p.startsWith("["));
  if (!hasDynamic) {
    return { kind: "exact", value: route };
  }

  const regexParts = [];
  const excludesByGroup = [];
  let groupIndex = 0;

  for (let i = 0; i < parts.length; i += 1) {
    const seg = parts[i];
    if (seg.startsWith("[") && seg.endsWith("]")) {
      groupIndex += 1;
      regexParts.push("([^/]+)");
      const parent = i === 0 ? "" : "/" + parts.slice(0, i).join("/");
      // Sibling static names under this parent (from full route tree).
      const siblings = siblingExclusions.get(parent) || new Set();
      // Also exclude known static leaf siblings at this depth from routes that share prefix.
      excludesByGroup.push({ groupIndex, values: [...siblings] });
    } else {
      regexParts.push(seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    }
  }

  return {
    kind: "regex",
    pattern: `^/${regexParts.join("/")}$`,
    excludesByGroup: excludesByGroup.filter((g) => g.values.length > 0),
  };
}

function isAlreadyStub(text) {
  return /if\s*\(\s*enabled\s*\)\s*return\s+null/.test(text);
}

function parseStubFallback(text) {
  const preferred = text.match(/return\s+<\s*([A-Za-z0-9_]+)\s*\/>/);
  const preferred2 = text.match(/return\s+<\s*([A-Za-z0-9_]+)\s*>/);
  const name = preferred?.[1] || preferred2?.[1];
  if (!name) return null;

  const defaultImp = text.match(
    new RegExp(`import\\s+${name}\\s+from\\s+[\"']([^\"']+)[\"']`),
  );
  if (defaultImp) {
    return { importPath: defaultImp[1], exportName: "default", localName: name };
  }
  const namedImp = text.match(
    new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s+[\"']([^\"']+)[\"']`),
  );
  if (namedImp) {
    return { importPath: namedImp[1], exportName: name, localName: name };
  }
  return null;
}

function extractDefaultExportName(text) {
  const m = text.match(/export\s+default\s+function\s+([A-Za-z0-9_]+)/);
  return m?.[1] || null;
}

function transformPageToScreen(text, exportName) {
  // Redirect-only server pages → client router.replace shims.
  if (/\bredirect\s*\(/.test(text) && !/\buseState\b/.test(text) && !/\bapiRequest\b/.test(text)) {
    const redirectMatch = text.match(/redirect\s*\((.+?)\)\s*;/);
    const targetExpr = redirectMatch?.[1]?.trim();
    if (!targetExpr) {
      throw new Error(`Could not parse redirect() target for ${exportName}`);
    }
    const usesParams = /\bparams\b/.test(text);
    if (usesParams) {
      return `"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export function ${exportName}() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id ?? params?.code ?? params?.lpoNo ?? params?.ref ?? params?.slug;

  useEffect(() => {
    if (id == null || id === "") return;
    router.replace(${targetExpr});
  }, [id, router]);

  return null;
}
`;
    }
    return `"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ${exportName}() {
  const router = useRouter();

  useEffect(() => {
    router.replace(${targetExpr});
  }, [router]);

  return null;
}
`;
  }

  let next = text;
  if (!/^["']use client["']/.test(next.trim())) {
    next = `"use client";\n\n${next}`;
  }

  if (/export\s+default\s+async\s+function\s+[A-Za-z0-9_]+/.test(next)) {
    // Drop async — screens are client components.
    next = next.replace(
      /export\s+default\s+async\s+function\s+[A-Za-z0-9_]+/,
      `export function ${exportName}`,
    );
  } else if (/export\s+default\s+function\s+[A-Za-z0-9_]+/.test(next)) {
    next = next.replace(
      /export\s+default\s+function\s+[A-Za-z0-9_]+/,
      `export function ${exportName}`,
    );
  } else if (/export\s+default\s+[A-Za-z0-9_]+/.test(next)) {
    next = next.replace(
      /export\s+default\s+([A-Za-z0-9_]+)\s*;/,
      `export { $1 as ${exportName} };`,
    );
  } else {
    throw new Error(`Cannot find default export to convert for ${exportName}`);
  }

  return next;
}

function stubPageSource(exportSymbol, importPath, isDefault) {
  const importLine = isDefault
    ? `import ${exportSymbol} from "${importPath}";`
    : `import { ${exportSymbol} } from "${importPath}";`;
  return `"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
${importLine}

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <${exportSymbol} />;
}
`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  ensureDir(SCREENS_DIR);
  const pages = walkPages(APP_ROOT);
  const routes = pages.map(routeFromPageFile);
  const siblingExclusions = buildSiblingExclusions(routes);

  /** @type {Array<{ id: string, route: string, title: string, match: object, importPath: string, exportName: string, localName: string }>} */
  const entries = [];

  for (const file of pages) {
    const route = routeFromPageFile(file);
    const id = screenIdFromRoute(route);
    const title = PREFERRED_SCREENS[id]?.title || titleFromRoute(route);
    const text = fs.readFileSync(file, "utf8");
    const match = buildMatchSource(route, siblingExclusions);
    const exportName = `${toPascalCase(id)}Screen`;

    if (PREFERRED_SCREENS[id]) {
      const pref = PREFERRED_SCREENS[id];
      entries.push({
        id,
        route,
        title,
        match,
        importPath: pref.importPath,
        exportName: pref.exportName,
        localName: pref.exportName === "default" ? toPascalCase(id) : pref.exportName,
      });
      // Ensure stub page points at preferred screen.
      const local = pref.exportName === "default" ? toPascalCase(id) : pref.exportName;
      fs.writeFileSync(
        file,
        stubPageSource(local, pref.importPath, pref.exportName === "default"),
      );
      continue;
    }

    if (isAlreadyStub(text)) {
      const fallback = parseStubFallback(text);
      if (!fallback) {
        throw new Error(`Stub page without fallback component: ${file}`);
      }
      entries.push({
        id,
        route,
        title,
        match,
        importPath: fallback.importPath,
        exportName: fallback.exportName,
        localName: fallback.localName,
      });
      continue;
    }

    // Extract full page into tab-screens/{id}.jsx
    const screenAbs = path.join(SCREENS_DIR, `${id}.jsx`);
    const screenText = transformPageToScreen(text, exportName);
    fs.writeFileSync(screenAbs, screenText);
    fs.writeFileSync(
      file,
      stubPageSource(exportName, `@/components/tab-screens/${id}`, false),
    );

    entries.push({
      id,
      route,
      title,
      match,
      importPath: `@/components/tab-screens/${id}`,
      exportName,
      localName: exportName,
    });
  }

  // Sort most specific first for first-match resolveScreen
  entries.sort((a, b) => specificityScore(b.route) - specificityScore(a.route));

  const registryJs = `/**
 * AUTO-GENERATED by scripts/migrate-tab-screens.mjs — do not edit by hand.
 */

import { normalizeTabHref } from "@/lib/tab-workspace";

/** @typedef {{ id: string, title: string, match: (pathname: string) => boolean, route: string }} RegistryScreenDef */

${entries
  .map((e) => {
    if (e.match.kind === "exact") {
      return `function match_${e.id.replace(/-/g, "_")}(pathname) {
  return pathname === ${JSON.stringify(e.match.value)};
}`;
    }
    const excl = e.match.excludesByGroup || [];
    const checks = excl
      .map(
        (g) =>
          `  if (${JSON.stringify(g.values)}.includes(m[${g.groupIndex}])) return false;`,
      )
      .join("\n");
    return `function match_${e.id.replace(/-/g, "_")}(pathname) {
  const m = pathname.match(${JSON.stringify(e.match.pattern)});
  if (!m) return false;
${checks}
  return true;
}`;
  })
  .join("\n\n")}

/** @type {RegistryScreenDef[]} */
export const SCREEN_REGISTRY = [
${entries
  .map(
    (e) => `  {
    id: ${JSON.stringify(e.id)},
    title: ${JSON.stringify(e.title)},
    route: ${JSON.stringify(e.route)},
    match: match_${e.id.replace(/-/g, "_")},
  },`,
  )
  .join("\n")}
];

export function pathnameFromTabHref(href) {
  const normalized = normalizeTabHref(href);
  return normalized.split("?")[0] || "/";
}

/** @returns {RegistryScreenDef | null} */
export function resolveScreen(href) {
  const pathname = pathnameFromTabHref(href);
  return SCREEN_REGISTRY.find((entry) => entry.match(pathname)) ?? null;
}

export function isRegisteredHref(href) {
  return resolveScreen(href) != null;
}
`;

  const mapLines = [];
  for (const e of entries) {
    if (e.exportName === "default") {
      mapLines.push(
        `  ${JSON.stringify(e.id)}: lazy(() => import(${JSON.stringify(e.importPath)})),`,
      );
    } else {
      mapLines.push(
        `  ${JSON.stringify(e.id)}: lazy(() =>
    import(${JSON.stringify(e.importPath)}).then((m) => ({ default: m.${e.exportName} })),
  ),`,
      );
    }
  }

  const componentsJsx = `"use client";

/**
 * AUTO-GENERATED by scripts/migrate-tab-screens.mjs — do not edit by hand.
 * Screens load on first open (React.lazy) so the shell stays light.
 */

import { lazy } from "react";

/** @type {Record<string, import("react").ComponentType>} */
export const SCREEN_COMPONENTS = {
${mapLines.join("\n")}
};
`;

  fs.writeFileSync(REGISTRY_OUT, registryJs);
  fs.writeFileSync(COMPONENTS_OUT, componentsJsx);

  // Point public modules at generated output
  fs.writeFileSync(
    path.join(ROOT, "src/lib/screen-registry.js"),
    `export {
  SCREEN_REGISTRY,
  pathnameFromTabHref,
  resolveScreen,
  isRegisteredHref,
} from "./screen-registry.generated.js";
`,
  );
  fs.writeFileSync(
    path.join(ROOT, "src/lib/screen-registry-components.jsx"),
    `export { SCREEN_COMPONENTS } from "./screen-registry-components.generated.jsx";
`,
  );

  console.log(`Migrated ${entries.length} screens.`);
  console.log(`Wrote ${path.relative(ROOT, REGISTRY_OUT)}`);
  console.log(`Wrote ${path.relative(ROOT, COMPONENTS_OUT)}`);
  console.log(`Wrote ${entries.filter((e) => e.importPath.includes("tab-screens")).length} extracted tab-screen files`);
}

main();
