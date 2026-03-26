import { Toaster as SonnerToaster, toast } from "sonner";

/**
 * Lovable‑quality unified toaster component.
 * - No duplicate component names
 * - No Next.js-only hooks
 * - No shadowed exports
 * - Framework-agnostic
 */
export const Toaster = () => {
  return (
    <SonnerToaster
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
    />
  );
};

export { toast };
