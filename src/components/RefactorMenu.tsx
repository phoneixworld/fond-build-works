import { useState } from "react";
import { Wrench, SplitSquareHorizontal, Pencil, FolderInput, Merge, Eraser, Sparkles, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface RefactorMenuProps {
  currentFile: string;
  onRefactorAction: (action: string, prompt: string) => void;
  disabled?: boolean;
}

const REFACTOR_ACTIONS = [
  {
    id: "extract-component",
    label: "Extract Component",
    icon: SplitSquareHorizontal,
    prompt: (file: string) => `Refactor: Extract reusable components from ${file}. Identify repeated UI patterns and extract them into separate component files.`,
  },
  {
    id: "rename",
    label: "Rename & Update Refs",
    icon: Pencil,
    prompt: (file: string) => `Refactor: Suggest better names for the component and its props in ${file}, then rename everything and update all references.`,
  },
  {
    id: "move-file",
    label: "Reorganize Files",
    icon: FolderInput,
    prompt: (file: string) => `Refactor: Analyze the project structure and suggest if ${file} should be moved to a better location. Move it and update all imports.`,
  },
  {
    id: "split-file",
    label: "Split File",
    icon: SplitSquareHorizontal,
    prompt: (file: string) => `Refactor: Split ${file} into smaller, more focused files. Each file should have a single responsibility.`,
  },
  {
    id: "merge-files",
    label: "Merge Related Files",
    icon: Merge,
    prompt: (file: string) => `Refactor: Find files closely related to ${file} that could be merged for simplicity. Merge them if it improves readability.`,
  },
  {
    id: "simplify",
    label: "Simplify Logic",
    icon: Sparkles,
    prompt: (file: string) => `Refactor: Simplify the logic in ${file}. Remove complexity, improve readability, use better patterns, and reduce nesting.`,
  },
  {
    id: "remove-dead",
    label: "Remove Dead Code",
    icon: Eraser,
    prompt: (file: string) => `Refactor: Find and remove all dead code, unused variables, unused imports, and unreachable code in ${file}.`,
  },
];

const RefactorMenu = ({ currentFile, onRefactorAction, disabled }: RefactorMenuProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          disabled={disabled}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-40"
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>Refactor</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[260px]">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Refactor: {currentFile || "No file selected"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {REFACTOR_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={action.id}
              disabled={!currentFile}
              onClick={() => onRefactorAction(action.id, action.prompt(currentFile))}
              className="text-xs gap-2.5 py-2"
            >
              <Icon className="w-3.5 h-3.5 text-primary/70" />
              {action.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default RefactorMenu;
