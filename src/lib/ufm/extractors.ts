/**
 * UFM+ Extractors
 * 
 * Source-specific extraction logic for URL, PDF, DOCX, image, and text inputs.
 * Each returns a partial UFMResult that gets merged by the main fetcher.
 */

import type { UFMResult, UFMHeading, UFMLink, UFMImage, UFMTable, UFMComponent, UFMLayout, UFMMeta } from "./types";

// ─── Default empty structures ──────────────────────────────────────────────

const emptyLayout: UFMLayout = {
  hasNavbar: false,
  hasSidebar: false,
  hasFooter: false,
  hasHero: false,
  hasDashboard: false,
  sections: [],
};

const emptyMeta: UFMMeta = {};

function emptyResult(sourceType: UFMResult["sourceType"]): UFMResult {
  return {
    sourceType,
    title: "",
    meta: { ...emptyMeta },
    headings: [],
    text: "",
    links: [],
    images: [],
    layout: { ...emptyLayout },
    components: [],
    tables: [],
    raw: "",
    success: true,
  };
}

// ─── URL Extractor ─────────────────────────────────────────────────────────

export function extractFromUrl(htmlContent: string, url: string): UFMResult {
  const result = emptyResult("url");
  result.raw = htmlContent;

  // Title
  const titleMatch = htmlContent.match(/<title[^>]*>(.*?)<\/title>/is);
  result.title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, " ") : url;

  // Meta tags
  const metaDesc = htmlContent.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/is);
  const metaKeywords = htmlContent.match(/<meta[^>]*name=["']keywords["'][^>]*content=["'](.*?)["']/is);
  const metaGenerator = htmlContent.match(/<meta[^>]*name=["']generator["'][^>]*content=["'](.*?)["']/is);
  result.meta = {
    description: metaDesc?.[1],
    keywords: metaKeywords?.[1]?.split(",").map((k) => k.trim()),
    generator: metaGenerator?.[1],
  };

  // Headings
  const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h\1>/gis;
  let hMatch;
  while ((hMatch = headingRegex.exec(htmlContent))) {
    result.headings.push({
      level: parseInt(hMatch[1]),
      text: hMatch[2].replace(/<[^>]*>/g, "").trim(),
    });
  }

  // Links
  const linkRegex = /<a[^>]*href=["'](.*?)["'][^>]*>(.*?)<\/a>/gis;
  let lMatch;
  while ((lMatch = linkRegex.exec(htmlContent))) {
    result.links.push({
      href: lMatch[1],
      text: lMatch[2].replace(/<[^>]*>/g, "").trim(),
    });
  }

  // Images
  const imgRegex = /<img[^>]*src=["'](.*?)["'][^>]*(?:alt=["'](.*?)["'])?[^>]*\/?>/gis;
  let iMatch;
  while ((iMatch = imgRegex.exec(htmlContent))) {
    result.images.push({ src: iMatch[1], alt: iMatch[2] });
  }

  // Text (strip HTML)
  result.text = htmlContent
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50000);

  // Layout detection
  result.layout = detectLayoutFromHtml(htmlContent);

  // Component detection
  result.components = detectComponentsFromHtml(htmlContent);

  return result;
}

// ─── Text Extractor ────────────────────────────────────────────────────────

export function extractFromText(text: string, fileName?: string): UFMResult {
  const result = emptyResult("text");
  result.raw = text;
  result.text = text.slice(0, 50000);
  result.title = fileName || "Text Document";

  // Markdown headings
  const mdHeadings = text.matchAll(/^(#{1,6})\s+(.+)$/gm);
  for (const m of mdHeadings) {
    result.headings.push({ level: m[1].length, text: m[2].trim() });
  }

  // Markdown links
  const mdLinks = text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
  for (const m of mdLinks) {
    result.links.push({ text: m[1], href: m[2] });
  }

  // Markdown images
  const mdImages = text.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g);
  for (const m of mdImages) {
    result.images.push({ src: m[2], alt: m[1] });
  }

  return result;
}

// ─── PDF Extractor (client-side, basic) ────────────────────────────────────

export function extractFromPdfText(extractedText: string, metadata?: Record<string, string>): UFMResult {
  const result = emptyResult("pdf");
  result.raw = extractedText;
  result.text = extractedText.slice(0, 50000);

  // Title from metadata or first line
  result.title = metadata?.title || extractedText.split("\n")[0]?.trim().slice(0, 100) || "PDF Document";

  result.meta = {
    author: metadata?.author,
    description: metadata?.subject,
    pageCount: metadata?.pages ? parseInt(metadata.pages) : undefined,
    createdAt: metadata?.creationDate,
  };

  // Detect headings (lines that are short, capitalized, or numbered)
  const lines = extractedText.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 100) continue;
    if (/^\d+\.\s+[A-Z]/.test(trimmed)) {
      result.headings.push({ level: 2, text: trimmed });
    } else if (/^[A-Z][A-Z\s]{5,}$/.test(trimmed)) {
      result.headings.push({ level: 1, text: trimmed });
    }
  }

  // Detect tables (lines with multiple pipe or tab separators)
  const tableLines: string[][] = [];
  let currentTable: string[][] = [];
  for (const line of lines) {
    if (line.includes("|") || line.includes("\t")) {
      const cells = line.split(/[|\t]/).map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 2) {
        currentTable.push(cells);
        continue;
      }
    }
    if (currentTable.length >= 2) {
      result.tables.push({
        headers: currentTable[0],
        rows: currentTable.slice(1),
      });
    }
    currentTable = [];
  }
  if (currentTable.length >= 2) {
    result.tables.push({ headers: currentTable[0], rows: currentTable.slice(1) });
  }

  // Links
  const urlMatches = extractedText.matchAll(/https?:\/\/[^\s)>]+/g);
  for (const m of urlMatches) {
    result.links.push({ text: m[0], href: m[0] });
  }

  return result;
}

// ─── DOCX Extractor (client-side, basic) ───────────────────────────────────

export function extractFromDocxText(extractedText: string, metadata?: Record<string, string>): UFMResult {
  const result = emptyResult("docx");
  result.raw = extractedText;
  result.text = extractedText.slice(0, 50000);

  result.title = metadata?.title || extractedText.split("\n")[0]?.trim().slice(0, 100) || "Word Document";
  result.meta = {
    author: metadata?.author,
    description: metadata?.subject,
    createdAt: metadata?.created,
    modifiedAt: metadata?.modified,
  };

  // Headings (similar heuristic to PDF)
  const lines = extractedText.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 100) continue;
    if (/^\d+\.\s+[A-Z]/.test(trimmed)) {
      result.headings.push({ level: 2, text: trimmed });
    } else if (/^[A-Z][A-Z\s]{5,}$/.test(trimmed)) {
      result.headings.push({ level: 1, text: trimmed });
    }
  }

  // Links
  const urlMatches = extractedText.matchAll(/https?:\/\/[^\s)>]+/g);
  for (const m of urlMatches) {
    result.links.push({ text: m[0], href: m[0] });
  }

  return result;
}

