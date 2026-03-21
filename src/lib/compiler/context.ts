/**
 * Build Compiler v1.0 — Canonical Context Assembly
 * 
 * Assembles one canonical BuildContext from raw inputs.
 * This is the ONLY thing downstream steps read.
 */

import type { BuildContext, BuildIntent, IRManifest, IREntity, IRRole, IRRoute, IRModule } from "./types";

// ─── Intent Detection ─────────────────────────────────────────────────────

const FIX_PATTERNS = /\b(fix|error|bug|broken|crash|blank|not working|issue|SyntaxError|TypeError|ReferenceError)\b/i;
const REFACTOR_PATTERNS = /\b(refactor|restructure|reorganize|clean up|simplify|optimize)\b/i;
const EXTEND_PATTERNS = /\b(add|extend|integrate|include|implement|create new|build new)\b/i;

// Patterns that strongly indicate "build me an app" — takes precedence over fix/refactor
const NEW_APP_PATTERNS = /\b(build\s+(?:a|an|the|me|my)\s+\w|create\s+(?:a|an|the|me|my)\s+\w|School\s+ERP|CRM|e-?commerce|dashboard|management\s+system|admin\s+panel|project\s+manager|task\s+board|inventory|booking|scheduling)\b/i;
const BUILD_TRIGGER_PATTERNS = /\b(build\s+it|generate|start\s+building|create\s+the\s+app)\b/i;

export function detectBuildIntent(
  rawRequirements: string,
  hasExistingWorkspace: boolean
): BuildIntent {
  // "Build it" or "build me a School ERP" is always new_app regardless of other words
  if (!hasExistingWorkspace && (BUILD_TRIGGER_PATTERNS.test(rawRequirements) || NEW_APP_PATTERNS.test(rawRequirements))) {
    return "new_app";
  }
  if (!hasExistingWorkspace) return "new_app";
  if (FIX_PATTERNS.test(rawRequirements)) return "fix";
  if (REFACTOR_PATTERNS.test(rawRequirements)) return "refactor";
  if (EXTEND_PATTERNS.test(rawRequirements)) return "extend";
  return "extend";
}

// ─── IR Extraction (deterministic, regex-based) ───────────────────────────

export function extractIRFromRequirements(raw: string): IRManifest {
  const entities = extractEntities(raw);
  const roles = extractRoles(raw);
  const routes = extractRoutes(raw);
  const modules = inferModules(entities, routes);
  const constraints = extractConstraints(raw);

  return {
    entities,
    roles,
    workflows: [], // workflows are extracted by the LLM semantic pass
    routes,
    modules,
    constraints,
  };
}

// ─── Domain Detection ─────────────────────────────────────────────────────

type DomainType = "hospital" | "school" | "crm" | "ecommerce" | "project_mgmt" | "generic";

function detectDomain(raw: string): DomainType {
  const text = raw.toLowerCase();
  const scores: Record<DomainType, number> = {
    hospital: 0, school: 0, crm: 0, ecommerce: 0, project_mgmt: 0, generic: 0,
  };

  const hospitalKeywords = [
    "hospital", "medical", "patient", "doctor", "nurse", "clinic", "pharmacy",
    "prescription", "diagnosis", "appointment", "ward", "icu", "opd", "lab",
    "radiology", "pathology", "healthcare", "health care", "medicore", "telehealth",
    "insurance claim", "medical staff", "blood bank", "ambulance", "surgery",
  ];
  scores.hospital = hospitalKeywords.filter(k => text.includes(k)).length;

  const schoolKeywords = [
    "school", "student", "teacher", "classroom", "grade", "gradebook", "pupil",
    "parent", "guardian", "syllabus", "homework", "exam", "semester", "school erp",
    "academic", "enrollment", "curriculum", "lms", "learning management",
  ];
  scores.school = schoolKeywords.filter(k => text.includes(k)).length;

  const crmKeywords = ["crm", "lead", "deal", "pipeline", "opportunity", "sales", "prospect", "conversion"];
  scores.crm = crmKeywords.filter(k => text.includes(k)).length;

  const ecomKeywords = ["ecommerce", "e-commerce", "shop", "cart", "checkout", "order", "catalog", "storefront"];
  scores.ecommerce = ecomKeywords.filter(k => text.includes(k)).length;

  const pmKeywords = ["project management", "task board", "kanban", "sprint", "backlog", "agile", "scrum"];
  scores.project_mgmt = pmKeywords.filter(k => text.includes(k)).length;

  let best: DomainType = "generic";
  let bestScore = 0;
  for (const [domain, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = domain as DomainType;
    }
  }

  // Lower threshold: even 1 strong signal (e.g. "school" or "lms") should trigger domain detection
  return bestScore >= 1 ? best : "generic";
}

