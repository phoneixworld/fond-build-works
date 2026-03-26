/**
 * Invoice/Billing Management Template
 */

import { registerTemplate, TEMPLATE_CSS, generateSidebar, generateHeader, generateStatsCards, generateDataTable } from "../templateRegistry";

const INVOICE_APP = `import React, { useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import StatsCards from "./components/StatsCards";
import InvoiceTable from "./components/InvoiceTable";
import CreateInvoice from "./components/CreateInvoice";

export default function App() {
  const [page, setPage] = useState("Dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="h-screen flex overflow-hidden bg-[var(--color-bg-secondary)]">
      <Sidebar activePage={page} onNavigate={setPage} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={page} subtitle="Manage your invoices and payments" />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <StatsCards />
          <InvoiceTable onCreateNew={() => setShowCreate(true)} />
          {showCreate && <CreateInvoice onClose={() => setShowCreate(false)} />}
        </main>
      </div>
    </div>
  );
}`;

const CREATE_INVOICE = `import React, { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";

export default function CreateInvoice({ onClose }) {
  const [items, setItems] = useState([{ description: "", qty: 1, rate: 0 }]);

  const addItem = () => setItems([...items, { description: "", qty: 1, rate: 0 }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i, field, value) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: value };
    setItems(updated);
  };

  const subtotal = items.reduce((sum, item) => sum + item.qty * item.rate, 0);
  const tax = subtotal * 0.1;
  const total = subtotal + tax;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-bg)] rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold">Create Invoice</h2>
          <button onClick={onClose} className="p-1 hover:bg-[var(--color-bg-secondary)] rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Client Name</label>
              <input className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20" placeholder="Enter client name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Client Email</label>
              <input type="email" className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20" placeholder="email@company.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Invoice Date</label>
              <input type="date" className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Due Date</label>
              <input type="date" className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Line Items</h3>
              <button onClick={addItem} className="flex items-center gap-1 text-sm text-[var(--color-primary)] hover:underline">
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-center">
                  <input
                    value={item.description}
                    onChange={e => updateItem(i, "description", e.target.value)}
                    placeholder="Description"
                    className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                  />
                  <input
                    type="number"
                    value={item.qty}
                    onChange={e => updateItem(i, "qty", Number(e.target.value))}
                    className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-center focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                  />
                  <input
                    type="number"
                    value={item.rate}
                    onChange={e => updateItem(i, "rate", Number(e.target.value))}
                    className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-right focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                    placeholder="$0.00"
                  />
                  <button onClick={() => removeItem(i)} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-danger)]">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-[var(--color-text-secondary)]">Subtotal</span><span>${"$"}{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[var(--color-text-secondary)]">Tax (10%)</span><span>${"$"}{tax.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm font-semibold border-t border-[var(--color-border)] pt-2"><span>Total</span><span>${"$"}{total.toFixed(2)}</span></div>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-[var(--color-border)]">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]">Cancel</button>
          <button className="px-4 py-2 text-sm rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]">Create Invoice</button>
        </div>
      </div>
    </div>
  );
}`;

registerTemplate({
  id: "invoice",
  name: "Invoice & Billing",
  category: "business",
  keywords: ["invoice", "billing", "payment", "receipt", "accounting", "finance", "bill"],
  description: "Complete invoice management with creation, tracking, and payment status",
  variables: ["APP_NAME"],
  deps: { "lucide-react": "^0.400.0" },
  files: {
    "/App.jsx": INVOICE_APP,
    "/components/Sidebar.jsx": generateSidebar("{{APP_NAME}}", [
      { icon: "LayoutDashboard", label: "Dashboard" },
      { icon: "FileText", label: "Invoices" },
      { icon: "Users", label: "Clients" },
      { icon: "CreditCard", label: "Payments" },
      { icon: "BarChart3", label: "Reports" },
      { icon: "Settings", label: "Settings" },
    ]),
    "/components/Header.jsx": generateHeader(true),
    "/components/StatsCards.jsx": generateStatsCards([
      { label: "Total Revenue", value: "$48,250", change: "+12.5%", icon: "DollarSign", trend: "up" },
      { label: "Outstanding", value: "$8,420", change: "-3.2%", icon: "Clock", trend: "down" },
      { label: "Paid Invoices", value: "156", change: "+8.1%", icon: "CheckCircle", trend: "up" },
      { label: "Overdue", value: "7", change: "+2", icon: "AlertCircle", trend: "down" },
    ]),
    "/components/InvoiceTable.jsx": generateDataTable("Invoices", [
      { key: "invoice", label: "Invoice", type: "text" },
      { key: "client", label: "Client", type: "text" },
      { key: "amount", label: "Amount", type: "currency" },
      { key: "date", label: "Date", type: "text" },
      { key: "due", label: "Due Date", type: "text" },
      { key: "status", label: "Status", type: "badge" },
    ], [
      { invoice: "INV-001", client: "Acme Corp", amount: "$4,500.00", date: "Jan 15, 2025", due: "Feb 15, 2025", status: "Paid" },
      { invoice: "INV-002", client: "TechStart Inc", amount: "$2,800.00", date: "Jan 18, 2025", due: "Feb 18, 2025", status: "Pending" },
      { invoice: "INV-003", client: "Global Media", amount: "$6,200.00", date: "Jan 20, 2025", due: "Feb 5, 2025", status: "Overdue" },
      { invoice: "INV-004", client: "DataFlow LLC", amount: "$3,150.00", date: "Jan 22, 2025", due: "Feb 22, 2025", status: "Paid" },
      { invoice: "INV-005", client: "CloudNine SaaS", amount: "$1,900.00", date: "Jan 25, 2025", due: "Feb 25, 2025", status: "Draft" },
      { invoice: "INV-006", client: "PixelPerfect", amount: "$5,750.00", date: "Jan 28, 2025", due: "Feb 28, 2025", status: "In Progress" },
    ]),
    "/components/CreateInvoice.jsx": CREATE_INVOICE,
    "/styles.css": TEMPLATE_CSS,
  },
});
