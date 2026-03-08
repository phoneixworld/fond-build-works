import { useState, useEffect, useCallback } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Eye, Code, Cloud, Trash2, Pencil, Monitor, Tablet, Smartphone,
  Sparkles, Palette, LogOut, ArrowLeft, Download, Globe, RotateCcw
} from "lucide-react";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitchPanel: (panel: "preview" | "code" | "cloud") => void;
  onClearChat: () => void;
  onRenameProject: () => void;
  onGoBack: () => void;
  onSignOut: () => void;
  onExport: () => void;
  onPublish: () => void;
  projectName?: string;
}

const CommandPalette = ({
  open,
  onOpenChange,
  onSwitchPanel,
  onClearChat,
  onRenameProject,
  onGoBack,
  onSignOut,
  onExport,
  onPublish,
  projectName,
}: CommandPaletteProps) => {
  // Global keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Panels">
          <CommandItem onSelect={() => run(() => onSwitchPanel("preview"))}>
            <Eye className="mr-2 h-4 w-4" />
            Switch to Preview
          </CommandItem>
          <CommandItem onSelect={() => run(() => onSwitchPanel("code"))}>
            <Code className="mr-2 h-4 w-4" />
            Switch to Code
          </CommandItem>
          <CommandItem onSelect={() => run(() => onSwitchPanel("cloud"))}>
            <Cloud className="mr-2 h-4 w-4" />
            Switch to Cloud
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Project">
          <CommandItem onSelect={() => run(onRenameProject)}>
            <Pencil className="mr-2 h-4 w-4" />
            Rename project
          </CommandItem>
          <CommandItem onSelect={() => run(onPublish)}>
            <Globe className="mr-2 h-4 w-4" />
            Publish app
          </CommandItem>
          <CommandItem onSelect={() => run(onExport)}>
            <Download className="mr-2 h-4 w-4" />
            Export as ZIP
          </CommandItem>
          <CommandItem onSelect={() => run(onClearChat)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear conversation
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => run(onGoBack)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to projects
          </CommandItem>
          <CommandItem onSelect={() => run(onSignOut)}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};

export default CommandPalette;
