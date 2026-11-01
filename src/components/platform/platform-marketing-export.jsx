"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import { resolveCustomerMediaUrl } from "@/lib/api";
import { fetchMarketingPortfolioImage, portfolioFontCss } from "@/lib/platform-marketing";
import { portfolioPdfPageRanges } from "@/lib/platform-marketing-pdf-pages";

const THEMES = {
  modern: { accent: "#185FA5", secondary: "#16A085", paper: "#F3F7FA" },
  editorial: { accent: "#173B3F", secondary: "#A66B42", paper: "#F6F4EF" },
  bold: { accent: "#382274", secondary: "#E86A33", paper: "#F4F1FA" },
};

function wrapText(context, text, maxWidth) {
  const rows = [];
  for (const paragraph of String(text ?? "").split(/\n/)) {
    if (!paragraph.trim()) {
      rows.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && context.measureText(next).width > maxWidth) {
        rows.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) rows.push(line);
  }
  return rows;
}

function drawLines(context, lines, x, y, lineHeight, color) {
  context.fillStyle = color;
  for (const line of lines) {
    if (line) context.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const image = new globalThis.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => {
      if (src.startsWith("blob:")) URL.revokeObjectURL(src);
      resolve(null);
    };
    image.src = src;
  });
}

async function imageForSection(section, portfolioId) {
  if (section?.image_path && portfolioId) {
    const blob = await fetchMarketingPortfolioImage(portfolioId, section.image_path);
    return loadImage(URL.createObjectURL(blob));
  }
  const imageUrl = resolveCustomerMediaUrl(section?.image_url);
  return imageUrl ? loadImage(imageUrl) : null;
}

export function createPortfolioPdfBlob(canvas) {
  if (!canvas) throw new Error("The portfolio preview is still being prepared.");
  const pageWidthMm = 210;
  const pageHeightMm = 297;
  const pageRanges = portfolioPdfPageRanges(
    canvas.width,
    canvas.height,
    canvas.portfolioContentBlocks || [],
  );
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

  for (const [pageIndex, range] of pageRanges.entries()) {
    if (pageIndex > 0) pdf.addPage("a4", "portrait");
    const scale = range.fitToPage
      ? Math.min(1, (canvas.width * pageHeightMm) / (pageWidthMm * range.height))
      : 1;
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = Math.round(canvas.width * scale);
    pageCanvas.height = Math.round(range.height * scale);
    const context = pageCanvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the PDF page.");
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(
      canvas,
      0,
      range.y,
      canvas.width,
      range.height,
      0,
      0,
      pageCanvas.width,
      pageCanvas.height,
    );
    const renderedWidth = (pageCanvas.width / canvas.width) * pageWidthMm;
    const renderedHeight = (pageCanvas.height / canvas.width) * pageWidthMm;
    pdf.addImage(
      pageCanvas.toDataURL("image/jpeg", 0.94),
      "JPEG",
      (pageWidthMm - renderedWidth) / 2,
      0,
      renderedWidth,
      renderedHeight,
      undefined,
      "FAST",
    );
  }

  return pdf.output("blob");
}