// ─── Domain-Specific Entity Libraries ─────────────────────────────────────

type EntityTemplate = { pattern: RegExp; name: string; fields: Array<{name: string; type: string; required: boolean}> };

const HOSPITAL_ENTITIES: EntityTemplate[] = [
  { pattern: /\bpatient/i, name: "Patient", fields: [
    { name: "name", type: "string", required: true }, { name: "age", type: "number", required: true },
    { name: "gender", type: "string", required: false }, { name: "phone", type: "string", required: false },
    { name: "blood_group", type: "string", required: false }, { name: "status", type: "string", required: false },
  ]},
  { pattern: /\b(doctor|physician|consultant)\b/i, name: "Doctor", fields: [
    { name: "name", type: "string", required: true }, { name: "specialization", type: "string", required: true },
    { name: "email", type: "string", required: false }, { name: "department", type: "string", required: false },
  ]},
  { pattern: /\b(appointment|consultation)\b/i, name: "Appointment", fields: [
    { name: "patient_id", type: "string", required: true }, { name: "doctor_id", type: "string", required: true },
    { name: "date", type: "date", required: true }, { name: "status", type: "string", required: false },
  ]},
  { pattern: /\b(prescription|medication|medicine)\b/i, name: "Prescription", fields: [
    { name: "patient_id", type: "string", required: true }, { name: "doctor_id", type: "string", required: true },
    { name: "medication", type: "string", required: true }, { name: "dosage", type: "string", required: false },
  ]},
  { pattern: /\b(pharmacy|drug|medicine stock)\b/i, name: "Pharmacy", fields: [
    { name: "name", type: "string", required: true }, { name: "quantity", type: "number", required: true },
    { name: "price", type: "number", required: false }, { name: "category", type: "string", required: false },
  ]},
  { pattern: /\b(billing|invoice|payment)\b/i, name: "Invoice", fields: [
    { name: "patient_id", type: "string", required: true }, { name: "amount", type: "number", required: true },
    { name: "status", type: "string", required: true }, { name: "due_date", type: "date", required: false },
  ]},
  { pattern: /\b(ward|bed|room)\b/i, name: "Ward", fields: [
    { name: "name", type: "string", required: true }, { name: "capacity", type: "number", required: true },
    { name: "occupied", type: "number", required: false }, { name: "type", type: "string", required: false },
  ]},
  { pattern: /\b(lab|laboratory|test|pathology|radiology)\b/i, name: "LabTest", fields: [
    { name: "patient_id", type: "string", required: true }, { name: "test_name", type: "string", required: true },
    { name: "result", type: "string", required: false }, { name: "status", type: "string", required: false },
  ]},
  { pattern: /\b(nurse|nursing)\b/i, name: "Nurse", fields: [
    { name: "name", type: "string", required: true }, { name: "department", type: "string", required: false },
    { name: "shift", type: "string", required: false }, { name: "status", type: "string", required: false },
  ]},
  { pattern: /\b(staff|employee|roster|shift)\b/i, name: "Staff", fields: [
    { name: "name", type: "string", required: true }, { name: "role", type: "string", required: true },
    { name: "department", type: "string", required: false }, { name: "shift", type: "string", required: false },
  ]},
  { pattern: /\b(insurance|claim)\b/i, name: "InsuranceClaim", fields: [
    { name: "patient_id", type: "string", required: true }, { name: "provider", type: "string", required: true },
    { name: "amount", type: "number", required: true }, { name: "status", type: "string", required: false },
  ]},
  { pattern: /\b(blood\s*bank|blood\s*donation|blood)\b/i, name: "BloodBank", fields: [
    { name: "blood_type", type: "string", required: true }, { name: "units", type: "number", required: true },
    { name: "donor_name", type: "string", required: false }, { name: "status", type: "string", required: false },
  ]},
  { pattern: /\b(attendance|time\s*tracking)\b/i, name: "StaffAttendance", fields: [
    { name: "staff_id", type: "string", required: true }, { name: "date", type: "date", required: true },
    { name: "check_in", type: "string", required: false }, { name: "status", type: "string", required: false },
  ]},
];

