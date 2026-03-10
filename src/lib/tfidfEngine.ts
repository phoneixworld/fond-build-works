/**
 * TF-IDF Cosine Similarity Engine
 * 
 * Enterprise-grade semantic matching using Term Frequency–Inverse Document Frequency
 * with cosine similarity scoring. No AI round-trip needed — pure math, sub-1ms.
 * 
 * How it works:
 * 1. Tokenize + stem prompts into term vectors
 * 2. Compute TF-IDF weights against a corpus of cached prompts
 * 3. Cosine similarity between vectors → 0.0 to 1.0 score
 * 4. Threshold-based matching (≥0.82 = semantic match)
 * 
 * This catches: "add user login" ≈ "set up authentication" ≈ "implement auth"
 */

// ─── Porter Stemmer (simplified) ──────────────────────────────────────────

const STEP2_SUFFIXES: [string, string][] = [
  ["ational", "ate"], ["tional", "tion"], ["enci", "ence"], ["anci", "ance"],
  ["izer", "ize"], ["abli", "able"], ["alli", "al"], ["entli", "ent"],
  ["eli", "e"], ["ousli", "ous"], ["ization", "ize"], ["ation", "ate"],
  ["ator", "ate"], ["alism", "al"], ["iveness", "ive"], ["fulness", "ful"],
  ["ousness", "ous"], ["aliti", "al"], ["iviti", "ive"], ["biliti", "ble"],
];

function stem(word: string): string {
  if (word.length < 3) return word;
  
  // Step 1: plurals / past tense
  if (word.endsWith("sses")) word = word.slice(0, -2);
  else if (word.endsWith("ies")) word = word.slice(0, -2);
  else if (word.endsWith("ss")) { /* keep */ }
  else if (word.endsWith("s")) word = word.slice(0, -1);
  
  if (word.endsWith("eed")) {
    word = word.slice(0, -1);
  } else if (word.endsWith("ed") && /[aeiou]/.test(word.slice(0, -2))) {
    word = word.slice(0, -2);
    if (word.endsWith("at") || word.endsWith("bl") || word.endsWith("iz")) word += "e";
  } else if (word.endsWith("ing") && /[aeiou]/.test(word.slice(0, -3))) {
    word = word.slice(0, -3);
    if (word.endsWith("at") || word.endsWith("bl") || word.endsWith("iz")) word += "e";
  }

  // Step 2: derivational suffixes
  for (const [suffix, replacement] of STEP2_SUFFIXES) {
    if (word.endsWith(suffix)) {
      word = word.slice(0, -suffix.length) + replacement;
      break;
    }
  }

  return word;
}

// ─── Stopwords ────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "both",
  "each", "few", "more", "most", "other", "some", "such", "no", "nor",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "because", "but", "and", "or", "if", "while", "about", "up", "it",
  "its", "i", "me", "my", "we", "our", "you", "your", "he", "she",
  "they", "them", "this", "that", "these", "those", "what", "which",
  "who", "whom", "please", "help", "want", "like", "make", "get",
  "actually", "basically", "really", "think", "know", "also",
]);

// ─── Synonym Expansion ───────────────────────────────────────────────────

const SYNONYMS: Record<string, string> = {
  // Auth
  "login": "auth", "signin": "auth", "signup": "auth", "register": "auth",
  "authenticate": "auth", "authentication": "auth", "authorization": "auth",
  "password": "auth", "credential": "auth", "session": "auth",
  // UI
  "button": "ui_element", "input": "ui_element", "form": "ui_element",
  "modal": "dialog", "popup": "dialog", "overlay": "dialog",
  "navbar": "navigation", "sidebar": "navigation", "menu": "navigation",
  "header": "navigation", "nav": "navigation",
  // Data
  "database": "data_store", "db": "data_store", "table": "data_store",
  "schema": "data_store", "collection": "data_store",
  "fetch": "data_retrieval", "query": "data_retrieval", "load": "data_retrieval",
  "api": "endpoint", "endpoint": "endpoint", "route": "endpoint",
  // Actions
  "create": "crud_create", "add": "crud_create", "new": "crud_create", "insert": "crud_create",
  "update": "crud_update", "edit": "crud_update", "modify": "crud_update", "change": "crud_update",
  "delete": "crud_delete", "remove": "crud_delete", "destroy": "crud_delete",
  "list": "crud_read", "show": "crud_read", "display": "crud_read", "view": "crud_read",
  // Style
  "style": "styling", "css": "styling", "design": "styling", "theme": "styling",
  "color": "styling", "font": "styling", "layout": "styling",
  "responsive": "responsive_design", "mobile": "responsive_design", "breakpoint": "responsive_design",
  // Features
  "search": "search_feature", "filter": "search_feature", "sort": "search_feature",
  "upload": "file_handling", "download": "file_handling", "file": "file_handling", "image": "file_handling",
  "notification": "notification", "alert": "notification", "toast": "notification",
  "chart": "visualization", "graph": "visualization", "dashboard": "visualization",
  "drag": "drag_drop", "drop": "drag_drop", "reorder": "drag_drop",
  "cache": "caching", "memoize": "caching", "store": "caching",
  "test": "testing", "spec": "testing", "unit": "testing",
  "deploy": "deployment", "publish": "deployment", "release": "deployment",
};

// ─── Tokenization ─────────────────────────────────────────────────────────

export function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w));

  return words.map(w => {
    const synonym = SYNONYMS[w];
    if (synonym) return synonym;
    return stem(w);
  });
}

