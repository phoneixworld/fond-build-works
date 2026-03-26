import { forwardRef } from "react";
import { GripVertical } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";
import { cn } from "@/lib/utils";

/**
 * PanelGroup wrapper with proper ref forwarding.
 */
const ResizablePanelGroup = forwardRef<
  React.ElementRef<typeof ResizablePrimitive.PanelGroup>,
  React.ComponentPropsWithoutRef<typeof ResizablePrimitive.PanelGroup>
>(({ className, ...props }, ref) => {
  return (
    <ResizablePrimitive.PanelGroup
      ref={ref}
      className={cn("flex h-full w-full data-[panel-group-direction=vertical]:flex-col", className)}
      {...props}
    />
  );
});
ResizablePanelGroup.displayName = "ResizablePanelGroup";

/**
 * Panel is already a forwardRef component from the library.
 */
const ResizablePanel = ResizablePrimitive.Panel;

/**
 * Resize handle wrapper with proper ref forwarding.
 */
const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean;
}) => {
  return (
    <ResizablePrimitive.PanelResizeHandle
      className={cn(
        "relative flex w-1 items-center justify-center bg-transparent " +
          "after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 " +
          "hover:bg-primary/30 active:bg-primary/50 transition-colors cursor-col-resize " +
          "data-[panel-group-direction=vertical]:h-1 data-[panel-group-direction=vertical]:w-full " +
          "data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 " +
          "data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 " +
          "data-[panel-group-direction=vertical]:after:translate-x-0 focus-visible:outline-none " +
          "focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 " +
          "[&[data-panel-group-direction=vertical]>div]:rotate-90",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
          <GripVertical className="h-2.5 w-2.5" />
        </div>
      )}
    </ResizablePrimitive.PanelResizeHandle>
  );
};

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
