"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  inputClassName,
} from "@/components/catalog/catalog-shared";
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

export function PlatformMarketingBlogsScreen() {
  const confirm = useConfirm();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState(EMPTY_FORM);

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
    if (!form.title.trim() || !form.body.trim()) {
      notifyError("Title and body are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        slug: form.slug.trim() || undefined,
        excerpt: form.excerpt.trim() || null,
        body: form.body.trim(),
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

  return (
    <CatalogPageShell
      title="Marketing blogs"
      description="Write and publish posts for the CentrixERP public Resources page. Drafts stay private until you publish."
      breadcrumb={
        <AdminBreadcrumb
          items={[
            { label: "Platform" },
            { label: "Marketing blogs" },
          ]}
        />
      }
      actions={
        <PrimaryButton type="button" onClick={startCreate}>
          New post
        </PrimaryButton>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
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
              No blog posts yet. Create a draft, then publish it to the website Resources page.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--theme-border)]">
              {posts.map((post) => (
                <li key={post.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-[var(--theme-text)]">{post.title}</p>
                      <StatusPill status={post.status} />
                    </div>
                    <p className="mt-1 text-xs text-[var(--theme-muted)]">
                      {blogCategoryLabel(post.category)} · /{post.slug}
                      {post.published_at ? ` · ${new Date(post.published_at).toLocaleDateString()}` : ""}
                    </p>
                    {post.excerpt ? (
                      <p className="mt-2 line-clamp-2 text-sm text-[var(--theme-muted)]">{post.excerpt}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
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
            Published posts appear on the marketing site under Resources → Blog.
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
              <textarea
                className={inputClassName}
                rows={12}
                value={form.body}
                onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
                placeholder="Write the full post. Use blank lines between paragraphs."
              />
            </Field>
            <Field label="Cover image URL (optional)">
              <input
                className={inputClassName}
                value={form.cover_image_url}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, cover_image_url: event.target.value }))
                }
                placeholder="https://…"
              />
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
