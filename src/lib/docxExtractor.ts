/**
 * Structured DOCX text extractor
 * 
 * Parses word/document.xml preserving headings, numbered lists, tables,
 * and section hierarchy instead of stripping all XML blindly.
 */

import JSZip from "jszip";

export interface DocxExtractionResult {
  /** Clean structured text with markdown-like formatting */
  structuredText: string;
  /** Document title (first heading or filename) */
  title: string;
  /** Extracted section headings */
  headings: string[];
  /** Character count of raw text */
  charCount: number;
}

/**
 * Extract structured text from a .docx File, preserving document hierarchy.
 */
export async function extractDocxStructured(file: File): Promise<DocxExtractionResult> {
  const zip = await JSZip.loadAsync(file);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) {
    return { structuredText: "[Could not read document content]", title: file.name, headings: [], charCount: 0 };
  }

  // Also try to get numbering definitions for list detection
  const numberingXml = await zip.file("word/numbering.xml")?.async("string");
  
  const lines: string[] = [];
  const headings: string[] = [];
  let currentListLevel = -1;

  // Parse paragraph by paragraph
  const paragraphs = docXml.match(/<w:p[\s>][\s\S]*?<\/w:p>/gi) || [];
  
  for (const para of paragraphs) {
    const text = extractRunText(para);
    if (!text.trim()) {
      // Preserve blank lines for readability but limit consecutive blanks
      if (lines.length > 0 && lines[lines.length - 1] !== "") {
        lines.push("");
      }
      continue;
    }

    // Detect heading style
    const headingLevel = detectHeadingLevel(para);
    if (headingLevel > 0) {
      const prefix = "#".repeat(headingLevel);
      lines.push("");
      lines.push(`${prefix} ${text}`);
      lines.push("");
      headings.push(text);
      continue;
    }

    // Detect list items
    const listInfo = detectListItem(para);
    if (listInfo) {
      const indent = "  ".repeat(listInfo.level);
      const bullet = listInfo.isNumbered ? `${listInfo.num}.` : "•";
      lines.push(`${indent}${bullet} ${text}`);
      currentListLevel = listInfo.level;
      continue;
    }

    // Detect table rows (handled separately below)
    // Regular paragraph
    if (currentListLevel >= 0) {
      lines.push(""); // gap after list
      currentListLevel = -1;
    }
    lines.push(text);
  }

  // Now extract tables
  const tables = docXml.match(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/gi) || [];
  const tableTexts: string[] = [];
  for (const tbl of tables) {
    const tableText = extractTable(tbl);
    if (tableText) tableTexts.push(tableText);
  }

  // Build final structured text
  let structuredText = lines
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n") // collapse excessive blank lines
    .trim();

  // Append tables at end if they weren't inline (simple approach)
  if (tableTexts.length > 0) {
    // Tables were already captured inline via paragraph extraction,
    // but table cell content may have been missed. Add any table summaries.
    const tableSummary = tableTexts.join("\n\n");
    if (tableSummary.trim() && !structuredText.includes(tableSummary.slice(0, 50))) {
      structuredText += "\n\n--- Tables ---\n\n" + tableSummary;
    }
  }

  const title = headings[0] || file.name.replace(/\.docx?$/i, "");

  return {
    structuredText,
    title,
    headings,
    charCount: structuredText.length,
  };
}

/** Extract text content from all runs in a paragraph */
function extractRunText(paraXml: string): string {
  const parts: string[] = [];
  
  // Match all <w:r> elements
  const runs = paraXml.match(/<w:r[\s>][\s\S]*?<\/w:r>/gi) || [];
  for (const run of runs) {
    // Get <w:t> content
    const textMatches = run.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi) || [];
    for (const tm of textMatches) {
      const content = tm.replace(/<w:t[^>]*>/i, "").replace(/<\/w:t>/i, "");
      parts.push(decodeXmlEntities(content));
    }
    // Check for tab
    if (/<w:tab\s*\/>/i.test(run)) {
      parts.push("\t");
    }
    // Check for break
    if (/<w:br\s*\/>/i.test(run)) {
      parts.push("\n");
    }
  }

  return parts.join("").trim();
}

/** Detect heading level from paragraph properties */
function detectHeadingLevel(paraXml: string): number {
  // Check for <w:pStyle w:val="Heading1"/> etc.
  const styleMatch = paraXml.match(/<w:pStyle\s+w:val="([^"]+)"/i);
  if (styleMatch) {
    const style = styleMatch[1].toLowerCase();
    // Match Heading1, Heading2, etc.
    const headingMatch = style.match(/heading\s*(\d)/i);
    if (headingMatch) return parseInt(headingMatch[1]);
    // Also match TOCHeading, Title, Subtitle
    if (style === "title") return 1;
    if (style === "subtitle") return 2;
  }
  
  // Check for <w:outlineLvl w:val="0"/> (outline level)
  const outlineMatch = paraXml.match(/<w:outlineLvl\s+w:val="(\d)"/i);
  if (outlineMatch) return parseInt(outlineMatch[1]) + 1;
  
  return 0;
}

/** Detect if paragraph is a list item */
function detectListItem(paraXml: string): { level: number; isNumbered: boolean; num: number } | null {
  // Check for <w:numPr> (numbering properties)
  const numPrMatch = paraXml.match(/<w:numPr>[\s\S]*?<\/w:numPr>/i);
  if (!numPrMatch) return null;

  const ilvlMatch = numPrMatch[0].match(/<w:ilvl\s+w:val="(\d+)"/i);
  const numIdMatch = numPrMatch[0].match(/<w:numId\s+w:val="(\d+)"/i);
  
  const level = ilvlMatch ? parseInt(ilvlMatch[1]) : 0;
  const numId = numIdMatch ? parseInt(numIdMatch[1]) : 0;
  
  // Heuristic: even numIds tend to be numbered, odd tend to be bullets
  // This is imperfect but better than nothing without full numbering.xml parsing
  const isNumbered = numId % 2 === 0;
  
  return { level, isNumbered, num: 0 };
}

/** Extract table content as formatted text */
function extractTable(tblXml: string): string {
  const rows = tblXml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/gi) || [];
  if (rows.length === 0) return "";

  const tableRows: string[][] = [];
  
  for (const row of rows) {
    const cells = row.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/gi) || [];
    const cellTexts: string[] = [];
    
    for (const cell of cells) {
      // Extract all paragraphs in cell
      const cellParas = cell.match(/<w:p[\s>][\s\S]*?<\/w:p>/gi) || [];
      const cellContent = cellParas.map(p => extractRunText(p)).filter(Boolean).join("; ");
      cellTexts.push(cellContent || "—");
    }
    
    if (cellTexts.some(c => c !== "—")) {
      tableRows.push(cellTexts);
    }
  }

  if (tableRows.length === 0) return "";

  // Format as markdown-ish table
  const colCount = Math.max(...tableRows.map(r => r.length));
  const normalized = tableRows.map(r => {
    while (r.length < colCount) r.push("—");
    return r;
  });

  const header = normalized[0];
  const lines = [
    "| " + header.join(" | ") + " |",
    "| " + header.map(() => "---").join(" | ") + " |",
    ...normalized.slice(1).map(r => "| " + r.join(" | ") + " |"),
  ];

  return lines.join("\n");
}

/** Decode common XML entities */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x2018;/g, "'")
    .replace(/&#x2019;/g, "'")
    .replace(/&#x201C;/g, '"')
    .replace(/&#x201D;/g, '"')
    .replace(/&#x2013;/g, "–")
    .replace(/&#x2014;/g, "—")
    .replace(/&#xA0;/g, " ");
}