const SCHOOL_ENTITIES: EntityTemplate[] = [
  { pattern: /\b(student|pupil|learner)s?\b/i, name: "Student", fields: [
    { name: "name", type: "string", required: true }, { name: "email", type: "string", required: true },
    { name: "grade", type: "string", required: false }, { name: "status", type: "string", required: false },
  ]},
  { pattern: /\b(teacher|instructor|faculty)\b/i, name: "Teacher", fields: [
    { name: "name", type: "string", required: true }, { name: "email", type: "string", required: true },
    { name: "subject", type: "string", required: false }, { name: "department", type: "string", required: false },
  ]},
  { pattern: /\b(parent|guardian)\b/i, name: "Parent", fields: [
    { name: "name", type: "string", required: true }, { name: "email", type: "string", required: true },
    { name: "phone", type: "string", required: false },
  ]},
  { pattern: /\b(class|course|subject)\b/i, name: "Class", fields: [
    { name: "name", type: "string", required: true }, { name: "teacher", type: "string", required: false },
    { name: "schedule", type: "string", required: false },
  ]},
  { pattern: /\b(attendance)\b/i, name: "Attendance", fields: [
    { name: "student_id", type: "string", required: true }, { name: "date", type: "date", required: true },
    { name: "status", type: "string", required: true },
  ]},
  { pattern: /\b(grade|mark|score|assessment)\b/i, name: "Grade", fields: [
    { name: "student_id", type: "string", required: true }, { name: "subject", type: "string", required: true },
    { name: "score", type: "number", required: true },
  ]},
  { pattern: /\b(fee|tuition)\b/i, name: "Fee", fields: [
    { name: "student_id", type: "string", required: true }, { name: "amount", type: "number", required: true },
    { name: "status", type: "string", required: true }, { name: "due_date", type: "date", required: false },
  ]},
];

const GENERIC_ENTITIES: EntityTemplate[] = [
  { pattern: /\b(contact|lead|customer|client)\b/i, name: "Contact", fields: [
    { name: "name", type: "string", required: true }, { name: "email", type: "string", required: true },
    { name: "company", type: "string", required: false }, { name: "status", type: "string", required: false },
  ]},
  { pattern: /\b(deal|opportunity|pipeline)\b/i, name: "Deal", fields: [
    { name: "title", type: "string", required: true }, { name: "value", type: "number", required: true },
    { name: "stage", type: "string", required: true }, { name: "contact_id", type: "string", required: false },
  ]},
  { pattern: /\b(task|ticket|issue)\b/i, name: "Task", fields: [
    { name: "title", type: "string", required: true }, { name: "description", type: "string", required: false },
    { name: "status", type: "string", required: true }, { name: "assignee", type: "string", required: false },
    { name: "priority", type: "string", required: false },
  ]},
  { pattern: /\b(project)\b/i, name: "Project", fields: [
    { name: "name", type: "string", required: true }, { name: "description", type: "string", required: false },
    { name: "status", type: "string", required: true }, { name: "deadline", type: "date", required: false },
  ]},
  { pattern: /\b(product|item|inventory)\b/i, name: "Product", fields: [
    { name: "name", type: "string", required: true }, { name: "price", type: "number", required: true },
    { name: "quantity", type: "number", required: true }, { name: "category", type: "string", required: false },
  ]},
  { pattern: /\b(order|purchase)\b/i, name: "Order", fields: [
    { name: "customer", type: "string", required: true }, { name: "total", type: "number", required: true },
    { name: "status", type: "string", required: true }, { name: "date", type: "date", required: true },
  ]},
  { pattern: /\b(employee|worker|team\s*member)\b/i, name: "Employee", fields: [
    { name: "name", type: "string", required: true }, { name: "email", type: "string", required: true },
    { name: "role", type: "string", required: false }, { name: "department", type: "string", required: false },
  ]},
];

