import { Code2, Braces, FileCode, Palette, Box } from "lucide-react";

export const TECH_STACKS = [
  { id: "html-tailwind", label: "HTML + Tailwind", icon: Palette, description: "Modern utility-first CSS" },
  { id: "react-cdn", label: "React", icon: Braces, description: "Component-based UI via CDN" },
  { id: "vue-cdn", label: "Vue.js", icon: Box, description: "Progressive framework via CDN" },
  { id: "html-bootstrap", label: "Bootstrap", icon: FileCode, description: "Classic responsive framework" },
  { id: "vanilla-js", label: "Vanilla JS", icon: Code2, description: "Pure HTML/CSS/JS, no framework" },
] as const;

export type TechStackId = typeof TECH_STACKS[number]["id"];