// ─── Image Extractor (from vision/OCR results) ────────────────────────────

export function extractFromImageAnalysis(analysisText: string, imageSrc?: string): UFMResult {
  const result = emptyResult("image");
  result.raw = analysisText;
  result.text = analysisText.slice(0, 50000);
  result.title = "Screenshot Analysis";

  if (imageSrc) {
    result.images.push({ src: imageSrc, alt: "Analyzed screenshot" });
  }

  // Parse structured analysis if available
  result.layout = detectLayoutFromAnalysis(analysisText);
  result.components = detectComponentsFromAnalysis(analysisText);

  return result;
}

// ─── Layout Detection Helpers ──────────────────────────────────────────────

function detectLayoutFromHtml(html: string): UFMLayout {
  const lower = html.toLowerCase();
  return {
    hasNavbar: /<nav\b/i.test(html) || /class=["'][^"']*(?:navbar|nav-bar|navigation|header)/i.test(html),
    hasSidebar: /class=["'][^"']*(?:sidebar|side-bar|side-nav|drawer)/i.test(html),
    hasFooter: /<footer\b/i.test(html),
    hasHero: /class=["'][^"']*(?:hero|banner|jumbotron)/i.test(html),
    hasDashboard: /class=["'][^"']*(?:dashboard|stats|metrics|kpi)/i.test(html),
    sections: extractSections(html),
  };
}

function detectLayoutFromAnalysis(text: string): UFMLayout {
  const lower = text.toLowerCase();
  return {
    hasNavbar: /\b(navbar|navigation bar|top nav|header menu)\b/i.test(lower),
    hasSidebar: /\b(sidebar|side panel|side menu|drawer)\b/i.test(lower),
    hasFooter: /\b(footer)\b/i.test(lower),
    hasHero: /\b(hero section|hero banner|main banner)\b/i.test(lower),
    hasDashboard: /\b(dashboard|metrics|kpi|stats card|chart)\b/i.test(lower),
    sections: [],
  };
}

function extractSections(html: string): string[] {
  const sections: string[] = [];
  const sectionRegex = /<section[^>]*(?:id=["']([^"']+)["'])?[^>]*>/gi;
  let match;
  while ((match = sectionRegex.exec(html))) {
    if (match[1]) sections.push(match[1]);
  }
  return sections;
}

// ─── Component Detection Helpers ───────────────────────────────────────────

function detectComponentsFromHtml(html: string): UFMComponent[] {
  const components: UFMComponent[] = [];
  const lower = html.toLowerCase();

  if (/<form\b/i.test(html)) components.push({ type: "form" });
  if (/<table\b/i.test(html)) components.push({ type: "table" });
  if (/class=["'][^"']*(?:modal|dialog)/i.test(html)) components.push({ type: "modal" });
  if (/class=["'][^"']*(?:card)/i.test(html)) components.push({ type: "card" });
  if (/class=["'][^"']*(?:tabs|tab-)/i.test(html)) components.push({ type: "tabs" });
  if (/class=["'][^"']*(?:accordion|collapse)/i.test(html)) components.push({ type: "accordion" });
  if (/class=["'][^"']*(?:carousel|slider)/i.test(html)) components.push({ type: "carousel" });
  if (/class=["'][^"']*(?:chart|graph)/i.test(html) || /<canvas\b/i.test(html)) components.push({ type: "chart" });
  if (/<button\b/i.test(html)) components.push({ type: "button" });
  if (/<input\b/i.test(html)) components.push({ type: "input" });
  if (/<select\b/i.test(html)) components.push({ type: "select" });

  return components;
}

function detectComponentsFromAnalysis(text: string): UFMComponent[] {
  const components: UFMComponent[] = [];
  const lower = text.toLowerCase();

  const patterns: [RegExp, string][] = [
    [/\b(button|btn|cta)\b/i, "button"],
    [/\b(input|text field|text box|search bar)\b/i, "input"],
    [/\b(form|sign.?up|login|register)\b/i, "form"],
    [/\b(table|data grid|data table)\b/i, "table"],
    [/\b(modal|dialog|popup)\b/i, "modal"],
    [/\b(card|tile)\b/i, "card"],
    [/\b(tab|tabs)\b/i, "tabs"],
    [/\b(chart|graph|pie chart|bar chart|line chart)\b/i, "chart"],
    [/\b(sidebar|side panel)\b/i, "sidebar"],
    [/\b(navbar|navigation|top bar|header)\b/i, "navbar"],
    [/\b(dropdown|select|combobox)\b/i, "select"],
    [/\b(carousel|slider|swiper)\b/i, "carousel"],
    [/\b(avatar|profile picture)\b/i, "avatar"],
    [/\b(badge|tag|chip)\b/i, "badge"],
    [/\b(progress|loading|spinner)\b/i, "progress"],
    [/\b(toast|notification|alert)\b/i, "notification"],
  ];

  for (const [pattern, type] of patterns) {
    if (pattern.test(lower) && !components.some((c) => c.type === type)) {
      components.push({ type });
    }
  }

  return components;
}
