"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { fetchMarketingPortfolioImage } from "@/lib/platform-marketing";

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
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      if (src.startsWith("blob:")) URL.revokeObjectURL(src);
      resolve(null);
    };
    image.src = src;
  });
}

async function imageForSection(section, portfolioId) {
  if (!section?.image_path || !portfolioId) return null;
  const blob = await fetchMarketingPortfolioImage(portfolioId, section.image_path);
  return loadImage(URL.createObjectURL(blob));
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
  const sections = (Array.isArray(portfolio?.sections) ? portfolio.sections : [])
    .filter((section) => section?.key !== "cover");
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("Could not measure the portfolio text on this device.");
  measure.font = "24px Arial";
  const sectionLayouts = sections.map((section) => {
    const bodyLines = wrapText(measure, section.body || "", 620);
    const bullets = (Array.isArray(section.bullets) ? section.bullets : [])
      .flatMap((bullet) => wrapText(measure, `• ${bullet}`, 620));
    const contentHeight = 180 + bodyLines.length * 34 + bullets.length * 32;
    return { section, bodyLines, bullets, height: Math.max(380, contentHeight) };
  });
  const height = 590 + sectionLayouts.reduce((total, row) => total + row.height + 30, 0) + 60;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create an image preview on this device.");

  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, width, height);
  const cover = (portfolio?.sections || []).find((section) => section?.key === "cover");
  const coverImage = await imageForSection(cover, portfolioId);
  const coverHeight = 510;
  if (coverImage) {
    drawCoverImage(context, coverImage, 0, 0, width, coverHeight);
  } else {
    const gradient = context.createLinearGradient(0, 0, width, coverHeight);
    gradient.addColorStop(0, theme.accent);
    gradient.addColorStop(1, theme.secondary);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, coverHeight);
  }
  context.fillStyle = "rgba(10, 20, 35, 0.48)";
  context.fillRect(0, 0, width, coverHeight);
  context.fillStyle = "#FFFFFF";
  context.font = "bold 22px Arial";
  context.fillText("CENTRIX ERP  /  BUSINESS PORTFOLIO", margin, 92);
  context.font = "bold 58px Arial";
  const titleLines = wrapText(context, portfolio?.title || "Business portfolio", contentWidth - 80).slice(0, 3);
  let titleY = 218;
  titleY = drawLines(context, titleLines, margin, titleY, 72, "#FFFFFF");
  context.font = "28px Arial";
  context.fillText(`Prepared for ${portfolio?.business_name || portfolio?.prospect_name || "Prospect"}`, margin, titleY + 28);
  context.font = "22px Arial";
  context.fillStyle = "rgba(255,255,255,0.88)";
  context.fillText(
    [portfolio?.location, "Kenyan Shillings (KES)"].filter(Boolean).join("  ·  "),
    margin,
    titleY + 70,
  );
  if (coverImage?.src?.startsWith("blob:")) URL.revokeObjectURL(coverImage.src);

  let y = coverHeight + 42;
  for (const layout of sectionLayouts) {
    const { section } = layout;
    const cardY = y;
    const cardHeight = layout.height;
    context.fillStyle = theme.paper;
    context.beginPath();
    context.roundRect(margin, cardY, contentWidth, cardHeight, 22);
    context.fill();
    context.fillStyle = theme.accent;
    context.fillRect(margin, cardY, 10, cardHeight);

    const textX = margin + 36;
    context.font = "bold 34px Arial";
    context.fillStyle = theme.accent;
    context.fillText(String(section.title || section.key || "").slice(0, 60), textX, cardY + 66);
    context.font = "24px Arial";
    const bodyY = drawLines(context, layout.bodyLines, textX, cardY + 118, 34, "#344054");
    if (layout.bullets.length) {
      drawLines(context, layout.bullets, textX + 4, bodyY + 12, 32, "#243247");
    }

    const imageX = margin + contentWidth - 342;
    const imageY = cardY + 42;
    const imageWidth = 292;
    const imageHeight = cardHeight - 84;
    const image = await imageForSection(section, portfolioId);
    if (image) {
      context.save();
      context.beginPath();
      context.roundRect(imageX, imageY, imageWidth, imageHeight, 18);
      context.clip();
      drawCoverImage(context, image, imageX, imageY, imageWidth, imageHeight);
      context.restore();
      if (image.src.startsWith("blob:")) URL.revokeObjectURL(image.src);
    } else {
      const gradient = context.createLinearGradient(imageX, imageY, imageX + imageWidth, imageY + imageHeight);
      gradient.addColorStop(0, theme.accent);
      gradient.addColorStop(1, theme.secondary);
      context.fillStyle = gradient;
      context.beginPath();
      context.roundRect(imageX, imageY, imageWidth, imageHeight, 18);
      context.fill();
      context.fillStyle = "rgba(255,255,255,0.92)";
      context.font = "bold 23px Arial";
      const label = meta?.illustrations?.[section.image_key]?.label || "Centrix for your business";
      drawLines(context, wrapText(context, label, imageWidth - 40).slice(0, 4), imageX + 22, imageY + 58, 31, "#FFFFFF");
      context.font = "18px Arial";
      context.fillStyle = "rgba(255,255,255,0.88)";
      drawLines(
        context,
        wrapText(context, meta?.illustrations?.[section.image_key]?.hint || "", imageWidth - 40).slice(0, 4),
        imageX + 22,
        imageY + 190,
        26,
        "#FFFFFF",
      );
    }
    y += cardHeight + 30;
  }

  context.fillStyle = "#667085";
  context.font = "18px Arial";
  context.fillText("Centrix ERP  ·  Kenya  ·  Prepared for your business", margin, height - 24);
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
