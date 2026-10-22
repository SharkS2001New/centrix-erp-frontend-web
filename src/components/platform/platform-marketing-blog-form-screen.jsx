"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiUpload } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { MarketingBlogEditor } from "@/components/platform/marketing-blog-editor";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  DEFAULT_BLOG_CATEGORIES,
  createMarketingBlog,
  createMarketingBlogCategory,
  getMarketingBlog,
  listMarketingBlogCategories,
  publishMarketingBlog,
  purgeMarketingBlogCache,
  unpublishMarketingBlog,
  updateMarketingBlog,
} from "@/lib/platform-blogs";

const EMPTY_FORM = {
  title: "",
  slug: "",
  excerpt: "",
  body: "",
  cover_image_url: "",
  category: "general",
  author_name: "",
  seo_title: "",
  seo_description: "",
};

function bodyIsEmpty(html) {
  const text = String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
  return text === "";
}

function CategoryCreateModal({ open, onClose, onCreated }) {
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setLabel("");
  }, [open]);

  if (!open) return null;

  async function submit(event) {
    event.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) {
      notifyError("Category name is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await createMarketingBlogCategory(trimmed);
      notifySuccess("Category created.");
      onCreated(res.category, res.categories);
      onClose();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not create category.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 shadow-xl">
        <h2 className="text-base font-semibold text-[var(--theme-text)]">New category</h2>
        <p className="mt-1 text-sm text-[var(--theme-muted)]">
          Categories appear in the post form and on the public Resources blog filters.
        </p>
        <form className="mt-4 grid gap-4" onSubmit={(e) => void submit(e)}>
          <Field label="Name" required>
            <input
              className={inputClassName()}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Case studies"
              autoFocus
              maxLength={80}
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={SECONDARY_BTN_CLASS} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <PrimaryButton type="submit" showIcon={false} disabled={saving}>
              {saving ? "Saving…" : "Create category"}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PlatformMarketingBlogFormScreen({ blogId = null }) {
  const router = useRouter();
  const isEdit = blogId != null;
  const coverInputRef = useRef(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState("draft");
  const [categories, setCategories] = useState(DEFAULT_BLOG_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [purging, setPurging] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [savedId, setSavedId] = useState(blogId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!blogId) {
        try {
          const cats = await listMarketingBlogCategories();
          setCategories(cats.length ? cats : DEFAULT_BLOG_CATEGORIES);
        } catch {
          setCategories(DEFAULT_BLOG_CATEGORIES);
        }
        return;
      }
      const res = await getMarketingBlog(blogId);
      const full = res?.data;
      if (!full) throw new Error("Post not found.");
      setForm({
        title: full.title ?? "",
        slug: full.slug ?? "",
        excerpt: full.excerpt ?? "",
        body: full.body ?? "",
        cover_image_url: full.cover_image_url ?? "",
        category: full.category ?? "general",
        author_name: full.author_name ?? "",
        seo_title: full.seo_title ?? "",
        seo_description: full.seo_description ?? "",
      });
      setStatus(full.status ?? "draft");
      setCategories(res.categories?.length ? res.categories : DEFAULT_BLOG_CATEGORIES);
      setSavedId(full.id);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not load post.");
      router.replace("/platform/blogs");
    } finally {
      setLoading(false);
    }
  }, [blogId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePost({ andPublish = false } = {}) {
    if (!form.title.trim() || bodyIsEmpty(form.body)) {
      notifyError("Title and body are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        slug: form.slug.trim() || undefined,
        excerpt: form.excerpt.trim() || null,
        body: form.body,
        cover_image_url: form.cover_image_url.trim() || null,
        category: form.category || "general",
        author_name: form.author_name.trim() || null,
        seo_title: form.seo_title.trim() || null,
        seo_description: form.seo_description.trim() || null,
      };
      let id = savedId;
      if (id) {
        const res = await updateMarketingBlog(id, payload);
        if (res?.data?.slug) setForm((prev) => ({ ...prev, slug: res.data.slug }));
        notifySuccess("Blog updated.");
      } else {
        const res = await createMarketingBlog(payload);
        id = res?.data?.id ?? null;
        setSavedId(id);
        if (res?.data?.slug) setForm((prev) => ({ ...prev, slug: res.data.slug }));
        notifySuccess("Blog draft created.");
        if (id) {
          router.replace(`/platform/blogs/${id}/edit`);
        }
      }
      if (andPublish && id) {
        await publishMarketingBlog(id);
        setStatus("published");
        notifySuccess("Published to the CentrixERP Resources blog.");
      }
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save blog.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish() {
    if (!savedId) {
      await savePost({ andPublish: true });
      return;
    }
    setBusy(true);
    try {
      if (status === "published") {
        await unpublishMarketingBlog(savedId);
        setStatus("draft");
        notifySuccess("Unpublished from the public website.");
      } else {
        await publishMarketingBlog(savedId);
        setStatus("published");
        notifySuccess("Published to the CentrixERP Resources blog.");
      }
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Publish action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadCover(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setCoverUploading(true);
    try {
      const res = await apiUpload("/admin/marketing-blogs/upload-image", file, "image", {
        preset: "photo",
      });
      if (!res?.url) throw new Error("No URL returned.");
      setForm((prev) => ({ ...prev, cover_image_url: res.url }));
      notifySuccess("Cover image uploaded.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Cover upload failed.");
    } finally {
      setCoverUploading(false);
    }
  }

  async function clearCaches() {
    setPurging(true);
    try {
      await purgeMarketingBlogCache(form.slug || undefined);
      notifySuccess("Blog caches cleared (API + website).");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not purge caches.");
    } finally {
      setPurging(false);
    }
  }

  if (loading) {
    return (
      <CatalogPageShell title={isEdit ? "Edit post" : "New post"} backHref="/platform/blogs" backLabel="Blogs">
        <p className="text-sm text-[var(--theme-muted)]">Loading…</p>
      </CatalogPageShell>
    );
  }

  return (
    <>
      <CatalogPageShell
        title={isEdit || savedId ? "Edit post" : "New post"}
        subtitle="Images are compressed on upload (max 1200px JPEG). Published posts appear under Resources → Blog."
        backHref="/platform/blogs"
        backLabel="Blogs"
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              disabled={purging}
              onClick={() => void clearCaches()}
            >
              {purging ? "Clearing…" : "Clear cache"}
            </button>
            {(isEdit || savedId) && (
              <button
                type="button"
                className={SECONDARY_BTN_CLASS}
                disabled={busy || saving}
                onClick={() => void togglePublish()}
              >
                {busy ? "…" : status === "published" ? "Unpublish" : "Publish"}
              </button>
            )}
            <PrimaryButton type="button" showIcon={false} disabled={saving} onClick={() => void savePost()}>
              {saving ? "Saving…" : savedId ? "Save changes" : "Save draft"}
            </PrimaryButton>
          </div>
        }
      >
        <AdminBreadcrumb
          items={[
            { label: "Platform", href: "/platform" },
            { label: "Marketing blogs", href: "/platform/blogs" },
            { label: isEdit || savedId ? "Edit" : "New" },
          ]}
        />

        <div className="mt-4 max-w-3xl rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 sm:p-6">
          <div className="grid gap-4">
            <Field label="Title" required>
              <input
                className={inputClassName()}
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="How shop debtors work in CentrixERP"
              />
            </Field>
            <Field label="Slug (optional)">
              <input
                className={inputClassName()}
                value={form.slug}
                onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
                placeholder="how-shop-debtors-work"
              />
            </Field>
            <Field label="Category">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className={`${inputClassName()} min-w-0 flex-1`}
                  value={form.category}
                  onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                >
                  {categories.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`${SECONDARY_BTN_CLASS} shrink-0 px-3`}
                  title="Add category"
                  aria-label="Add category"
                  onClick={() => setCategoryModalOpen(true)}
                >
                  +
                </button>
              </div>
            </Field>
            <Field label="Excerpt">
              <textarea
                className={inputClassName()}
                rows={2}
                value={form.excerpt}
                onChange={(event) => setForm((prev) => ({ ...prev, excerpt: event.target.value }))}
                placeholder="Short summary shown on the Resources blog list."
              />
            </Field>
            <Field label="Body" required>
              <MarketingBlogEditor
                value={form.body}
                onChange={(body) => setForm((prev) => ({ ...prev, body }))}
                disabled={saving}
              />
            </Field>
            <Field label="Cover image">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={SECONDARY_BTN_CLASS}
                  disabled={coverUploading}
                  onClick={() => coverInputRef.current?.click()}
                >
                  {coverUploading ? "Uploading…" : "Upload cover"}
                </button>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => void uploadCover(event)}
                />
                <input
                  className={`${inputClassName()} min-w-0 flex-1`}
                  value={form.cover_image_url}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, cover_image_url: event.target.value }))
                  }
                  placeholder="Or paste image URL"
                />
              </div>
              {form.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.cover_image_url}
                  alt=""
                  className="mt-3 max-h-40 rounded-lg border border-[var(--theme-border)] object-cover"
                />
              ) : null}
            </Field>
            <Field label="Author name (optional)">
              <input
                className={inputClassName()}
                value={form.author_name}
                onChange={(event) => setForm((prev) => ({ ...prev, author_name: event.target.value }))}
                placeholder="CentrixERP"
              />
            </Field>
            <Field label="SEO title (optional)">
              <input
                className={inputClassName()}
                value={form.seo_title}
                onChange={(event) => setForm((prev) => ({ ...prev, seo_title: event.target.value }))}
              />
            </Field>
            <Field label="SEO description (optional)">
              <textarea
                className={inputClassName()}
                rows={2}
                value={form.seo_description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, seo_description: event.target.value }))
                }
              />
            </Field>
          </div>
        </div>
      </CatalogPageShell>

      <CategoryCreateModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        onCreated={(category, nextCategories) => {
          setCategories(nextCategories?.length ? nextCategories : [...categories, category]);
          if (category?.id) {
            setForm((prev) => ({ ...prev, category: category.id }));
          }
        }}
      />
    </>
  );
}
