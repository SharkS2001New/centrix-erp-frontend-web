/** Safe arithmetic evaluator for org markup formulas (mirrors backend PricingFormulaEvaluator). */

export const DEFAULT_PRICING_FORMULAS = {
  retail_line: "{aggregate_wholesale} + {tier_markup} * {markup_apps}",
  wholesale_line: "{aggregate_wholesale} + {tier_markup}",
  route_retail: "{line} + {route_markup}",
  route_wholesale: "{line} + {route_markup} * {pack_qty}",
};

export const PRICING_FORMULA_PLACEHOLDERS = {
  retail_line: [
    "aggregate_wholesale",
    "wholesale_total",
    "base_price",
    "per_small",
    "wholesale_unit",
    "tier_markup",
    "markup",
    "flat_markup",
    "markup_apps",
    "apps",
    "one",
    "scaled_markup",
    "qty_markup",
    "qty",
    "quantity",
    "pack_qty",
    "packs",
    "conversion_factor",
    "conversion",
    "middle_factor",
  ],
  wholesale_line: [
    "aggregate_wholesale",
    "wholesale_total",
    "base_price",
    "per_small",
    "wholesale_unit",
    "tier_markup",
    "markup",
    "flat_markup",
    "markup_apps",
    "apps",
    "one",
    "scaled_markup",
    "qty_markup",
    "qty",
    "quantity",
    "pack_qty",
    "packs",
    "conversion_factor",
    "conversion",
    "middle_factor",
  ],
  route_retail: [
    "line",
    "line_total",
    "route_markup",
    "markup",
    "flat_route",
    "scaled_route",
    "pack_qty",
    "packs",
    "qty",
    "quantity",
    "one",
  ],
  route_wholesale: [
    "line",
    "line_total",
    "route_markup",
    "markup",
    "flat_route",
    "scaled_route",
    "pack_qty",
    "packs",
    "qty",
    "quantity",
    "one",
  ],
};

export const PRICING_FORMULA_EXAMPLES = {
  retail_line: [
    { label: "Per markup chunk (default)", formula: "{aggregate_wholesale} + {tier_markup} * {markup_apps}" },
    { label: "Once on whole line", formula: "{aggregate_wholesale} + {tier_markup}" },
    { label: "Per small unit qty", formula: "{aggregate_wholesale} + {tier_markup} * {qty}" },
    { label: "Per pack", formula: "{aggregate_wholesale} + {tier_markup} * {pack_qty}" },
  ],
  wholesale_line: [
    { label: "Once on whole line (default)", formula: "{aggregate_wholesale} + {tier_markup}" },
    { label: "Per small unit qty", formula: "{aggregate_wholesale} + {tier_markup} * {qty}" },
    { label: "Per pack", formula: "{aggregate_wholesale} + {tier_markup} * {pack_qty}" },
  ],
  route_retail: [
    { label: "Once on line (default)", formula: "{line} + {route_markup}" },
    { label: "Per small unit qty", formula: "{line} + {route_markup} * {qty}" },
    { label: "Per pack", formula: "{line} + {route_markup} * {pack_qty}" },
  ],
  route_wholesale: [
    { label: "Per pack (default)", formula: "{line} + {route_markup} * {pack_qty}" },
    { label: "Once on line", formula: "{line} + {route_markup}" },
    { label: "Per small unit qty", formula: "{line} + {route_markup} * {qty}" },
  ],
};

export const PRICING_FORMULA_LABELS = {
  retail_line: "Retail line total",
  wholesale_line: "Wholesale line total",
  route_retail: "Route markup on retail lines",
  route_wholesale: "Route markup on wholesale lines",
};

export function normalizePricingFormulas(raw) {
  const out = { ...DEFAULT_PRICING_FORMULAS };
  if (!raw || typeof raw !== "object") return out;
  for (const key of Object.keys(DEFAULT_PRICING_FORMULAS)) {
    const value = String(raw[key] ?? "").trim();
    if (value) out[key] = value;
  }
  return out;
}

export function buildLineFormulaVars({
  aggregateWholesale,
  tierMarkup,
  markupApps,
  qty,
  packQty,
  conversion,
  perSmall,
  middleFactor,
  basePrice,
}) {
  const apps = Math.max(0, Number(markupApps) || 0);
  const markup = Number(tierMarkup) || 0;
  const quantity = Number(qty) || 0;
  const packs = Number(packQty) || 0;
  return {
    aggregate_wholesale: Number(aggregateWholesale) || 0,
    wholesale_total: Number(aggregateWholesale) || 0,
    base_price: Number(basePrice) || 0,
    per_small: Number(perSmall) || 0,
    wholesale_unit: Number(perSmall) || 0,
    tier_markup: markup,
    markup,
    flat_markup: markup,
    markup_apps: apps,
    apps,
    one: 1,
    scaled_markup: markup * apps,
    qty_markup: markup * quantity,
    qty: quantity,
    quantity,
    pack_qty: packs,
    packs,
    conversion_factor: Number(conversion) || 1,
    conversion: Number(conversion) || 1,
    middle_factor: Number(middleFactor) || 1,
  };
}

