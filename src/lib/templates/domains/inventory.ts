/**
 * Inventory Management Template
 */

import { registerTemplate, TEMPLATE_CSS, generateSidebar, generateHeader, generateStatsCards, generateDataTable } from "./templateRegistry";

const INVENTORY_APP = `import React, { useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import StatsCards from "./components/StatsCards";
import ProductTable from "./components/ProductTable";
import CategoryBreakdown from "./components/CategoryBreakdown";

export default function App() {
  const [page, setPage] = useState("Dashboard");
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="h-screen flex overflow-hidden bg-[var(--color-bg-secondary)]">
      <Sidebar activePage={page} onNavigate={setPage} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={page} subtitle="Track stock levels and manage products" />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <StatsCards />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2"><ProductTable /></div>
            <CategoryBreakdown />
          </div>
        </main>
      </div>
    </div>
  );
}`;

const CATEGORY_BREAKDOWN = `import React from "react";
import { Package, AlertTriangle, TrendingUp, ArrowRight } from "lucide-react";

const categories = [
  { name: "Electronics", items: 234, value: "$45,200", stock: "high" },
  { name: "Clothing", items: 189, value: "$28,400", stock: "medium" },
  { name: "Food & Beverage", items: 156, value: "$12,800", stock: "low" },
  { name: "Office Supplies", items: 312, value: "$8,950", stock: "high" },
  { name: "Furniture", items: 67, value: "$34,100", stock: "medium" },
];

const stockColors = {
  high: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  medium: "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  low: "bg-[var(--color-danger-light)] text-[var(--color-danger)]",
};

const lowStockItems = [
  { name: "USB-C Cable 2m", sku: "EL-0892", stock: 3, min: 25 },
  { name: "A4 Paper Ream", sku: "OF-1204", stock: 8, min: 50 },
  { name: "Organic Coffee 1kg", sku: "FB-0445", stock: 5, min: 20 },
];

export default function CategoryBreakdown() {
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-5">
        <h3 className="font-semibold text-sm mb-4">Categories</h3>
        <div className="space-y-3">
          {categories.map(cat => (
            <div key={cat.name} className="flex items-center justify-between group cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-bg-secondary)] flex items-center justify-center">
                  <Package className="w-4 h-4 text-[var(--color-text-secondary)]" />
                </div>
                <div>
                  <p className="text-sm font-medium">{cat.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{cat.items} items · {cat.value}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + stockColors[cat.stock]}>{cat.stock}</span>
                <ArrowRight className="w-4 h-4 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-danger)]/20 p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-[var(--color-danger)]" />
          <h3 className="font-semibold text-sm">Low Stock Alerts</h3>
        </div>
        <div className="space-y-3">
          {lowStockItems.map(item => (
            <div key={item.sku} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{item.sku}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-[var(--color-danger)]">{item.stock} left</p>
                <p className="text-xs text-[var(--color-text-muted)]">Min: {item.min}</p>
              </div>
            </div>
          ))}
        </div>
        <button className="w-full mt-4 py-2 text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] rounded-lg transition-colors">
          Reorder All Low Stock →
        </button>
      </div>
    </div>
  );
}`;

registerTemplate({
  id: "inventory",
  name: "Inventory Management",
  category: "business",
  keywords: ["inventory", "stock", "warehouse", "product", "sku", "supply", "warehouse management"],
  description: "Product inventory tracking with stock levels, categories, and low-stock alerts",
  variables: ["APP_NAME"],
  deps: { "lucide-react": "^0.400.0" },
  files: {
    "/App.jsx": INVENTORY_APP,
    "/components/Sidebar.jsx": generateSidebar("{{APP_NAME}}", [
      { icon: "LayoutDashboard", label: "Dashboard" },
      { icon: "Package", label: "Products" },
      { icon: "Layers", label: "Categories" },
      { icon: "Truck", label: "Suppliers" },
      { icon: "ClipboardList", label: "Orders" },
      { icon: "BarChart3", label: "Reports" },
      { icon: "Settings", label: "Settings" },
    ]),
    "/components/Header.jsx": generateHeader(true),
    "/components/StatsCards.jsx": generateStatsCards([
      { label: "Total Products", value: "958", change: "+24", icon: "Package", trend: "up" },
      { label: "In Stock", value: "812", change: "+5.2%", icon: "CheckCircle", trend: "up" },
      { label: "Low Stock", value: "23", change: "+8", icon: "AlertTriangle", trend: "down" },
      { label: "Total Value", value: "$129,450", change: "+11.3%", icon: "DollarSign", trend: "up" },
    ]),
    "/components/ProductTable.jsx": generateDataTable("Products", [
      { key: "name", label: "Product", type: "text" },
      { key: "sku", label: "SKU", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "stock", label: "Stock", type: "text" },
      { key: "price", label: "Price", type: "currency" },
      { key: "status", label: "Status", type: "badge" },
    ], [
      { name: "Wireless Mouse", sku: "EL-0234", category: "Electronics", stock: "145", price: "$29.99", status: "Active" },
      { name: "Standing Desk", sku: "FN-0891", category: "Furniture", stock: "12", price: "$499.00", status: "Active" },
      { name: "USB-C Cable 2m", sku: "EL-0892", category: "Electronics", stock: "3", price: "$12.99", status: "Pending" },
      { name: "Ergonomic Chair", sku: "FN-0456", category: "Furniture", stock: "28", price: "$349.00", status: "Active" },
      { name: "A4 Paper Ream", sku: "OF-1204", category: "Office", stock: "8", price: "$7.50", status: "Pending" },
      { name: "Webcam HD 1080p", sku: "EL-1567", category: "Electronics", stock: "89", price: "$79.99", status: "Active" },
    ]),
    "/components/CategoryBreakdown.jsx": CATEGORY_BREAKDOWN,
    "/styles.css": TEMPLATE_CSS,
  },
});