function getEntityLibrary(domain: DomainType): EntityTemplate[] {
  switch (domain) {
    case "hospital": return HOSPITAL_ENTITIES;
    case "school": return SCHOOL_ENTITIES;
    case "crm": return [...GENERIC_ENTITIES.filter(e => ["Contact", "Deal"].includes(e.name))];
    case "ecommerce": return [...GENERIC_ENTITIES.filter(e => ["Product", "Order"].includes(e.name))];
    case "project_mgmt": return [...GENERIC_ENTITIES.filter(e => ["Project", "Task"].includes(e.name))];
    default: return GENERIC_ENTITIES;
  }
}

// ─── Entity Extraction ────────────────────────────────────────────────────

function extractEntities(raw: string): IREntity[] {
  const entities: IREntity[] = [];
  // Match patterns like "- EntityName (field1, field2 [type], ...)"
  const entityRegex = /[-•]\s*(\w+)\s*\(([^)]+)\)/g;
  let match;
  while ((match = entityRegex.exec(raw)) !== null) {
    const name = match[1];
    const fieldsRaw = match[2];
    // Skip if it looks like a page/route pattern
    if (name.startsWith("/") || ["login", "dashboard", "settings", "page"].includes(name.toLowerCase())) continue;

    const fields = fieldsRaw.split(",").map(f => {
      const trimmed = f.trim();
      const bracketMatch = trimmed.match(/(\w+)\s*\[([^\]]+)\]/);
      if (bracketMatch) {
        return { name: bracketMatch[1], type: bracketMatch[2], required: true };
      }
      return { name: trimmed.replace(/\s+/g, "_"), type: "string", required: false };
    });

    entities.push({ name, fields });
  }

  // ── Semantic entity extraction from natural language ──
  // If regex found nothing, use domain-specific entity library
  if (entities.length === 0) {
    const domain = detectDomain(raw);
    const library = getEntityLibrary(domain);

    console.log(`[IR] Detected domain: ${domain}, using ${library.length} entity templates`);

    const seenNames = new Set<string>();
    for (const ep of library) {
      if (ep.pattern.test(raw) && !seenNames.has(ep.name)) {
        entities.push({ name: ep.name, fields: ep.fields });
        seenNames.add(ep.name);
      }
    }
  }

  return entities;
}

function extractRoles(raw: string): IRRole[] {
  const roles: IRRole[] = [];
  const roleMatch = raw.match(/roles?:\s*([^\n]+)/i);
  if (roleMatch) {
    const roleNames = roleMatch[1].split(/[,/]/).map(r => r.trim().toLowerCase()).filter(Boolean);
    for (const name of roleNames) {
      roles.push({
        name,
        permissions: name === "admin" ? ["read", "write", "delete", "manage"] : ["read", "write"],
      });
    }
  }
  return roles;
}

