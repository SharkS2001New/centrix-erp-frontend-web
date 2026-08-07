#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();

function addImport(content, name) {
  const re = /import\s*\{([^}]+)\}\s*from\s*"@\/components\/catalog\/catalog-shared";/;
  const m = content.match(re);
  if (m) {
    const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    if (names.includes(name)) return content;
    names.push(name);
    return content.replace(re, `import { ${names.join(", ")} } from "@/components/catalog/catalog-shared";`);
  }
  const firstImportEnd = content.indexOf("\n", content.indexOf("import "));
  if (firstImportEnd === -1) return content;
  return (
    content.slice(0, firstImportEnd + 1) +
    `import { ${name} } from "@/components/catalog/catalog-shared";\n` +
    content.slice(firstImportEnd + 1)
  );
}

function extractAttr(attrs, name) {
  const re = new RegExp(`${name}=\\{`, "g");
  const m = re.exec(attrs);
  if (!m) {
    const sm = attrs.match(new RegExp(`${name}="([^"]*)"`));
    return sm ? `"${sm[1]}"` : null;
  }
  let i = m.index + name.length + 2;
  let depth = 1;
  while (i < attrs.length && depth > 0) {
    const ch = attrs[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return attrs.slice(m.index + name.length + 2, i - 1).trim();
}

function parseOptions(block) {
  const mapM = block.match(/\{([A-Za-z_][\w.]*)\.map\(\(([^)]*)\)\s*=>\s*\(\s*\n([\s\S]*?)\)\)\}/);
  if (mapM) {
    const [, arr, paramRaw, inner] = mapM;
    const param = paramRaw.trim().split(/\s+/)[0];
    const valM = inner.match(/value=\{([^}]+)\}/);
    const val = valM ? valM[1].trim() : `${param}.value ?? ${param}.id`;
    let labelExpr = null;
    const labelM = inner.match(/>\s*\n?\s*\{([^}]+)\}\s*\n?\s*<\/option>/);
    if (labelM) labelExpr = labelM[1].trim();
    else {
      const textM = inner.match(/>\s*\n?\s*([^<{][^\n]*?)\s*\n?\s*<\/option>/);
      if (textM) labelExpr = `"${textM[1].trim()}"`;
    }
    if (!labelExpr) {
      if (inner.includes(`${param}.label`)) labelExpr = `${param}.label`;
      else if (inner.includes(`${param}.branch_name`)) labelExpr = `${param}.branch_name`;
      else if (inner.includes(`${param}.route_name`)) labelExpr = `${param}.route_name ?? ${param}.name`;
      else if (inner.includes(`${param}.org_name`)) labelExpr = `${param}.org_name`;
      else if (inner.includes(`${param}.name`)) labelExpr = `${param}.name`;
      else labelExpr = `String(${param}.label ?? ${param}.name ?? ${param}.id)`;
    }
    return `${arr}.map((${paramRaw}) => ({ value: ${val}, label: ${labelExpr} }))`;
  }

  const opts = [];
  const optRe = /<option([^>]*)>([\s\S]*?)<\/option>/g;
  let om;
  while ((om = optRe.exec(block)) !== null) {
    const oa = om[1];
    const body = om[2].trim();
    const vm = oa.match(/value=\{([^}]+)\}|value="([^"]*)"/);
    const val = vm ? (vm[1] ?? JSON.stringify(vm[2] ?? "")) : '""';
    const label = body.includes("{") ? body : JSON.stringify(body);
    opts.push(`{ value: ${val}, label: ${label} }`);
  }
  return opts.length ? `[${opts.join(", ")}]` : null;
}

function convertSelectBlock(block) {
  if (block.includes("SearchableSelect") || block.includes("FilterSelect")) return block;
  const open = block.match(/^(\s*)<select\b([\s\S]*?)>\s*\n/m);
  if (!open) return block;

  const indent = open[1];
  const attrs = open[2];
  const className = extractAttr(attrs, "className");
  const value = extractAttr(attrs, "value") ?? extractAttr(attrs, "defaultValue");
  const onChange = extractAttr(attrs, "onChange");
  const disabled = extractAttr(attrs, "disabled");
  const required = extractAttr(attrs, "required");
  const id = extractAttr(attrs, "id");
  const title = extractAttr(attrs, "title");

  if (!onChange) return block;
  const optionsExpr = parseOptions(block);
  if (!optionsExpr) return block;

  const useFilter = className && /FILTER_CONTROL|w-auto/.test(className);
  const comp = useFilter ? "FilterSelect" : "SearchableSelect";
  const needsNative = /e\.target\.value|event\.target\.value/.test(onChange);

  const lines = [`${indent}<${comp}`];
  if (id) lines.push(`${indent}  id={${id}}`);
  if (className) lines.push(`${indent}  className={${className}}`);
  if (value != null) lines.push(`${indent}  value={${value}}`);
  if (needsNative && comp === "SearchableSelect") lines.push(`${indent}  nativeEvent`);
  lines.push(`${indent}  onChange={${onChange}}`);
  if (disabled != null) lines.push(`${indent}  disabled={${disabled}}`);
  if (required != null) lines.push(`${indent}  required={${required}}`);
  if (title) lines.push(`${indent}  searchPlaceholder={${title.startsWith('"') ? title : JSON.stringify(title)}}`);
  lines.push(`${indent}  options={${optionsExpr}}`);
  lines.push(`${indent}/>`);
  return { text: lines.join("\n"), comp };
}

function convertFile(rel) {
  const full = path.join(root, rel);
  let content = fs.readFileSync(full, "utf8");
  if (!content.includes("<select")) return { rel, ok: false, left: 0 };

  const original = content;
  const comps = new Set();
  content = content.replace(/<select[\s\S]*?<\/select>/g, (block) => {
    const parsed = convertSelectBlock(block);
    if (typeof parsed === "string") return parsed;
    comps.add(parsed.comp);
    return parsed.text;
  });

  if (content === original) {
    return { rel, ok: false, left: (content.match(/<select/g) || []).length };
  }
  for (const c of comps) content = addImport(content, c);
  fs.writeFileSync(full, content);
  return { rel, ok: true, left: (content.match(/<select/g) || []).length };
}

const files = process.argv.slice(2);
const results = files.map(convertFile);
for (const r of results) console.log(JSON.stringify(r));
console.log("converted", results.filter((r) => r.ok).length, "remaining", results.reduce((s, r) => s + (r.left || 0), 0));