export function buildRouteFormulaVars({ lineAmount, routeMarkup, packQty, qty }) {
  const markup = Math.max(0, Number(routeMarkup) || 0);
  const packs = Math.max(0, Number(packQty) || 0);
  const quantity = Number(qty) || 0;
  const line = Number(lineAmount) || 0;
  return {
    line,
    line_total: line,
    route_markup: markup,
    markup,
    flat_route: markup,
    scaled_route: markup * packs,
    pack_qty: packs,
    packs,
    qty: quantity,
    quantity,
    one: 1,
  };
}

function formatNumber(num) {
  if (!Number.isFinite(num)) return "0";
  return String(Number(num));
}

function substitute(formula, vars) {
  let out = String(formula ?? "").trim();
  if (!out) throw new Error("Formula is empty.");
  const keys = Object.keys(vars).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const num = Number(vars[key] ?? 0);
    out = out.replaceAll(new RegExp(`\\{${key}\\}`, "gi"), formatNumber(num));
  }
  if (/\{[a-z][a-z0-9_]*\}/i.test(out)) {
    throw new Error("Unknown placeholder in formula.");
  }
  return out;
}

function tokenize(expression) {
  const tokens = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if ("+*/()".includes(ch)) {
      tokens.push(ch);
      i += 1;
      continue;
    }
    if (ch === "-") {
      const prev = tokens.length ? tokens[tokens.length - 1] : null;
      const unary = !prev || prev === "(" || "+-*/".includes(prev);
      if (unary) {
        i += 1;
        let start = i;
        while (i < expression.length && /[0-9.]/.test(expression[i])) i += 1;
        if (start === i) throw new Error("Invalid unary minus.");
        tokens.push(`-${expression.slice(start, i)}`);
        continue;
      }
      tokens.push("-");
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let start = i;
      while (i < expression.length && /[0-9.]/.test(expression[i])) i += 1;
      tokens.push(expression.slice(start, i));
      continue;
    }
    throw new Error("Unexpected character in formula.");
  }
  return tokens;
}

function toRpn(tokens) {
  const output = [];
  const stack = [];
  const precedence = { "+": 1, "-": 1, "*": 2, "/": 2 };
  for (const token of tokens) {
    if (!Number.isNaN(Number(token)) && token !== "") {
      output.push(token);
      continue;
    }
    if (token === "(") {
      stack.push(token);
      continue;
    }
    if (token === ")") {
      while (stack.length && stack[stack.length - 1] !== "(") {
        output.push(stack.pop());
      }
      if (!stack.length || stack.pop() !== "(") throw new Error("Mismatched parentheses.");
      continue;
    }
    while (
      stack.length &&
      precedence[stack[stack.length - 1]] != null &&
      precedence[stack[stack.length - 1]] >= precedence[token]
    ) {
      output.push(stack.pop());
    }
    stack.push(token);
  }
  while (stack.length) {
    const op = stack.pop();
    if (op === "(" || op === ")") throw new Error("Mismatched parentheses.");
    output.push(op);
  }
  return output;
}

function evalRpn(rpn) {
  const stack = [];
  for (const token of rpn) {
    if (!Number.isNaN(Number(token)) && !"+-*/".includes(token)) {
      stack.push(Number(token));
      continue;
    }
    if (stack.length < 2) throw new Error("Invalid expression.");
    const b = stack.pop();
    const a = stack.pop();
    if (token === "+") stack.push(a + b);
    else if (token === "-") stack.push(a - b);
    else if (token === "*") stack.push(a * b);
    else if (token === "/") {
      if (Math.abs(b) < 1e-12) throw new Error("Division by zero.");
      stack.push(a / b);
    } else throw new Error("Unknown operator.");
  }
  if (stack.length !== 1) throw new Error("Invalid expression.");
  return stack[0];
}

export function evaluatePricingFormula(formula, vars, fallback = null) {
  try {
    const expression = substitute(formula, vars).replace(/\s+/g, "");
    if (!/^[0-9+\-*/().]+$/.test(expression)) {
      throw new Error("Expression contains invalid characters.");
    }
    const value = evalRpn(toRpn(tokenize(expression)));
    if (!Number.isFinite(value)) throw new Error("Non-finite result.");
    return Math.round(value * 100) / 100;
  } catch (e) {
    if (fallback != null && Number.isFinite(fallback)) {
      return Math.round(Number(fallback) * 100) / 100;
    }
    throw e;
  }
}

export function getPricingFormulas(moduleSettings) {
  return normalizePricingFormulas(moduleSettings?.sales?.pricing_formulas);
}
