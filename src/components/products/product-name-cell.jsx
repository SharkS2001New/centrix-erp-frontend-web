"use client";

import { useState } from "react";
import Link from "next/link";
import {
  EntityPhotoDisplay,
  productPhotoFileUrl,
} from "@/components/media/entity-photo-display";
import { productScopeLabel } from "@/lib/catalog-scope";
import {
  downloadProductImageToPc,
  productHasPhoto,
} from "@/lib/download-product-image";
import { notifyError } from "@/lib/notify";

function PhotoPlaceholderIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M21 16l-5-5-7 7" />
    </svg>
  );
}

function DownloadIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function ProductPhotoThumb({
  product,
  size = "sm",
  showDownload = true,
  className = "",
}) {
  const [downloading, setDownloading] = useState(false);
  const hasPhoto = productHasPhoto(product);
  const box = size === "lg" ? "h-20 w-20" : "h-10 w-10";

  async function handleDownload(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!hasPhoto || downloading) return;
    setDownloading(true);
    try {
      await downloadProductImageToPc({
        productCode: product.product_code,
        productName: product.product_name || product.product_code,
      });
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Could not download photo");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className={`relative shrink-0 ${box} ${hasPhoto && showDownload ? "mb-1 mr-1" : ""} ${className}`}>
      <div className={`${box} overflow-hidden rounded-md border border-[var(--theme-border)] bg-[var(--theme-hover,#f8fafc)]`}>
        {hasPhoto ? (
          <EntityPhotoDisplay
            fileUrl={productPhotoFileUrl(product.product_code)}
            alt={product.product_name || "Menu photo"}
            compact
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-slate-300">
            <PhotoPlaceholderIcon className={size === "lg" ? "h-7 w-7" : "h-4 w-4"} />
          </span>
        )}
      </div>
      {showDownload && hasPhoto ? (
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          title="Download photo"
          aria-label={`Download photo for ${product.product_name || product.product_code}`}
          className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-[#185FA5] disabled:opacity-50"
        >
          <DownloadIcon />
        </button>
      ) : null}
    </div>
  );
}

export function ProductNameCell({ product, showPhoto = false, deleted = false }) {
  return (
    <div className={`flex min-w-0 items-start ${showPhoto ? "gap-2.5" : ""}`}>
      {showPhoto ? <ProductPhotoThumb product={product} /> : null}
      <div className="min-w-0">
        {deleted ? (
          <p className="text-sm font-medium text-[var(--theme-text)]">{product.product_name}</p>
        ) : (
          <Link
            href={`/products/${encodeURIComponent(product.product_code)}`}
            className="theme-link text-sm font-medium"
          >
            {product.product_name}
          </Link>
        )}
        <p className="theme-subtext mt-0.5 font-mono text-xs">{product.product_code}</p>
        <p className="theme-subtext mt-0.5 text-xs">
          {product.category_name} · {product.subcategory_name}
        </p>
        {product.catalog_scope === "branch" || product.branch_id ? (
          <p className="theme-subtext mt-0.5 text-xs">{productScopeLabel(product)}</p>
        ) : null}
      </div>
    </div>
  );
}
