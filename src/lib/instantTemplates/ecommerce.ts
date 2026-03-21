import type { InstantTemplate } from "../instantTemplates";

export const ECOMMERCE: InstantTemplate = {
  id: "ecommerce",
  matchIds: ["ecommerce"],
  deps: { "lucide-react": "^0.400.0", "framer-motion": "^11.0.0" },
  files: {
    "/App.jsx": `import React, { useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ToastContainer from "./components/ui/Toast";

export const CartContext = React.createContext();

export default function App() {
  const [cart, setCart] = useState([]);
  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...product, qty: 1 }];
    });
  };
  const removeFromCart = (id) => setCart(prev => prev.filter(i => i.id !== id));
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, cartCount }}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </HashRouter>
      <ToastContainer />
    </CartContext.Provider>
  );
}`,

    "/pages/Home.jsx": `import React from "react";
import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import Categories from "../components/Categories";
import ProductGrid from "../components/ProductGrid";
import Features from "../components/Features";
import Newsletter from "../components/Newsletter";
import Footer from "../components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <Hero />
      <Categories />
      <ProductGrid />
      <Features />
      <Newsletter />
      <Footer />
    </div>
  );
}`,

    "/components/Navbar.jsx": `import React, { useContext, useState } from "react";
import { ShoppingBag, Search, Menu, X, Heart } from "lucide-react";
import { CartContext } from "../App";
import CartDrawer from "./CartDrawer";

export default function Navbar() {
  const { cartCount } = useContext(CartContext);
  const [cartOpen, setCartOpen] = useState(false);
  return (
    <>
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="#" className="text-xl font-bold tracking-tight text-gray-900">{{APP_NAME}}</a>
          <div className="hidden md:flex items-center gap-8">
            {["New In", "Women", "Men", "Accessories", "Sale"].map(l => (
              <a key={l} href="#" className="text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium">{l}</a>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 text-gray-500 hover:text-gray-900"><Search className="w-5 h-5" /></button>
            <button className="p-2 text-gray-500 hover:text-gray-900 hidden md:block"><Heart className="w-5 h-5" /></button>
            <button onClick={() => setCartOpen(true)} className="relative p-2 text-gray-500 hover:text-gray-900">
              <ShoppingBag className="w-5 h-5" />
              {cartCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-black text-white text-[10px] rounded-full flex items-center justify-center font-bold">{cartCount}</span>}
            </button>
          </div>
        </div>
      </nav>
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}`,

    "/components/CartDrawer.jsx": `import React, { useContext } from "react";
import { X, Plus, Minus, ShoppingBag } from "lucide-react";
import { CartContext } from "../App";

export default function CartDrawer({ open, onClose }) {
  const { cart, removeFromCart, addToCart } = useContext(CartContext);
  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">Your Cart ({cart.length})</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {cart.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Your cart is empty</p>
            </div>
          )}
          {cart.map(item => (
            <div key={item.id} className="flex gap-4 p-3 bg-gray-50 rounded-xl">
              <div className={"w-20 h-20 rounded-lg bg-gradient-to-br " + item.gradient} />
              <div className="flex-1">
                <p className="font-medium text-sm">{item.name}</p>
                <p className="text-sm text-gray-500">\${item.price}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-400">Qty: {item.qty}</span>
                  <button onClick={() => removeFromCart(item.id)} className="text-xs text-red-500 ml-auto">Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {cart.length > 0 && (
          <div className="p-6 border-t space-y-4">
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span><span>\${total.toFixed(2)}</span>
            </div>
            <button className="w-full py-3.5 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-colors">Checkout</button>
          </div>
        )}
      </div>
    </div>
  );
}`,

    "/components/Hero.jsx": `import React from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50">
      <div className="max-w-7xl mx-auto px-6 py-20 md:py-28">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
          <span className="inline-block px-4 py-1.5 bg-black text-white text-xs font-bold rounded-full mb-6 uppercase tracking-wider">New Season</span>
          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 leading-[1.1] tracking-tight mb-6">{{APP_DESC}}</h1>
          <p className="text-lg text-gray-600 mb-8 max-w-lg">Discover curated collections designed for the modern lifestyle. Free shipping on orders over $100.</p>
          <div className="flex gap-4">
            <button className="inline-flex items-center gap-2 px-8 py-4 bg-black text-white rounded-full font-medium hover:bg-gray-800 transition-all hover:-translate-y-0.5 shadow-lg">
              Shop Now <ArrowRight className="w-4 h-4" />
            </button>
            <button className="px-8 py-4 text-gray-700 font-medium hover:text-black transition-colors">View Lookbook</button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}`,

    "/components/Categories.jsx": `import React from "react";

const cats = [
  { name: "Tops", gradient: "from-pink-200 to-rose-300", count: 124 },
  { name: "Bottoms", gradient: "from-blue-200 to-indigo-300", count: 89 },
  { name: "Outerwear", gradient: "from-amber-200 to-orange-300", count: 56 },
  { name: "Accessories", gradient: "from-emerald-200 to-teal-300", count: 203 },
  { name: "Shoes", gradient: "from-violet-200 to-purple-300", count: 167 },
];

export default function Categories() {
  return (
    <section className="py-16 px-6">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-8">Shop by Category</h2>
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-hide">
          {cats.map(c => (
            <button key={c.name} className="flex-shrink-0 group cursor-pointer">
              <div className={"w-32 h-40 rounded-2xl bg-gradient-to-br " + c.gradient + " mb-3 group-hover:scale-105 transition-transform shadow-sm"} />
              <p className="text-sm font-semibold text-gray-900">{c.name}</p>
              <p className="text-xs text-gray-400">{c.count} items</p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}`,

    "/components/ProductGrid.jsx": `import React, { useContext, useState } from "react";
import { Heart, ShoppingBag, Star } from "lucide-react";
import { CartContext } from "../App";
import { showToast } from "./ui/Toast";

const products = [
  { id: 1, name: "Organic Cotton Tee", price: 48, rating: 4.8, reviews: 124, gradient: "from-sky-100 to-blue-200", tag: "Best Seller" },
  { id: 2, name: "Linen Relaxed Pants", price: 89, rating: 4.6, reviews: 87, gradient: "from-stone-100 to-stone-200", tag: null },
  { id: 3, name: "Merino Wool Cardigan", price: 128, rating: 4.9, reviews: 203, gradient: "from-amber-100 to-yellow-200", tag: "New" },
  { id: 4, name: "Canvas Weekend Bag", price: 156, rating: 4.7, reviews: 56, gradient: "from-emerald-100 to-teal-200", tag: null },
  { id: 5, name: "Silk Scarf", price: 68, oldPrice: 95, rating: 4.5, reviews: 142, gradient: "from-rose-100 to-pink-200", tag: "Sale" },
  { id: 6, name: "Leather Belt", price: 72, rating: 4.8, reviews: 98, gradient: "from-orange-100 to-amber-200", tag: null },
  { id: 7, name: "Cashmere Beanie", price: 64, rating: 4.4, reviews: 76, gradient: "from-violet-100 to-purple-200", tag: "New" },
  { id: 8, name: "Denim Jacket", price: 175, rating: 4.9, reviews: 312, gradient: "from-indigo-100 to-blue-200", tag: "Best Seller" },
];

export default function ProductGrid() {
  const { addToCart } = useContext(CartContext);
  const [liked, setLiked] = useState(new Set());
  const toggleLike = (id) => setLiked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <section className="py-16 px-6 bg-gray-50/50">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Featured Products</h2>
            <p className="text-gray-500 text-sm mt-1">Handpicked essentials for you</p>
          </div>
          <button className="text-sm font-medium text-gray-900 hover:underline">View All →</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {products.map(p => (
            <div key={p.id} className="group bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-xl transition-all duration-300">
              <div className="relative">
                <div className={"aspect-[3/4] bg-gradient-to-br " + p.gradient} />
                {p.tag && (
                  <span className={"absolute top-3 left-3 px-2.5 py-1 text-[10px] font-bold uppercase rounded-full " + (p.tag === "Sale" ? "bg-red-500 text-white" : p.tag === "New" ? "bg-black text-white" : "bg-amber-100 text-amber-800")}>
                    {p.tag}
                  </span>
                )}
                <button onClick={() => toggleLike(p.id)} className="absolute top-3 right-3 p-2 bg-white/80 backdrop-blur rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-white shadow-sm">
                  <Heart className={"w-4 h-4 " + (liked.has(p.id) ? "fill-red-500 text-red-500" : "text-gray-600")} />
                </button>
                <button onClick={() => { addToCart(p); showToast("Added to cart!"); }} className="absolute bottom-3 right-3 p-2.5 bg-black text-white rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-gray-800 shadow-lg">
                  <ShoppingBag className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4">
                <p className="text-sm font-medium text-gray-900 mb-1">{p.name}</p>
                <div className="flex items-center gap-1 mb-2">
                  <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                  <span className="text-xs text-gray-500">{p.rating} ({p.reviews})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">\${p.price}</span>
                  {p.oldPrice && <span className="text-sm text-gray-400 line-through">\${p.oldPrice}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}`,

    "/components/Features.jsx": `import React from "react";
import { Truck, RotateCcw, Shield, Headphones } from "lucide-react";

const features = [
  { icon: Truck, title: "Free Shipping", desc: "On orders over $100" },
  { icon: RotateCcw, title: "Easy Returns", desc: "30-day return policy" },
  { icon: Shield, title: "Secure Payment", desc: "256-bit SSL encryption" },
  { icon: Headphones, title: "24/7 Support", desc: "Always here to help" },
];

export default function Features() {
  return (
    <section className="py-16 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
        {features.map((f, i) => (
          <div key={i} className="text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <f.icon className="w-6 h-6 text-gray-700" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">{f.title}</h3>
            <p className="text-xs text-gray-500">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}`,

    "/components/Newsletter.jsx": `import React from "react";

export default function Newsletter() {
  return (
    <section className="py-20 px-6 bg-black text-white">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl font-bold mb-4">Stay in the loop</h2>
        <p className="text-gray-400 mb-8">Subscribe for exclusive offers and new arrivals.</p>
        <div className="flex gap-3 max-w-md mx-auto">
          <input type="email" placeholder="Your email" className="flex-1 px-5 py-3.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-gray-500 outline-none focus:border-white/40 text-sm" />
          <button className="px-6 py-3.5 bg-white text-black rounded-xl font-medium hover:bg-gray-100 transition-colors text-sm">Subscribe</button>
        </div>
      </div>
    </section>
  );
}`,

    "/components/Footer.jsx": `import React from "react";

const links = {
  Shop: ["New Arrivals", "Best Sellers", "Sale", "Gift Cards"],
  Help: ["FAQ", "Shipping", "Returns", "Size Guide"],
  Company: ["About", "Careers", "Press", "Sustainability"],
};

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 py-16 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <h3 className="font-bold text-gray-900 mb-4">{{APP_NAME}}</h3>
          <p className="text-sm text-gray-500">Curated collections for the modern lifestyle.</p>
        </div>
        {Object.entries(links).map(([title, items]) => (
          <div key={title}>
            <h4 className="font-semibold text-gray-900 text-sm mb-4">{title}</h4>
            <ul className="space-y-2.5">
              {items.map(l => <li key={l}><a href="#" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{l}</a></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-gray-100 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} {{APP_NAME}}. All rights reserved.
      </div>
    </footer>
  );
}`,

    "/components/ui/Toast.jsx": `import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
let toastHandler = null;
export function showToast(message, type = "success") { if (toastHandler) toastHandler({ message, type, id: Date.now() }); }
const ToastContext = createContext({ addToast: () => {} });
export function useToast() { return useContext(ToastContext); }
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((t) => { const toast = typeof t === "string" ? { message: t, type: "success", id: Date.now() } : { ...t, id: t.id || Date.now() }; setToasts(p => [...p, toast]); setTimeout(() => setToasts(p => p.filter(x => x.id !== toast.id)), 4000); }, []);
  useEffect(() => { toastHandler = (t) => addToast(t); return () => { toastHandler = null; }; }, [addToast]);
  return <ToastContext.Provider value={{ addToast }}>{children}<div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">{toasts.map(t => <div key={t.id} className={"px-4 py-3 rounded-lg text-white text-sm shadow-lg " + (t.type === "error" ? "bg-red-500" : "bg-emerald-500")}>{t.message}</div>)}</div></ToastContext.Provider>;
}
export default function ToastContainer() { return <ToastProvider>{null}</ToastProvider>; }`,

    "/styles/globals.css": `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;
@layer base {
  body { font-family: 'Inter', system-ui, sans-serif; @apply bg-white text-gray-900 antialiased; }
  html { scroll-behavior: smooth; }
}`,
  },
};