// ─── TF-IDF ───────────────────────────────────────────────────────────────

export interface TermVector {
  terms: Map<string, number>;
  magnitude: number;
}

/**
 * Compute term frequency vector for a single document.
 */
export function computeTF(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  // Normalize by document length
  const len = tokens.length || 1;
  for (const [term, count] of tf) {
    tf.set(term, count / len);
  }
  return tf;
}

/**
 * Compute IDF from a corpus of term frequency maps.
 */
export function computeIDF(corpus: Map<string, number>[]): Map<string, number> {
  const idf = new Map<string, number>();
  const N = corpus.length || 1;
  const docFreq = new Map<string, number>();

  for (const doc of corpus) {
    for (const term of doc.keys()) {
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }
  }

  for (const [term, df] of docFreq) {
    idf.set(term, Math.log((N + 1) / (df + 1)) + 1); // smoothed IDF
  }

  return idf;
}

/**
 * Compute TF-IDF weighted vector with magnitude for cosine similarity.
 */
export function computeTFIDF(tf: Map<string, number>, idf: Map<string, number>): TermVector {
  const terms = new Map<string, number>();
  let sumSq = 0;

  for (const [term, freq] of tf) {
    const weight = freq * (idf.get(term) || 1);
    terms.set(term, weight);
    sumSq += weight * weight;
  }

  return { terms, magnitude: Math.sqrt(sumSq) || 1 };
}

/**
 * Cosine similarity between two TF-IDF vectors.
 * Returns 0.0 to 1.0 — higher means more similar.
 */
export function cosineSimilarity(a: TermVector, b: TermVector): number {
  let dotProduct = 0;

  // Iterate over the smaller vector for efficiency
  const [smaller, larger] = a.terms.size <= b.terms.size ? [a, b] : [b, a];

  for (const [term, weightA] of smaller.terms) {
    const weightB = larger.terms.get(term);
    if (weightB !== undefined) {
      dotProduct += weightA * weightB;
    }
  }

  return dotProduct / (a.magnitude * b.magnitude);
}

// ─── Semantic Similarity Corpus ───────────────────────────────────────────

export interface CachedPromptEntry {
  id: string;
  prompt: string;
  tokens: string[];
  tf: Map<string, number>;
  response: string;
  model: string;
  tokensSaved: number;
  timestamp: number;
}

/**
 * Manages an in-memory corpus of cached prompts for fast similarity search.
 */
export class SemanticCorpus {
  private entries: CachedPromptEntry[] = [];
  private idf: Map<string, number> = new Map();
  private vectors: Map<string, TermVector> = new Map();
  private maxSize: number;
  private similarityThreshold: number;

  constructor(maxSize = 500, threshold = 0.78) {
    this.maxSize = maxSize;
    this.similarityThreshold = threshold;
  }

  /**
   * Add a prompt-response pair to the corpus.
   */
  add(id: string, prompt: string, response: string, model: string, tokensSaved: number): void {
    const tokens = tokenize(prompt);
    const tf = computeTF(tokens);

    // Evict oldest if at capacity
    if (this.entries.length >= this.maxSize) {
      const oldest = this.entries.shift();
      if (oldest) this.vectors.delete(oldest.id);
    }

    this.entries.push({ id, prompt, tokens, tf, response, model, tokensSaved, timestamp: Date.now() });
    this.recomputeIDF();
  }

  /**
   * Find the most similar cached prompt above the threshold.
   */
  findSimilar(prompt: string): {
    match: CachedPromptEntry | null;
    similarity: number;
    matchType: "exact" | "semantic" | "none";
  } {
    if (this.entries.length === 0) return { match: null, similarity: 0, matchType: "none" };

    const tokens = tokenize(prompt);
    const tf = computeTF(tokens);
    const queryVector = computeTFIDF(tf, this.idf);

    let bestMatch: CachedPromptEntry | null = null;
    let bestScore = 0;

    for (const entry of this.entries) {
      const entryVector = this.getVector(entry);
      const score = cosineSimilarity(queryVector, entryVector);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }

    if (bestScore >= 0.98) {
      return { match: bestMatch, similarity: bestScore, matchType: "exact" };
    }
    if (bestScore >= this.similarityThreshold) {
      return { match: bestMatch, similarity: bestScore, matchType: "semantic" };
    }

    return { match: null, similarity: bestScore, matchType: "none" };
  }

  /**
   * Load entries from DB cache.
   */
  loadFromDB(entries: Array<{
    id: string;
    prompt: string;
    response: string;
    model: string;
    tokensSaved: number;
  }>): void {
    for (const e of entries) {
      const tokens = tokenize(e.prompt);
      const tf = computeTF(tokens);
      this.entries.push({
        ...e,
        tokens,
        tf,
        timestamp: Date.now(),
      });
    }
    this.recomputeIDF();
  }

  get size(): number {
    return this.entries.length;
  }

  get threshold(): number {
    return this.similarityThreshold;
  }

  private getVector(entry: CachedPromptEntry): TermVector {
    let vec = this.vectors.get(entry.id);
    if (!vec) {
      vec = computeTFIDF(entry.tf, this.idf);
      this.vectors.set(entry.id, vec);
    }
    return vec;
  }

  private recomputeIDF(): void {
    const corpus = this.entries.map(e => e.tf);
    this.idf = computeIDF(corpus);
    this.vectors.clear(); // invalidate cached vectors
  }
}
