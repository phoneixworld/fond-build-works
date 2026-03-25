// src/lib/layoutGenerator.ts

import type { IR } from "./ir";

/**
 * Generates AppLayout.tsx + Sidebar.tsx from IR.
 * Now uses PreloadingSidebar for predictive component/data preloading.
 */
export function generateLayoutFiles(ir: IR): Record<string, string> {
  return {
    "/layout/AppLayout.tsx": generateAppLayout(ir),
    "/layout/Sidebar.tsx": generateSidebar(ir),
  };
}

/* -------------------------------------------------------------------------- */
/*                               APP LAYOUT                                   */
/* -------------------------------------------------------------------------- */

function generateAppLayout(ir: IR): string {
  return `
import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function AppLayout({ navigation }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar navigation={navigation} />

      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
`.trim();
}

/* -------------------------------------------------------------------------- */
/*                      SIDEBAR WITH PRELOADING                               */
/* -------------------------------------------------------------------------- */

function generateSidebar(ir: IR): string {
  return `
import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";

export default function Sidebar({ navigation }) {
  const [open, setOpen] = useState(true);
  const location = useLocation();

  // Predictive preloading: preload component + data on hover
  const handlePreload = (path) => {
    try {
      // Dynamic import for the route wrapper — triggers bundle preload
      const pageName = path === "/" ? "Dashboard" : path.replace(/^\//, "").split("-")
        .map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("");
      import(\`../routes/\${pageName}Route\`).catch(() => {});
    } catch (e) {
      // no-op
    }
  };

  return (
    <aside
      className={\`
        bg-card border-r border-border
        flex flex-col
        h-full
        transition-all duration-300
        \${open ? "w-64" : "w-16"}
      \`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <span className="font-bold text-lg truncate">
          {open ? "Nimbus App" : "N"}
        </span>

        <button
          className="md:hidden p-2 rounded hover:bg-accent"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Navigation with predictive preloading */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {navigation.map((item) => {
          const active = location.pathname === item.path;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              onMouseEnter={() => handlePreload(item.path)}
              className={\`
                flex items-center gap-3 px-3 py-2 rounded-md
                text-sm font-medium transition-colors
                \${active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"}
              \`}
            >
              {item.icon && (
                <span className="w-5 h-5 flex items-center justify-center">
                  {React.createElement(require("lucide-react")[item.icon] || require("lucide-react").Circle)}
                </span>
              )}

              {open && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border text-xs text-muted-foreground">
        {open && "© Nimbus"}
      </div>
    </aside>
  );
}
`.trim();
}
