// src/lib/compiler/domainCoherence.ts
// Extracted from buildOrchestrator.ts — domain coherence post-build gate.

import type { Workspace } from "./workspace";

export interface CoherenceResult {
  passed: boolean;
  requestedTokens: string[];
  generatedTokens: string[];
  overlapCount: number;
  reason: string;
}

/**
 * Extracts domain-relevant tokens from text.
 * Looks for nouns/concepts that indicate what the app is about.
 */
function extractDomainTokens(text: string): string[] {
  const normalized = text.toLowerCase();
  const tokens = new Set<string>();

  const DOMAIN_PATTERNS = [
    /\b(employee management|time tracking|performance review|onboarding workflow|org(?:anization)? structure)\b/gi,
    /\b(log ?book|e-?log|clinical posting|competency framework|exam eligibility|competency.based|medical education)\b/gi,
    /\b(project management|task board|kanban board|sales pipeline|invoice management)\b/gi,
    /\b(user management|role management|access control|file storage|data analytics)\b/gi,
    /\b(academic structure|student management|faculty evaluation|assessment template|posting rotation)\b/gi,
    /\b(university admin|institution admin|platform admin|head of department|primary guide)\b/gi,
    /\b(kpi monitoring|exam eligibility|accreditation|certification|residency program)\b/gi,
  ];

  for (const pattern of DOMAIN_PATTERNS) {
    const matches = text.match(pattern) || [];
    for (const m of matches) tokens.add(m.toLowerCase().trim());
  }

  const NOUN_PATTERN = /\b(employee|department|attendance|pto|review|onboarding|hr|erp|payroll|salary|leave|roster|shift|timesheet|appraisal|hire|recruit|candidate|benefit|compliance|grievance|training|university|student|faculty|logbook|competency|posting|rotation|assessment|curriculum|exam|grade|course|enrollment|hospital|patient|doctor|nurse|ward|diagnosis|prescription|pharmacy|lab|appointment|crm|contact|lead|deal|pipeline|invoice|quote|proposal|client|customer|account|opportunity|ecommerce|product|cart|order|checkout|shipping|catalog|inventory|warehouse|supplier|purchase|stock|blog|post|comment|author|category|tag|article|chat|message|conversation|channel|thread|notification|task|project|milestone|sprint|backlog|ticket|issue|bug|feature|dashboard|report|analytics|chart|metric|kpi|widget|calendar|schedule|booking|event|meeting|agenda|school|teacher|parent|timetable|fee|admission|announcement|classroom|syllabus|cbme|postgraduate|residency|fellowship|specialty|supervisor|mentor|guide|evaluation|portfolio|certification|accreditation|clinic|medical|surgery|eligibility|domain|module|workflow|permission|tenant)\b/gi;

  const nounMatches = normalized.match(NOUN_PATTERN) || [];
  for (const m of nounMatches) tokens.add(m);

  return [...tokens];
}

/**
 * Post-build domain coherence check.
 * Verifies that generated workspace files match the requested domain.
 * Catches cases where cache poisoning, context loss, or hallucination
 * produced an unrelated app.
 */
export function checkDomainCoherence(
  rawRequirements: string,
  workspace: Workspace,
): CoherenceResult {
  const requestedTokens = extractDomainTokens(rawRequirements);

  if (requestedTokens.length < 2) {
    return {
      passed: true,
      requestedTokens,
      generatedTokens: [],
      overlapCount: 0,
      reason: "Skipped — too few domain tokens in requirements to validate",
    };
  }

  // Scan workspace file paths + first 200 chars of each file
  const fileText = workspace.listFiles()
    .map(path => `${path} ${(workspace.getFile(path) || "").slice(0, 200)}`)
    .join(" ");

  const generatedTokens = extractDomainTokens(fileText);

  const requestedSet = new Set(requestedTokens);
  const overlapCount = generatedTokens.filter(t => requestedSet.has(t)).length;

  const overlapRatio = requestedTokens.length > 0 ? overlapCount / requestedTokens.length : 0;
  const passed = overlapCount >= 2 || overlapRatio >= 0.2;

  return {
    passed,
    requestedTokens: requestedTokens.slice(0, 20),
    generatedTokens: generatedTokens.slice(0, 20),
    overlapCount,
    reason: passed
      ? `${overlapCount} domain tokens matched (${(overlapRatio * 100).toFixed(0)}%)`
      : `Only ${overlapCount} domain tokens matched (${(overlapRatio * 100).toFixed(0)}%) — generated app does not match requested domain`,
  };
}