function extractRoutes(raw: string): IRRoute[] {
  const routes: IRRoute[] = [];
  const routeRegex = /[-•]\s*(\/[\w/:]+)\s*(?:—|[-–])\s*(.+)/g;
  let match;
  while ((match = routeRegex.exec(raw)) !== null) {
    const path = match[1];
    const desc = match[2].trim();
    const page = path.split("/").filter(Boolean)[0] || "Home";
    const pageName = page.charAt(0).toUpperCase() + page.slice(1) + "Page";
    routes.push({
      path,
      page: pageName,
      auth: !path.includes("login") && !path.includes("signup"),
    });
  }

  // ── Semantic route inference from natural language ──
  // If regex found no explicit routes, infer from module/page keywords
  if (routes.length === 0) {
    const domain = detectDomain(raw);

    // Domain-specific route patterns
    const hospitalRoutes: Array<{ pattern: RegExp; path: string; page: string }> = [
      { pattern: /\b(dashboard|overview|home)\b/i, path: "/", page: "DashboardPage" },
      { pattern: /\bpatient/i, path: "/patients", page: "PatientsPage" },
      { pattern: /\b(appointment|consultation)\b/i, path: "/appointments", page: "AppointmentsPage" },
      { pattern: /\b(doctor|physician)\b/i, path: "/doctors", page: "DoctorsPage" },
      { pattern: /\b(staff|employee|roster|shift)\b/i, path: "/staff", page: "StaffPage" },
      { pattern: /\b(pharmacy|drug|medication)\b/i, path: "/pharmacy", page: "PharmacyPage" },
      { pattern: /\b(billing|invoice|payment)\b/i, path: "/billing", page: "BillingPage" },
      { pattern: /\b(lab|laboratory|pathology|radiology)\b/i, path: "/laboratory", page: "LaboratoryPage" },
      { pattern: /\b(ward|bed|room|admission)\b/i, path: "/wards", page: "WardsPage" },
      { pattern: /\b(nurse|nursing)\b/i, path: "/nursing", page: "NursingPage" },
      { pattern: /\b(insurance|claim)\b/i, path: "/insurance", page: "InsurancePage" },
      { pattern: /\b(blood\s*bank|blood)\b/i, path: "/blood-bank", page: "BloodBankPage" },
      { pattern: /\breport/i, path: "/reports", page: "ReportsPage" },
      { pattern: /\bsetting/i, path: "/settings", page: "SettingsPage" },
    ];

    const schoolRoutes: Array<{ pattern: RegExp; path: string; page: string }> = [
      { pattern: /\b(dashboard|overview|home)\b/i, path: "/", page: "DashboardPage" },
      { pattern: /\bstudent/i, path: "/students", page: "StudentsPage" },
      { pattern: /\b(teacher|instructor|faculty)\b/i, path: "/teachers", page: "TeachersPage" },
      { pattern: /\b(parent|guardian)\b/i, path: "/parents", page: "ParentsPage" },
      { pattern: /\battendance\b/i, path: "/attendance", page: "AttendancePage" },
      { pattern: /\b(grade|gradebook|marks|assessment)\b/i, path: "/grades", page: "GradesPage" },
      { pattern: /\b(fee|tuition)\b/i, path: "/fees", page: "FeesPage" },
      { pattern: /\b(timetable|schedule|calendar)\b/i, path: "/timetable", page: "TimetablePage" },
      { pattern: /\b(announcement|notice|notification)\b/i, path: "/announcements", page: "AnnouncementsPage" },
      { pattern: /\breport/i, path: "/reports", page: "ReportsPage" },
      { pattern: /\bsetting/i, path: "/settings", page: "SettingsPage" },
    ];

    const genericRoutes: Array<{ pattern: RegExp; path: string; page: string }> = [
      { pattern: /\b(dashboard|overview|home)\b/i, path: "/", page: "DashboardPage" },
      { pattern: /\b(contact|lead|customer)\b/i, path: "/contacts", page: "ContactsPage" },
      { pattern: /\b(deal|opportunity|pipeline)\b/i, path: "/deals", page: "DealsPage" },
      { pattern: /\b(task|ticket|issue)\b/i, path: "/tasks", page: "TasksPage" },
      { pattern: /\b(project)\b/i, path: "/projects", page: "ProjectsPage" },
      { pattern: /\b(product|inventory|catalog)\b/i, path: "/products", page: "ProductsPage" },
      { pattern: /\b(order|purchase)\b/i, path: "/orders", page: "OrdersPage" },
      { pattern: /\b(employee|team|hr)\b/i, path: "/employees", page: "EmployeesPage" },
      { pattern: /\breport/i, path: "/reports", page: "ReportsPage" },
      { pattern: /\bsetting/i, path: "/settings", page: "SettingsPage" },
    ];

    const routePatterns = domain === "hospital" ? hospitalRoutes :
                          domain === "school" ? schoolRoutes :
                          genericRoutes;

    console.log(`[IR] Using ${domain} route patterns`);

    // Always add dashboard for new apps
    const hasDashboardKeyword = /\b(dashboard|overview|home)\b/i.test(raw);
    if (!hasDashboardKeyword) {
      routes.push({ path: "/", page: "DashboardPage", auth: true });
    }

    const seenPages = new Set<string>();
    for (const rp of routePatterns) {
      if (rp.pattern.test(raw) && !seenPages.has(rp.page)) {
        routes.push({ path: rp.path, page: rp.page, auth: !rp.path.includes("login") });
        seenPages.add(rp.page);
      }
    }
  }

  return routes;
}

