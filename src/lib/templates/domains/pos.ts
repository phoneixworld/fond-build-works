/**
 * POS (Point of Sale) Template
 */

import { registerTemplate, TEMPLATE_CSS } from "../templateRegistry";

const POS_APP = `import React, { useState } from "react";
import ProductGrid from "./components/ProductGrid";
import Cart from "./components/Cart";
import CategoryBar from "./components/CategoryBar";

export default function App() {
  const [cart, setCart] = useState([]);
  const [category, setCategory] = useState("All");

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id !== id) return item;
      const newQty = item.qty + delta;
      return newQty > 0 ? { ...item, qty: newQty } : item;
    }).filter(item => item.qty > 0));
  };

  const removeItem = (id) => setCart(prev => prev.filter(item => item.id !== id));
  const clearCart = () => setCart([]);

  return (
    <div className="h-screen flex overflow-hidden bg-[var(--color-bg-secondary)]">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 flex items-center justify-between px-6 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[var(--color-primary)] rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">P</span>
            </div>
            <span className="font-semibold">{{APP_NAME}}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <span>Cashier: Alex</span>
            <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
          </div>
        </div>
        <CategoryBar active={category} onChange={setCategory} />
        <ProductGrid category={category} onAdd={addToCart} />
      </div>
      <Cart items={cart} onUpdateQty={updateQty} onRemove={removeItem} onClear={clearCart} />
    </div>
  );
}`;

const CATEGORY_BAR = `import React from "react";

const categories = ["All", "Food", "Drinks", "Snacks", "Desserts", "Combos"];

export default function CategoryBar({ active, onChange }) {
  return (
    <div className="flex gap-2 px-6 py-3 bg-[var(--color-bg)] border-b border-[var(--color-border)] overflow-x-auto">
      {categories.map(cat => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={"px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap " +
            (active === cat
              ? "bg-[var(--color-primary)] text-white shadow-sm"
              : "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
            )}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}`;

const PRODUCT_GRID = `import React from "react";
import { Plus } from "lucide-react";

const products = [
  { id: 1, name: "Classic Burger", price: 8.99, category: "Food", emoji: "🍔" },
  { id: 2, name: "Caesar Salad", price: 7.49, category: "Food", emoji: "🥗" },
  { id: 3, name: "Margherita Pizza", price: 12.99, category: "Food", emoji: "🍕" },
  { id: 4, name: "Grilled Chicken", price: 11.49, category: "Food", emoji: "🍗" },
  { id: 5, name: "Iced Latte", price: 4.99, category: "Drinks", emoji: "☕" },
  { id: 6, name: "Fresh OJ", price: 3.99, category: "Drinks", emoji: "🍊" },
  { id: 7, name: "Smoothie", price: 5.99, category: "Drinks", emoji: "🥤" },
  { id: 8, name: "Sparkling Water", price: 2.49, category: "Drinks", emoji: "💧" },
  { id: 9, name: "Chips & Dip", price: 4.49, category: "Snacks", emoji: "🍿" },
  { id: 10, name: "Nachos", price: 6.99, category: "Snacks", emoji: "🌮" },
  { id: 11, name: "Chocolate Cake", price: 5.99, category: "Desserts", emoji: "🍰" },
  { id: 12, name: "Ice Cream", price: 3.99, category: "Desserts", emoji: "🍦" },
  { id: 13, name: "Burger + Fries", price: 11.99, category: "Combos", emoji: "🍟" },
  { id: 14, name: "Pizza + Drink", price: 14.99, category: "Combos", emoji: "🍕" },
  { id: 15, name: "Fish & Chips", price: 10.99, category: "Food", emoji: "🐟" },
  { id: 16, name: "Lemonade", price: 3.49, category: "Drinks", emoji: "🍋" },
];

export default function ProductGrid({ category, onAdd }) {
  const filtered = category === "All" ? products : products.filter(p => p.category === category);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map(product => (
          <button
            key={product.id}
            onClick={() => onAdd(product)}
            className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-4 text-left hover:border-[var(--color-primary)] hover:shadow-md transition-all group"
          >
            <div className="text-3xl mb-3">{product.emoji}</div>
            <p className="text-sm font-medium text-[var(--color-text)] mb-1">{product.name}</p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[var(--color-primary)]">\${product.price.toFixed(2)}</span>
              <span className="w-6 h-6 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Plus className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}`;

