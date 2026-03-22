/**
 * UFM+ (Universal Fetcher Module) — Types
 * 
 * Accepts URL, PDF, DOCX, images, text files and outputs a unified structured representation.
 */

export type UFMSourceType = "url" | "pdf" | "docx" | "image" | "text" | "zip" | "unknown";

export interface UFMInput {
  /** The source content — URL string, base64 data, or raw text */
  source: string;
  /** File name if available */
  fileName?: string;
  /** MIME type if known */
  mimeType?: string;
  /** Source type override (auto-detected if not provided) */
  sourceType?: UFMSourceType;
}

export interface UFMHeading {
  level: number;
  text: string;
}

export interface UFMLink {
  text: string;
  href: string;
}

export interface UFMImage {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface UFMTable {
  headers: string[];
  rows: string[][];
}

export interface UFMComponent {
  type: string;
  label?: string;
  children?: UFMComponent[];
}

export interface UFMLayout {
  hasNavbar: boolean;
  hasSidebar: boolean;
  hasFooter: boolean;
  hasHero: boolean;
  hasDashboard: boolean;
  columns?: number;
  sections: string[];
}

export interface UFMMeta {
  author?: string;
  description?: string;
  keywords?: string[];
  generator?: string;
  language?: string;
  pageCount?: number;
  createdAt?: string;
  modifiedAt?: string;
}

export interface UFMResult {
  /** Detected source type */
  sourceType: UFMSourceType;
  /** Title of the document/page */
  title: string;
  /** Metadata */
  meta: UFMMeta;
  /** Extracted headings */
  headings: UFMHeading[];
  /** Full extracted text */
  text: string;
  /** Links found */
  links: UFMLink[];
  /** Images found */
  images: UFMImage[];
  /** Layout structure (if detected) */
  layout: UFMLayout;
  /** UI components detected */
  components: UFMComponent[];
  /** Tables extracted */
  tables: UFMTable[];
  /** Raw unprocessed text */
  raw: string;
  /** Whether extraction was successful */
  success: boolean;
  /** Error message if extraction failed */
  error?: string;
}

/** Safety Layer error types */
export type UFMSafetyError = 
  | "corrupted"
  | "unreadable"
  | "encrypted"
  | "unsupported"
  | "too_large"
  | "empty";

export interface UFMSafetyResult {
  safe: boolean;
  error?: UFMSafetyError;
  message?: string;
}
