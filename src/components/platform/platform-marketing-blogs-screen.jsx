"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";
import {
  blogCategoryLabel,
  deleteMarketingBlog,
  listMarketingBlogs,
  publishMarketingBlog,
  purgeMarketingBlogCache,
  unpublishMarketingBlog,
} from "@/lib/platform-blogs";

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
  const router = useRouter();
  const confirm = useConfirm();
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [purging, setPurging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMarketingBlogs({ status: statusFilter });
      setPosts(res.data ?? []);
      setCategories(res.categories ?? []);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to load blogs.");
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

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
      destructive: true,
    });
    if (!ok) return;
    setBusyId(id);
    try {
      await deleteMarketingBlog(id);
      notifySuccess("Deleted.");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function clearCaches() {
    setPurging(true);
    try {
      await purgeMarketingBlogCache();
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
      subtitle="Posts for the CentrixERP Resources blog — compress on upload, publish, caches purge automatically."
      action={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            disabled={purging}
            onClick={() => void clearCaches()}
          >
            {purging ? "Clearing…" : "Clear blog cache"}
          </button>
          <PrimaryButton type="button" onClick={() => router.push("/platform/blogs/new")}>
            New post
          </PrimaryButton>
        </div>
      }
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Marketing blogs" },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <select
          className={`${inputClassName()} max-w-xs`}
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
        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-5 py-10 text-center">
          <p className="text-sm text-[var(--theme-muted)]">
            No blog posts yet. Create a draft with a cover image, then publish it to Resources → Blog.
          </p>
          <button
            type="button"
            className="mt-3 text-sm font-medium text-[#185FA5] hover:underline"
            onClick={() => router.push("/platform/blogs/new")}
          >
            Create first post
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {posts.map((post) => (
            <li
              key={post.id}
              className="flex flex-col overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]"
            >
              {post.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.cover_image_url}
                  alt=""
                  className="h-36 w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-36 items-center justify-center bg-[var(--theme-border)]/40 text-xs text-[var(--theme-muted)]">
                  No cover
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    href={`/platform/blogs/${post.id}/edit`}
                    className="line-clamp-2 text-sm font-semibold text-[var(--theme-text)] hover:underline"
                  >
                    {post.title}
                  </Link>
                  <StatusPill status={post.status} />
                </div>
                <p className="text-[11px] text-[var(--theme-muted)]">
                  {blogCategoryLabel(post.category, categories)}
                  {post.read_time ? ` · ${post.read_time} min` : ""}
                  {post.published_at ? ` · ${new Date(post.published_at).toLocaleDateString()}` : ""}
                </p>
                {post.excerpt ? (
                  <p className="line-clamp-2 text-xs text-[var(--theme-muted)]">{post.excerpt}</p>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                  <button
                    type="button"
                    className={SECONDARY_BTN_CLASS}
                    onClick={() => router.push(`/platform/blogs/${post.id}/edit`)}
                  >
                    Edit
                  </button>
                  {post.status === "published" ? (
                    <button
                      type="button"
                      className={SECONDARY_BTN_CLASS}
                      disabled={busyId === post.id}
                      onClick={() => void unpublishPost(post.id)}
                    >
                      Unpublish
                    </button>
                  ) : (
                    <PrimaryButton
                      type="button"
                      showIcon={false}
                      disabled={busyId === post.id}
                      onClick={() => void publishPost(post.id)}
                    >
                      Publish
                    </PrimaryButton>
                  )}
                  <button
                    type="button"
                    className={SECONDARY_BTN_CLASS}
                    disabled={busyId === post.id}
                    onClick={() => void removePost(post.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </CatalogPageShell>
  );
}
