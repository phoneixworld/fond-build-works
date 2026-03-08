import { Layout, ShoppingCart, FileText, BarChart3, MessageSquare, Users, Briefcase, Palette } from "lucide-react";

export interface Template {
  id: string;
  name: string;
  description: string;
  icon: typeof Layout;
  techStack: "html-tailwind" | "react-cdn" | "vue-cdn" | "html-bootstrap" | "vanilla-js";
  prompt: string;
  tags: string[];
}

export const TEMPLATES: Template[] = [
  {
    id: "saas-landing",
    name: "SaaS Landing Page",
    description: "Hero, features, pricing, testimonials & CTA",
    icon: Layout,
    techStack: "html-tailwind",
    prompt: "Build a modern SaaS landing page with: a sticky navbar with logo and CTA, a hero section with gradient background and email capture, a 3-column features grid with icons, a pricing table with 3 tiers (Free/Pro/Enterprise), a testimonials carousel, and a dark CTA footer. Use a professional blue/indigo color scheme.",
    tags: ["marketing", "startup"],
  },
  {
    id: "ecommerce",
    name: "E-Commerce Store",
    description: "Product grid, cart, filters & checkout",
    icon: ShoppingCart,
    techStack: "react-cdn",
    prompt: "Build a fully functional e-commerce store with: a navigation bar with cart icon and item count, a product grid showing 8+ products with images/prices/ratings, a sidebar with category filters and price range, an add-to-cart system with a slide-out cart drawer, and a simple checkout form. Use the Data API to persist products and cart items. Make it visually polished with hover effects.",
    tags: ["shop", "products"],
  },
  {
    id: "blog-cms",
    name: "Blog / CMS",
    description: "Article listing, editor & categories",
    icon: FileText,
    techStack: "react-cdn",
    prompt: "Build a blog/CMS with: a clean article listing page with featured post hero, category tags, a rich text editor for creating new posts (use contentEditable), article detail view with reading time and author info, and a sidebar with categories and popular posts. Use the Data API for persistence. Support creating, editing, and deleting posts.",
    tags: ["content", "writing"],
  },
  {
    id: "dashboard",
    name: "Analytics Dashboard",
    description: "Charts, KPIs, tables & sidebar nav",
    icon: BarChart3,
    techStack: "html-tailwind",
    prompt: "Build an analytics dashboard with: a dark sidebar with navigation links and user avatar, a top bar with search and notifications, 4 KPI metric cards (revenue, users, orders, conversion) with sparkline trends, a large area chart showing monthly data, a recent transactions table with status badges, and a donut chart for traffic sources. Use Chart.js from CDN for charts.",
    tags: ["data", "admin"],
  },
  {
    id: "chat-app",
    name: "Chat Application",
    description: "Conversations, messages & contacts list",
    icon: MessageSquare,
    techStack: "react-cdn",
    prompt: "Build a real-time chat application with: a left sidebar showing conversation list with avatars and last message preview, a main chat area with message bubbles (sent/received), a message input with emoji picker and attach button, online status indicators, and a user profile panel. Use the Data API and Auth API for persistence and user accounts.",
    tags: ["messaging", "social"],
  },
  {
    id: "portfolio",
    name: "Creative Portfolio",
    description: "Project gallery, about, contact & animations",
    icon: Palette,
    techStack: "html-tailwind",
    prompt: "Build a creative portfolio website with: a minimal navbar with name and menu links, a dramatic hero with large typography and a subtle animation, a masonry-style project gallery with hover overlays, an about section with photo and bio, a skills/tools grid, and a contact form. Use smooth scroll animations and a dark theme with accent color.",
    tags: ["creative", "personal"],
  },
  {
    id: "crm",
    name: "CRM Dashboard",
    description: "Contacts, deals pipeline & activity feed",
    icon: Users,
    techStack: "react-cdn",
    prompt: "Build a CRM dashboard with: a sidebar navigation, a contacts table with search/filter/sort, a kanban-style deals pipeline (Lead → Qualified → Proposal → Won), a contact detail view with activity timeline, and stats cards showing total revenue, active deals, and conversion rate. Use the Data API for persistence.",
    tags: ["business", "sales"],
  },
  {
    id: "project-mgmt",
    name: "Project Manager",
    description: "Kanban board, tasks, deadlines & team",
    icon: Briefcase,
    techStack: "react-cdn",
    prompt: "Build a project management tool with: a kanban board with drag-and-drop columns (To Do, In Progress, Review, Done), task cards with priority badges and assignee avatars, a task detail modal with description/checklist/due date, a list view toggle, and a team members sidebar. Use the Data API and Auth API for persistence and user accounts.",
    tags: ["productivity", "team"],
  },
];
