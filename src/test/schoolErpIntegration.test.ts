import { describe, it, expect } from "vitest";
import { Workspace } from "@/lib/compiler/workspace";
import { synthesizeAppJsx } from "@/lib/compiler/appSynthesizer";
import { fixExportMismatches } from "@/lib/compiler/exportMismatchFixer";
import { fixMissingImports } from "@/lib/compiler/missingImportFixer";
import { getAllUIComponents } from "@/lib/templates/uiComponentTemplates";

/**
 * Integration test: simulates an AI-generated School ERP workspace
 * and runs it through the same post-processing pipeline as the real compiler.
 * Validates no "Element type is invalid" or "cn is not a function" errors.
 */
describe("School ERP integration", () => {
  function buildSchoolErpWorkspace() {
    const ui = getAllUIComponents();
    return new Workspace({
      ...ui,
      "/contexts/AuthContext.jsx": `import React, { createContext, useContext, useState } from "react";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState({ role: "admin" });
  return <AuthContext.Provider value={{ user, setUser }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }`,
      "/components/ProtectedRoute.jsx": `import React from "react";
import { useAuth } from "../contexts/AuthContext";
export default function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <div>Please log in</div>;
  return <>{children}</>;
}`,
      // Named-only exports (the pattern that breaks)
      "/pages/Auth/LoginPage.jsx": `import React, { useState } from "react";
import { cn } from "../../components/ui/utils";
import Button from "../../components/ui/Button";
import { Card, CardHeader, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
export function LoginPage() {
  const [email, setEmail] = useState("");
  return (
    <div className={cn("min-h-screen flex items-center justify-center")}>
      <Card><CardHeader>Login</CardHeader><CardContent>
        <Label>Email</Label>
        <Input value={email} onChange={e => setEmail(e.target.value)} />
        <Button>Sign In</Button>
      </CardContent></Card>
    </div>
  );
}`,
      "/pages/Auth/SignupPage.jsx": `import React from "react";
export function SignupPage() { return <div>Signup</div>; }`,
      "/pages/DashboardPage.jsx": `import React from "react";
import { Card, CardHeader, CardContent } from "../components/ui/Card";
export function DashboardPage() {
  return <div><Card><CardHeader>Dashboard</CardHeader><CardContent>Welcome</CardContent></Card></div>;
}`,
      "/pages/StudentsPage.jsx": `import React, { useState } from "react";
import { cn } from "../components/ui/utils";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../components/ui/Table";
import Button from "../components/ui/Button";
export const StudentsPage = () => {
  const [students] = useState([{ id: 1, name: "Alice", grade: "10th" }]);
  return (
    <div className={cn("p-6")}>
      <h1>Students</h1>
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Grade</TableHead></TableRow></TableHeader>
        <TableBody>{students.map(s => <TableRow key={s.id}><TableCell>{s.name}</TableCell><TableCell>{s.grade}</TableCell></TableRow>)}</TableBody>
      </Table>
      <Button>Add Student</Button>
    </div>
  );
}`,
      "/pages/FeesPage.jsx": `import React from "react";
import { Card } from "../components/ui/Card";
export const FeesPage = () => <div><Card>Fees Management</Card></div>;`,
      "/pages/AttendancePage.jsx": `import React from "react";
export default function AttendancePage() { return <div>Attendance</div>; }`,
    });
  }

  it("synthesized App.jsx should have valid imports for all pages", () => {
    const ws = buildSchoolErpWorkspace();

    // Step 1: Fix missing imports (Phase 3.8)
    fixMissingImports(ws);

    // Step 2: Fix export mismatches (Phase 3.95)
    fixExportMismatches(ws);

    // Step 3: Synthesize App.jsx (Phase 3.10)
    const appCode = synthesizeAppJsx(ws);
    ws.addFile("/App.jsx", appCode);

    // Step 4: Post-synthesis export mismatch fix (Phase 3.11)
    fixExportMismatches(ws);

    const finalApp = ws.getFile("/App.jsx")!;

    // Verify every page import is valid
    const pages = ["LoginPage", "SignupPage", "DashboardPage", "StudentsPage", "FeesPage", "AttendancePage"];
    for (const page of pages) {
      const usesDefault = new RegExp(`import\\s+${page}\\s+from\\s+["']`).test(finalApp);
      const usesNamed = new RegExp(`import\\s+\\{\\s*${page}\\s*\\}\\s+from\\s+["']`).test(finalApp);

      // Find the actual file
      const pageFile = ws.listFiles().find(f => f.includes(page));
      if (!pageFile) continue; // skip if not in workspace
      const content = ws.getFile(pageFile)!;
      const hasDefault = /export\s+default/.test(content);

      const valid = usesNamed || (usesDefault && hasDefault);
      expect(valid, `${page}: default import=${usesDefault}, named import=${usesNamed}, hasDefault=${hasDefault}`).toBe(true);
    }
  });

  it("utils.js should always export cn as a function", () => {
    const ws = buildSchoolErpWorkspace();
    const utils = ws.getFile("/components/ui/utils.js");
    expect(utils).toBeDefined();
    expect(utils).toContain("export function cn");
  });

  it("all UI component imports should resolve to files with matching exports", () => {
    const ws = buildSchoolErpWorkspace();
    fixExportMismatches(ws);

    const idx = ws.index;

    // Check every import in page files resolves
    for (const file of ws.listFiles()) {
      if (!file.startsWith("/pages/")) continue;
      const imports = idx.imports[file] || [];
      for (const imp of imports) {
        if (!imp.from.startsWith(".")) continue;
        const resolved = ws.resolveImport(file, imp.from);
        expect(resolved, `${file} imports from "${imp.from}" which doesn't resolve`).toBeTruthy();
        if (resolved) {
          expect(ws.hasFile(resolved), `${file} imports "${imp.from}" → ${resolved} but file doesn't exist`).toBe(true);
        }
      }
    }
  });

  it("Card, Button, Table components should be importable without errors", () => {
    const ui = getAllUIComponents();

    // Verify core components exist and have proper exports
    expect(ui["/components/ui/Card.jsx"]).toContain("export function Card");
    expect(ui["/components/ui/Button.jsx"]).toContain("export default");
    expect(ui["/components/ui/Table.jsx"]).toContain("export function Table");
    expect(ui["/components/ui/utils.js"]).toContain("export function cn");

    // Verify cn is actually a function definition, not a React component
    expect(ui["/components/ui/utils.js"]).not.toContain("React");
    expect(ui["/components/ui/utils.js"]).toMatch(/function cn\(/);
  });
});