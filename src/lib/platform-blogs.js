import { apiRequest } from "@/lib/api";

const BASE = "/admin/marketing-blogs";
const CATEGORIES_BASE = "/admin/marketing-blog-categories";

export const DEFAULT_BLOG_CATEGORIES = [
  { id: "general", label: "General" },
  { id: "product", label: "Product" },
  { id: "guides", label: "Guides" },
  { id: "announcements", label: "Announcements" },
  { id: "industry", label: "Industry" },
];

/** Normalize API categories (strings or {id,label}) into option rows. */
export function normalizeBlogCategories(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_BLOG_CATEGORIES;
  }
  return raw.map((row) => {
    if (typeof row === "string") {
      const fallback = DEFAULT_BLOG_CATEGORIES.find((c) => c.id === row);
      return fallback || { id: row, label: row.charAt(0).toUpperCase() + row.slice(1) };
    }
    return {
      id: row.id || row.slug || "",
      label: row.label || row.name || row.id || "",
    };
  }).filter((row) => row.id);
}

export function blogCategoryLabel(id, categories = DEFAULT_BLOG_CATEGORIES) {
  const list = normalizeBlogCategories(categories);
  return list.find((row) => row.id === id)?.label || id || "General";
}

export async function listMarketingBlogs(params = {}) {
  const searchParams = {};
  if (params.status && params.status !== "all") searchParams.status = params.status;
  if (params.category && params.category !== "all") searchParams.category = params.category;
  if (params.q) searchParams.q = params.q;
  const res = await apiRequest(BASE, { searchParams, loading: false });
  return {
    data: res.data ?? [],
    categories: normalizeBlogCategories(res.categories),
  };
}

export async function listMarketingBlogCategories() {
  const res = await apiRequest(CATEGORIES_BASE, { loading: false });
  return normalizeBlogCategories(res.data ?? res.categories);
}

export async function createMarketingBlogCategory(label) {
  const res = await apiRequest(CATEGORIES_BASE, {
    method: "POST",
    body: { label },
  });
  return {
    category: res.data,
    categories: normalizeBlogCategories(res.categories ?? [res.data]),
  };
}

export async function getMarketingBlog(id) {
  const res = await apiRequest(`${BASE}/${id}`, { loading: false });
  return {
    data: res.data,
    categories: normalizeBlogCategories(res.categories),
  };
}

export async function createMarketingBlog(body) {
  return apiRequest(BASE, { method: "POST", body });
}

export async function updateMarketingBlog(id, body) {
  return apiRequest(`${BASE}/${id}`, { method: "PATCH", body });
}

export async function generateMarketingBlogCoverImage(id, instruction) {
  return apiRequest(`${BASE}/${id}/generate-cover-image`, {
    method: "POST",
    body: instruction ? { instruction } : {},
  });
}

export async function publishMarketingBlog(id) {
  return apiRequest(`${BASE}/${id}/publish`, { method: "POST", body: {} });
}

export async function unpublishMarketingBlog(id) {
  return apiRequest(`${BASE}/${id}/unpublish`, { method: "POST", body: {} });
}

export async function deleteMarketingBlog(id) {
  return apiRequest(`${BASE}/${id}`, { method: "DELETE" });
}

export async function purgeMarketingBlogCache(slug) {
  return apiRequest(`${BASE}/purge-cache`, {
    method: "POST",
    body: slug ? { slug } : {},
  });
}