export function downloadPortfolioPdf(canvas, title) {
  const blob = createPortfolioPdfBlob(canvas);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${String(title || "Centrix-Portfolio").replace(/[^a-z0-9._-]+/gi, "-")}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function drawCoverImage(context, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

export async function renderMarketingPortfolioCanvas(portfolio, meta, portfolioId) {
  const width = 1240;
  const margin = 88;
  const contentWidth = width - margin * 2;
  const theme = THEMES[portfolio?.template_key] || THEMES.modern;
  const fontFamily = portfolioFontCss(portfolio?.font_family)
    .split(",")[0]
    .replaceAll("'", "")
    .replaceAll('"', "");
  const font = `"${fontFamily}"`;
  const sections = (Array.isArray(portfolio?.sections) ? portfolio.sections : [])
    .filter((section) => section?.key !== "cover");
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("Could not measure the portfolio text on this device.");
  measure.font = `20px ${font}`;
  const sectionLayouts = sections.map((section) => {
    measure.font = `bold 28px ${font}`;
    const headingLines = wrapText(measure, section.title || section.key || "", 560);
    measure.font = `20px ${font}`;
    const bodyLines = wrapText(measure, section.body || "", 560);
    const bullets = (Array.isArray(section.bullets) ? section.bullets : [])
      .flatMap((bullet) => wrapText(measure, `• ${bullet}`, 560));
    const contentHeight =
      170 + headingLines.length * 36 + bodyLines.length * 30 + bullets.length * 28;
    return { section, headingLines, bodyLines, bullets, height: Math.max(360, contentHeight) };
  });
  const coverArtHeight = 310;
  const coverHeight = 520;
  const height = coverHeight + sectionLayouts.reduce((total, row) => total + row.height + 28, 0) + 65;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create an image preview on this device.");
  const portfolioContentBlocks = [{ start: 0, end: coverHeight }];

  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, width, height);
  const cover = (portfolio?.sections || []).find((section) => section?.key === "cover");
  const coverImage = await imageForSection(cover, portfolioId);
  const coverKey = cover?.image_key || portfolio?.hero_image_key;
  const coverIllustration = meta?.illustrations?.[coverKey];
  if (coverImage) {
    drawCoverImage(context, coverImage, 0, 0, width, coverArtHeight);
  } else {
    const gradient = context.createLinearGradient(0, 0, width, coverArtHeight);
    gradient.addColorStop(0, coverIllustration?.gradient?.[0] || theme.accent);
    gradient.addColorStop(1, coverIllustration?.gradient?.[1] || theme.secondary);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, coverArtHeight);
    context.fillStyle = "rgba(255,255,255,0.82)";
    context.font = `bold 20px ${font}`;
    context.fillText("CENTRIX", margin, 78);
    context.font = `bold 34px ${font}`;
    drawLines(
      context,
      wrapText(context, coverIllustration?.label || "Centrix for your business", contentWidth - 80).slice(0, 2),
      margin,
      218,
      42,
      "#FFFFFF",
    );
    context.font = `20px ${font}`;
    drawLines(
      context,
      wrapText(context, coverIllustration?.hint || "", contentWidth - 80).slice(0, 2),
      margin,
      275,
      28,
      "rgba(255,255,255,0.9)",
    );
  }
  if (coverImage?.src?.startsWith("blob:")) URL.revokeObjectURL(coverImage.src);

  const coverCopyY = coverArtHeight;
  context.fillStyle = theme.paper;
  context.fillRect(0, coverCopyY, width, coverHeight - coverCopyY);
  context.fillStyle = theme.accent;
  context.fillRect(0, coverCopyY, 8, coverHeight - coverCopyY);
  context.fillStyle = theme.accent;
  context.font = `bold 16px ${font}`;
  context.fillText("CENTRIX ERP · BUSINESS PORTFOLIO", margin, coverCopyY + 50);
  context.fillStyle = "#0F172A";
  context.font = `bold 38px ${font}`;
  const titleLines = wrapText(context, portfolio?.title || "Business portfolio", contentWidth).slice(0, 2);
  drawLines(context, titleLines, margin, coverCopyY + 106, 46, "#0F172A");
  context.font = `20px ${font}`;
  drawLines(
    context,
    wrapText(
      context,
      `Prepared for ${portfolio?.business_name || portfolio?.prospect_name || "Prospect"}${portfolio?.location ? ` · ${portfolio.location}` : ""} · Kenyan Shillings (KES)`,
      contentWidth,
    ).slice(0, 2),
    margin,
    coverCopyY + 164,
    28,
    "#475569",
  );

  let y = coverHeight + 28;
  for (const [index, layout] of sectionLayouts.entries()) {
    const { section } = layout;
    const cardY = y;
    const cardHeight = layout.height;
    context.fillStyle = theme.paper;
    context.beginPath();
    context.roundRect(margin, cardY, contentWidth, cardHeight, 22);
    context.fill();
    context.fillStyle = theme.accent;
    context.fillRect(margin, cardY, 10, cardHeight);

    const imageX = margin + contentWidth - 342;
    const imageY = cardY + 42;
    const imageWidth = 292;
    const imageHeight = cardHeight - 84;
    const artOnLeft = index % 2 === 1;
    const panelX = artOnLeft ? margin + 34 : imageX;
    const textX = artOnLeft ? margin + 366 : margin + 36;
    const textWidth = 560;
    context.font = `bold 16px ${font}`;
    context.fillStyle = theme.secondary;
    context.fillText(String(index + 1).padStart(2, "0"), textX, cardY + 52);
    context.font = `bold 28px ${font}`;
    let textY = drawLines(context, layout.headingLines, textX, cardY + 96, 36, "#0F172A");
    context.font = `20px ${font}`;
    const bodyY = drawLines(context, layout.bodyLines, textX, textY + 8, 30, "#334155");
    if (layout.bullets.length) drawLines(context, layout.bullets, textX + 4, bodyY + 10, 28, "#334155");

    const image = await imageForSection(section, portfolioId);
    const imageKey = section.image_key || portfolio?.hero_image_key;
    const illustration = meta?.illustrations?.[imageKey];
    if (image) {
      context.save();
      context.beginPath();
      context.roundRect(panelX, imageY, imageWidth, imageHeight, 18);
      context.clip();
      drawCoverImage(context, image, panelX, imageY, imageWidth, imageHeight);
      context.restore();
      if (image.src.startsWith("blob:")) URL.revokeObjectURL(image.src);
    } else {
      const gradient = context.createLinearGradient(panelX, imageY, panelX + imageWidth, imageY + imageHeight);
      gradient.addColorStop(0, illustration?.gradient?.[0] || theme.accent);
      gradient.addColorStop(1, illustration?.gradient?.[1] || theme.secondary);
      context.fillStyle = gradient;
      context.beginPath();
      context.roundRect(panelX, imageY, imageWidth, imageHeight, 18);
      context.fill();
      context.fillStyle = "rgba(255,255,255,0.85)";
      context.font = `bold 14px ${font}`;
      context.fillText("CENTRIX", panelX + 22, imageY + 36);
      context.font = `bold 22px ${font}`;
      const label = illustration?.label || "Centrix for your business";
      drawLines(context, wrapText(context, label, imageWidth - 40).slice(0, 3), panelX + 22, imageY + 76, 30, "#FFFFFF");
      context.font = `17px ${font}`;
      drawLines(
        context,
        wrapText(context, illustration?.hint || "", imageWidth - 40).slice(0, 3),
        panelX + 22,
        imageY + imageHeight - 54,
        24,
        "rgba(255,255,255,0.9)",
      );
    }
    portfolioContentBlocks.push({ start: cardY, end: cardY + cardHeight });
    y += cardHeight + 28;
  }

  portfolioContentBlocks.push({ start: height - 50, end: height });
  context.fillStyle = "#64748B";
  context.font = `18px ${font}`;
  context.fillText("Centrix ERP  ·  Kenya  ·  Prepared for your business", margin, height - 24);
  canvas.portfolioContentBlocks = portfolioContentBlocks;
  return canvas;
}

