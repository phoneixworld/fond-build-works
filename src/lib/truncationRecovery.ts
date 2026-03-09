/**
 * Truncation Recovery — detects when AI output is cut off mid-file
 * and auto-sends a continuation request to complete the output.
 *
 * Detection strategies:
 * 1. Unclosed code fence (no closing ```)
 * 2. Unclosed JSX/function (brace/bracket mismatch)
 * 3. Missing export (file started but no export statement)
 * 4. Abrupt end mid-line
 */

export interface TruncationResult {
  isTruncated: boolean;
  reason: string;
  truncatedFile: string | null;
  lastCompleteFile: string | null;
  continuationPrompt: string;
}

/**
 * Detect if the AI response was truncated and generate a continuation prompt.
 */
export function detectTruncation(
  rawResponse: string,
  parsedFiles: Record<string, string> | null
): TruncationResult {
  const noTruncation: TruncationResult = {
    isTruncated: false,
    reason: "",
    truncatedFile: null,
    lastCompleteFile: null,
    continuationPrompt: "",
  };

  if (!rawResponse || rawResponse.length < 100) return noTruncation;

  // Strategy 1: Unclosed code fence
  const fenceOpeners = rawResponse.match(/```(?:react-preview|jsx-preview|react|jsx|tsx|javascript|typescript)/g) || [];
  const fenceClosers = rawResponse.match(/\n```\s*$/gm) || [];
  
  if (fenceOpeners.length > fenceClosers.length) {
    const truncatedFile = findLastFileInProgress(rawResponse);
    return {
      isTruncated: true,
      reason: "Unclosed code fence — response was cut off",
      truncatedFile,
      lastCompleteFile: findLastCompleteFile(rawResponse),
      continuationPrompt: buildContinuationPrompt(truncatedFile, rawResponse),
    };
  }

  // Strategy 2: Check parsed files for incomplete code
  if (parsedFiles) {
    for (const [path, code] of Object.entries(parsedFiles)) {
      if (!path.match(/\.(jsx?|tsx?)$/)) continue;

      const truncation = detectCodeTruncation(code, path);
      if (truncation) {
        return {
          isTruncated: true,
          reason: truncation,
          truncatedFile: path,
          lastCompleteFile: findPreviousFile(parsedFiles, path),
          continuationPrompt: buildContinuationPrompt(path, rawResponse),
        };
      }
    }
  }

  // Strategy 3: Response ends abruptly (mid-word or mid-line)
  const lastLine = rawResponse.trimEnd().split("\n").pop() || "";
  if (
    lastLine.length > 5 &&
    !lastLine.endsWith(";") &&
    !lastLine.endsWith("}") &&
    !lastLine.endsWith(">") &&
    !lastLine.endsWith("```") &&
    !lastLine.endsWith("`") &&
    !lastLine.endsWith(".") &&
    !lastLine.trim().startsWith("---")
  ) {
    const truncatedFile = findLastFileInProgress(rawResponse);
    if (truncatedFile) {
      return {
        isTruncated: true,
        reason: "Response ended abruptly mid-line",
        truncatedFile,
        lastCompleteFile: null,
        continuationPrompt: buildContinuationPrompt(truncatedFile, rawResponse),
      };
    }
  }

  return noTruncation;
}

/**
 * Detect if a single file's code is truncated.
 */
function detectCodeTruncation(code: string, filePath: string): string | null {
  // Check brace balance
  let braceDepth = 0;
  let parenDepth = 0;
  let inString = false;
  let stringChar = "";
  let inTemplate = false;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const prev = i > 0 ? code[i - 1] : "";

    if (inString) {
      if (ch === stringChar && prev !== "\\") inString = false;
      continue;
    }
    if (inTemplate) {
      if (ch === "`" && prev !== "\\") inTemplate = false;
      continue;
    }

    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
    if (ch === "`") { inTemplate = true; continue; }
    if (ch === "{") braceDepth++;
    if (ch === "}") braceDepth--;
    if (ch === "(") parenDepth++;
    if (ch === ")") parenDepth--;
  }

  if (braceDepth > 2) {
    return `${filePath}: ${braceDepth} unclosed braces — code was truncated`;
  }
  if (parenDepth > 2) {
    return `${filePath}: ${parenDepth} unclosed parentheses — code was truncated`;
  }

  // Check for missing export in JSX files
  if (filePath.match(/\.(jsx?|tsx?)$/) && !code.includes("export")) {
    return `${filePath}: No export statement — file may be incomplete`;
  }

  return null;
}

/**
 * Find the last file separator in the raw response to identify
 * which file was being written when truncation occurred.
 */
function findLastFileInProgress(raw: string): string | null {
  const separators = [...raw.matchAll(/^-{3}\s+(\/?\w[\w/.\-]*\.(?:jsx?|tsx?|css))\s*$/gm)];
  if (separators.length === 0) return null;
  return separators[separators.length - 1][1];
}

function findLastCompleteFile(raw: string): string | null {
  const separators = [...raw.matchAll(/^-{3}\s+(\/?\w[\w/.\-]*\.(?:jsx?|tsx?|css))\s*$/gm)];
  if (separators.length < 2) return null;
  return separators[separators.length - 2][1];
}

function findPreviousFile(files: Record<string, string>, currentPath: string): string | null {
  const keys = Object.keys(files);
  const idx = keys.indexOf(currentPath);
  return idx > 0 ? keys[idx - 1] : null;
}

/**
 * Build a continuation prompt that instructs the AI to resume
 * from where it was cut off.
 */
function buildContinuationPrompt(truncatedFile: string | null, rawResponse: string): string {
  // Extract the last 500 chars of the response as context
  const tail = rawResponse.slice(-500);

  if (truncatedFile) {
    return `## CONTINUATION — YOUR PREVIOUS RESPONSE WAS TRUNCATED

The file "${truncatedFile}" was cut off mid-generation. Here is the end of your last response:

\`\`\`
${tail}
\`\`\`

INSTRUCTIONS:
1. Continue EXACTLY from where you stopped — do NOT restart the file
2. Output the REMAINING code for "${truncatedFile}" starting from the cutoff point
3. Then continue with any remaining files that were not yet generated
4. Wrap everything in \`\`\`react-preview fences with --- file separators
5. Start with --- ${truncatedFile} (continuing)`;
  }

  return `## CONTINUATION — YOUR PREVIOUS RESPONSE WAS TRUNCATED

Your response was cut off. Here is the end:

\`\`\`
${tail}
\`\`\`

Continue generating the remaining files. Wrap in \`\`\`react-preview fences.`;
}