function extractConstraints(raw: string): string[] {
  const constraints: string[] = [];
  if (/AUTH:\s*Enabled/i.test(raw)) constraints.push("auth_required");
  if (/drag.?and.?drop/i.test(raw)) constraints.push("drag_and_drop");
  if (/real.?time/i.test(raw)) constraints.push("realtime");
  if (/CRUD/i.test(raw)) constraints.push("full_crud");
  if (/sidebar/i.test(raw)) constraints.push("sidebar_navigation");
  return constraints;
}

function inferModules(entities: IREntity[], routes: IRRoute[]): IRModule[] {
  const modules: IRModule[] = [];

  // Auth module if any route requires auth
  if (routes.some(r => r.auth)) {
    modules.push({ name: "AuthContext", type: "context", description: "Authentication provider with login/signup" });
    modules.push({ name: "LoginPage", type: "page", description: "Login and signup page" });
  }

  // Pages from routes
  for (const route of routes) {
    if (!modules.some(m => m.name === route.page)) {
      modules.push({ name: route.page, type: "page", description: `Page for ${route.path}` });
    }
  }

  // CRUD components for entities
  for (const entity of entities) {
    modules.push({ name: `${entity.name}List`, type: "component", description: `List view for ${entity.name}` });
    modules.push({ name: `${entity.name}Form`, type: "component", description: `Create/edit form for ${entity.name}` });
  }

  // App entry
  modules.push({ name: "App", type: "component", description: "Root app component with routing" });

  return modules;
}

// ─── Context Assembly ─────────────────────────────────────────────────────

export function assembleBuildContext(params: {
  rawRequirements: string;
  semanticSummary?: string;
  ir?: Partial<IRManifest>;
  existingWorkspace: Record<string, string>;
  projectId: string;
  techStack: string;
  schemas?: any[];
  knowledge?: string[];
  designTheme?: string;
  model?: string;
}): BuildContext {
  const hasExisting = Object.keys(params.existingWorkspace).length > 0;
  const intent = detectBuildIntent(params.rawRequirements, hasExisting);

  // For fix/extend intents on existing workspaces, DON'T re-extract entities/routes
  // from raw text — the existing workspace already defines the app structure.
  // Only extract for new_app or when no IR is provided.
  const shouldExtractIR = intent === "new_app" || !hasExisting;
  const extractedIR = shouldExtractIR ? extractIRFromRequirements(params.rawRequirements) : {
    entities: [] as IREntity[],
    roles: [] as IRRole[],
    workflows: [] as any[],
    routes: [] as IRRoute[],
    modules: [] as IRModule[],
    constraints: [] as string[],
  };

  if (!shouldExtractIR) {
    console.log(`[IR] Skipping entity extraction for ${intent} intent (existing workspace has ${Object.keys(params.existingWorkspace).length} files)`);
  }

  // Merge provided IR with extracted IR (provided takes precedence)
  const mergedIR: IRManifest = {
    entities: params.ir?.entities?.length ? params.ir.entities : extractedIR.entities,
    roles: params.ir?.roles?.length ? params.ir.roles : extractedIR.roles,
    workflows: params.ir?.workflows?.length ? params.ir.workflows : extractedIR.workflows,
    routes: params.ir?.routes?.length ? params.ir.routes : extractedIR.routes,
    modules: params.ir?.modules?.length ? params.ir.modules : extractedIR.modules,
    constraints: [...new Set([...(params.ir?.constraints || []), ...extractedIR.constraints])],
  };

  return {
    rawRequirements: params.rawRequirements,
    semanticSummary: params.semanticSummary || "",
    ir: mergedIR,
    existingWorkspace: params.existingWorkspace,
    buildIntent: intent,
    projectId: params.projectId,
    techStack: params.techStack,
    schemas: params.schemas,
    knowledge: params.knowledge,
    designTheme: params.designTheme,
    model: params.model,
  };
}
