import { apiRequest } from "@/lib/api";

const BASE = "/admin/marketing-blogs";

export const BLOG_CATEGORIES = [
  { id: "general", label: "General" },
  { id: "product", label: "Product" },
  { id: "guides", label: "Guides" },
  { id: "announcements", label: "Announcements" },
  { id: "industry", label: "Industry" },
];

export function blogCategoryLabel(id) {
  return BLOG_CATEGORIES.find((row) => row.id === id)?.label || id || "General";
}

export async function listMarketingBlogs(params = {}) {
  const searchParams = {};
  if (params.status && params.status !== "all") searchParams.status = params.status;
  if (params.category && params.category !== "all") searchParams.category = params.category;
  if (params.q) searchParams.q = params.q;
  const res = await apiRequest(BASE, { searchParams, loading: false });
  return {
    data: res.data ?? [],
    categories: res.categories ?? BLOG_CATEGORIES.map((row) => row.id),
  };
}

export async function getMarketingBlog(id) {
  return apiRequest(`${BASE}/${id}`, { loading: false });
}

export async function createMarketingBlog(body) {
  return apiRequest(BASE, { method: "POST", body });
}

export async function updateMarketingBlog(id, body) {
  return apiRequest(`${BASE}/${id}`, { method: "PATCH", body });
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
