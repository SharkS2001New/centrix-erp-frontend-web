"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { useConfirm } from "@/lib/use-confirm";
import {
  BLOG_CATEGORIES,
  blogCategoryLabel,
  createMarketingBlog,
  deleteMarketingBlog,
  getMarketingBlog,
  listMarketingBlogs,
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

function StatusPill({ status }) {
  const published = status === "published";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        published
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
      }`}
    >
      {published ? "Published" : "Draft"}
    </span>
  );
}

function bodyIsEmpty(html) {
  const text = String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
  return text === "";
}

export function PlatformMarketingBlogsScreen() {
  const confirm = useConfirm();
  const coverInputRef = useRef(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState(EMPTY_FORM);
  const [coverUploading, setCoverUploading] = useState(false);
  const [purging, setPurging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMarketingBlogs({ status: statusFilter });
      setPosts(res.data ?? []);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to load blogs.");
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function startEdit(post) {
    setEditingId(post.id);
    setForm({
      title: post.title ?? "",
      slug: post.slug ?? "",
      excerpt: post.excerpt ?? "",
      body: post.body ?? "",
      cover_image_url: post.cover_image_url ?? "",
      category: post.category ?? "general",
      author_name: post.author_name ?? "",
      seo_title: post.seo_title ?? "",
      seo_description: post.seo_description ?? "",
    });
    try {
      const res = await getMarketingBlog(post.id);
      const full = res?.data;
      if (!full) return;
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
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not load post.");
    }
  }

  async function savePost() {
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
      if (editingId) {
        await updateMarketingBlog(editingId, payload);
        notifySuccess("Blog updated.");
      } else {
        const res = await createMarketingBlog(payload);
        setEditingId(res?.data?.id ?? null);
        if (res?.data?.slug) setForm((prev) => ({ ...prev, slug: res.data.slug }));
        notifySuccess("Blog draft created.");
      }
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save blog.");
    } finally {
      setSaving(false);
    }
  }

  async function publishPost(id) {
    setBusyId(id);
    try {
      await publishMarketingBlog(id);
      notifySuccess("Published to the CentrixERP Resources blog.");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Publish failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function unpublishPost(id) {
    setBusyId(id);
    try {
      await unpublishMarketingBlog(id);
      notifySuccess("Unpublished from the public website.");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Unpublish failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function removePost(id) {
    const ok = await confirm({
      title: "Delete blog post?",
      message: "This removes the post from platform admin and the public Resources blog.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setBusyId(id);
    try {
      await deleteMarketingBlog(id);
      if (editingId === id) startCreate();
      notifySuccess("Deleted.");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Delete failed.");
    } finally {
      setBusyId(null);
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

  return (
    <CatalogPageShell
      title="Marketing blogs"
      description="Write posts with images for the CentrixERP Resources blog — same workflow as Pitch Predictions: compress on upload, publish, caches purge automatically."
      breadcrumb={
        <AdminBreadcrumb
          items={[
            { label: "Platform" },
            { label: "Marketing blogs" },
          ]}
        />
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <button type="button" className={SECONDARY_BTN_CLASS} disabled={purging} onClick={() => void clearCaches()}>
            {purging ? "Clearing…" : "Clear blog cache"}
          </button>
          <PrimaryButton type="button" onClick={startCreate}>
            New post
          </PrimaryButton>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[var(--theme-text)]">Posts</h2>
            <select
              className={inputClassName}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="draft">Drafts</option>
              <option value="published">Published</option>
            </select>
          </div>

          {loading ? (
            <p className="text-sm text-[var(--theme-muted)]">Loading…</p>
          ) : posts.length === 0 ? (
            <p className="text-sm text-[var(--theme-muted)]">
              No blog posts yet. Create a draft with a cover image, then publish it to Resources → Blog.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {posts.map((post) => (
                <li
                  key={post.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-subtle)]"
                >
                  {post.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.cover_image_url}
                      alt=""
                      className="h-28 w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-28 items-center justify-center bg-[var(--theme-border)]/40 text-xs text-[var(--theme-muted)]">
                      No cover
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="line-clamp-2 text-sm font-semibold text-[var(--theme-text)]">{post.title}</p>
                      <StatusPill status={post.status} />
                    </div>
                    <p className="text-[11px] text-[var(--theme-muted)]">
                      {blogCategoryLabel(post.category)}
                      {post.read_time ? ` · ${post.read_time} min` : ""}
                      {post.published_at ? ` · ${new Date(post.published_at).toLocaleDateString()}` : ""}
                    </p>
                    {post.excerpt ? (
                      <p className="line-clamp-2 text-xs text-[var(--theme-muted)]">{post.excerpt}</p>
                    ) : null}
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                      <button type="button" className={SECONDARY_BTN_CLASS} onClick={() => startEdit(post)}>
                        Edit
                      </button>
                      {post.status === "published" ? (
                        <button
                          type="button"
                          className={SECONDARY_BTN_CLASS}
                          disabled={busyId === post.id}
                          onClick={() => unpublishPost(post.id)}
                        >
                          Unpublish
                        </button>
                      ) : (
                        <PrimaryButton
                          type="button"
                          disabled={busyId === post.id}
                          onClick={() => publishPost(post.id)}
                        >
                          Publish
                        </PrimaryButton>
                      )}
                      <button
                        type="button"
                        className={SECONDARY_BTN_CLASS}
                        disabled={busyId === post.id}
                        onClick={() => removePost(post.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 sm:p-5">
          <h2 className="text-base font-semibold text-[var(--theme-text)]">
            {editingId ? "Edit post" : "New post"}
          </h2>
          <p className="mt-1 text-sm text-[var(--theme-muted)]">
            Images are compressed on upload (max 1200px JPEG). Published posts appear under Resources → Blog.
          </p>

          <div className="mt-4 grid gap-4">
            <Field label="Title">
              <input
                className={inputClassName}
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="How shop debtors work in CentrixERP"
              />
            </Field>
            <Field label="Slug (optional)">
              <input
                className={inputClassName}
                value={form.slug}
                onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
                placeholder="how-shop-debtors-work"
              />
            </Field>
            <Field label="Category">
              <select
                className={inputClassName}
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              >
                {BLOG_CATEGORIES.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Excerpt">
              <textarea
                className={inputClassName}
                rows={2}
                value={form.excerpt}
                onChange={(event) => setForm((prev) => ({ ...prev, excerpt: event.target.value }))}
                placeholder="Short summary shown on the Resources blog list."
              />
            </Field>
            <Field label="Body">
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
                  className={`${inputClassName} min-w-0 flex-1`}
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
                className={inputClassName}
                value={form.author_name}
                onChange={(event) => setForm((prev) => ({ ...prev, author_name: event.target.value }))}
                placeholder="CentrixERP"
              />
            </Field>
            <Field label="SEO title (optional)">
              <input
                className={inputClassName}
                value={form.seo_title}
                onChange={(event) => setForm((prev) => ({ ...prev, seo_title: event.target.value }))}
              />
            </Field>
            <Field label="SEO description (optional)">
              <textarea
                className={inputClassName}
                rows={2}
                value={form.seo_description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, seo_description: event.target.value }))
                }
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton type="button" disabled={saving} onClick={savePost}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Save draft"}
              </PrimaryButton>
              {editingId ? (
                <button type="button" className={SECONDARY_BTN_CLASS} onClick={startCreate}>
                  Clear form
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </CatalogPageShell>
  );
}
