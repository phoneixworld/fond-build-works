import { describe, it, expect } from "vitest";
import { Workspace } from "@/lib/compiler/workspace";
import { synthesizeAppJsx } from "@/lib/compiler/appSynthesizer";
import { fixExportMismatches } from "@/lib/compiler/exportMismatchFixer";

function makeWorkspace(files: Record<string, string>) {
  return new Workspace(files);
}

describe("appSynthesizer + exportMismatchFixer integration", () => {
  it("should not produce undefined import when LoginPage has only named export", () => {
    const ws = makeWorkspace({
      "/contexts/AuthContext.jsx": `import React from "react";
export const AuthProvider = ({ children }) => <div>{children}</div>;
export const useAuth = () => ({ user: null });`,
      "/components/ProtectedRoute.jsx": `import React from "react";
export default function ProtectedRoute({ children }) { return <div>{children}</div>; }`,
      "/pages/Auth/LoginPage.jsx": `import React from "react";
export function LoginPage() { return <div>Login</div>; }`,
      "/pages/Auth/SignupPage.jsx": `import React from "react";
export function SignupPage() { return <div>Signup</div>; }`,
      "/pages/DashboardPage.jsx": `import React from "react";
export default function DashboardPage() { return <div>Dashboard</div>; }`,
    });

    const appCode = synthesizeAppJsx(ws);
    ws.addFile("/App.jsx", appCode);

    const fixes = fixExportMismatches(ws);

    const finalApp = ws.getFile("/App.jsx")!;
    const loginPageFile = ws.getFile("/pages/Auth/LoginPage.jsx")!;

    const usesDefaultImport = /import\s+LoginPage\s+from/.test(finalApp);
    const hasDefaultExport = /export\s+default/.test(loginPageFile);
    const usesNamedImport = /import\s+\{[^}]*LoginPage[^}]*\}\s+from/.test(finalApp);

    const isValid = usesNamedImport || (usesDefaultImport && hasDefaultExport);
    expect(isValid).toBe(true);
  });

  it("should handle LoginPage with default export correctly", () => {
    const ws = makeWorkspace({
      "/pages/Auth/LoginPage.jsx": `import React from "react";
export default function LoginPage() { return <div>Login</div>; }`,
      "/pages/DashboardPage.jsx": `import React from "react";
export default function DashboardPage() { return <div>Dashboard</div>; }`,
    });

    const appCode = synthesizeAppJsx(ws);
    ws.addFile("/App.jsx", appCode);

    expect(/import\s+LoginPage\s+from/.test(appCode)).toBe(true);
  });

  it("should produce valid imports even when all pages use named exports only", () => {
    const ws = makeWorkspace({
      "/contexts/AuthContext.jsx": `import React from "react";
export const AuthProvider = ({ children }) => <div>{children}</div>;
export const useAuth = () => ({ user: null });`,
      "/pages/StudentsPage.jsx": `import React from "react";
export const StudentsPage = () => <div>Students</div>;`,
      "/pages/FeesPage.jsx": `import React from "react";
export const FeesPage = () => <div>Fees</div>;`,
    });

    const appCode = synthesizeAppJsx(ws);
    ws.addFile("/App.jsx", appCode);
    const fixes = fixExportMismatches(ws);

    const finalApp = ws.getFile("/App.jsx")!;

    for (const page of ["StudentsPage", "FeesPage"]) {
      const usesDefault = new RegExp(`import\\s+${page}\\s+from`).test(finalApp);
      const usesNamed = new RegExp(`import\\s+\\{[^}]*${page}[^}]*\\}\\s+from`).test(finalApp);
      const fileContent = ws.getFile(`/pages/${page}.jsx`)!;
      const hasDefault = /export\s+default/.test(fileContent);

      const valid = usesNamed || (usesDefault && hasDefault);
      expect(valid).toBe(true);
    }
  });
});