const CART = `import React from "react";
import { Minus, Plus, Trash2, X, CreditCard, Banknote, Smartphone } from "lucide-react";

export default function Cart({ items, onUpdateQty, onRemove, onClear }) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  return (
    <div className="w-80 bg-[var(--color-bg)] border-l border-[var(--color-border)] flex flex-col">
      <div className="h-14 flex items-center justify-between px-4 border-b border-[var(--color-border)]">
        <h2 className="font-semibold text-sm">Current Order</h2>
        {items.length > 0 && (
          <button onClick={onClear} className="text-xs text-[var(--color-danger)] hover:underline">Clear</button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)]">
            <span className="text-4xl mb-3">🛒</span>
            <p className="text-sm">No items yet</p>
            <p className="text-xs">Tap products to add</p>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="bg-[var(--color-bg-secondary)] rounded-lg p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">\${item.price.toFixed(2)} each</p>
                </div>
                <button onClick={() => onRemove(item.id)} className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-danger)]">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => onUpdateQty(item.id, -1)} className="w-7 h-7 rounded-lg border border-[var(--color-border)] flex items-center justify-center hover:bg-[var(--color-bg)]">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-sm font-semibold w-8 text-center">{item.qty}</span>
                  <button onClick={() => onUpdateQty(item.id, 1)} className="w-7 h-7 rounded-lg border border-[var(--color-border)] flex items-center justify-center hover:bg-[var(--color-bg)]">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <span className="text-sm font-semibold">\${(item.price * item.qty).toFixed(2)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {items.length > 0 && (
        <div className="border-t border-[var(--color-border)] p-4 space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-[var(--color-text-secondary)]">Subtotal</span><span>\${subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[var(--color-text-secondary)]">Tax (8%)</span><span>\${tax.toFixed(2)}</span></div>
            <div className="flex justify-between text-base font-bold border-t border-[var(--color-border)] pt-2"><span>Total</span><span>\${total.toFixed(2)}</span></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button className="flex flex-col items-center gap-1 p-2.5 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] transition-colors">
              <CreditCard className="w-4 h-4 text-[var(--color-text-secondary)]" />
              <span className="text-xs">Card</span>
            </button>
            <button className="flex flex-col items-center gap-1 p-2.5 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] transition-colors">
              <Banknote className="w-4 h-4 text-[var(--color-text-secondary)]" />
              <span className="text-xs">Cash</span>
            </button>
            <button className="flex flex-col items-center gap-1 p-2.5 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] transition-colors">
              <Smartphone className="w-4 h-4 text-[var(--color-text-secondary)]" />
              <span className="text-xs">Mobile</span>
            </button>
          </div>
          <button className="w-full py-2.5 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg hover:bg-[var(--color-primary-hover)] transition-colors">
            Pay \${total.toFixed(2)}
          </button>
        </div>
      )}
    </div>
  );
}`;

registerTemplate({
  id: "pos",
  name: "Point of Sale",
  category: "business",
  keywords: ["pos", "point of sale", "register", "cashier", "checkout", "retail", "restaurant", "cafe"],
  description: "Point of sale system with product grid, cart, and payment options",
  variables: ["APP_NAME"],
  deps: { "lucide-react": "^0.400.0" },
  files: {
    "/App.jsx": POS_APP,
    "/components/CategoryBar.jsx": CATEGORY_BAR,
    "/components/ProductGrid.jsx": PRODUCT_GRID,
    "/components/Cart.jsx": CART,
    "/styles.css": TEMPLATE_CSS,
  },
});