export function PortfolioPngPreview({ portfolio, meta, portfolioId, canvasRef, onRendered }) {
  const [rendered, setRendered] = useState(null);

  useEffect(() => {
    let active = true;
    let url = "";
    onRendered?.(null, null, portfolio);
    void renderMarketingPortfolioCanvas(portfolio, meta, portfolioId)
      .then((canvas) => {
        if (!active) return;
        if (canvasRef) canvasRef.current = canvas;
        onRendered?.(canvas, null, portfolio);
        canvas.toBlob((blob) => {
          if (!active) return;
          if (!blob) {
            const error = new Error("Could not create the PNG preview.");
            setRendered({ source: portfolio, error: error.message });
            onRendered?.(null, error, portfolio);
            return;
          }
          url = URL.createObjectURL(blob);
          setRendered({ source: portfolio, url, height: canvas.height });
        }, "image/png");
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Could not render the PNG preview.";
        setRendered({ source: portfolio, error: message });
        onRendered?.(null, error, portfolio);
      });

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
      if (canvasRef) canvasRef.current = null;
    };
  }, [portfolio, meta, portfolioId, canvasRef, onRendered]);

  const currentRender = rendered?.source === portfolio ? rendered : null;

  return (
    <div className="max-h-[80vh] overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-3">
      {currentRender?.url ? (
        <Image
          src={currentRender.url}
          width={1240}
          height={currentRender.height}
          unoptimized
          className="mx-auto h-auto w-full max-w-[900px] bg-white shadow-lg"
          alt="PNG export preview"
        />
      ) : currentRender?.error ? (
        <p className="py-12 text-center text-sm text-rose-700">{currentRender.error}</p>
      ) : (
        <p className="py-12 text-center text-sm text-slate-500">Preparing PNG preview…</p>
      )}
      <p className="py-2 text-center text-xs text-slate-500">
        This long-page canvas is the same artwork used for the downloaded PNG.
      </p>
    </div>
  );
}

export function downloadPortfolioPng(canvas, title) {
  if (!canvas) throw new Error("The PNG preview is still being prepared.");
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not create the PNG download."));
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${String(title || "Centrix-Portfolio").replace(/[^a-z0-9._-]+/gi, "-")}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, "image/png");
  });
}
