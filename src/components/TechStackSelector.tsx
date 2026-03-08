import { TECH_STACKS, TechStackId } from "@/lib/techStacks";

interface TechStackSelectorProps {
  value: TechStackId;
  onChange: (id: TechStackId) => void;
  compact?: boolean;
}

const TechStackSelector = ({ value, onChange, compact }: TechStackSelectorProps) => {
  if (compact) {
    return (
      <div className="flex items-center gap-0.5">
        {TECH_STACKS.map((stack) => {
          const Icon = stack.icon;
          const isActive = value === stack.id;
          return (
            <button
              key={stack.id}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(stack.id); }}
              title={`Switch to ${stack.label}`}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="w-3 h-3" />
              <span className="hidden lg:inline">{stack.label.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {TECH_STACKS.map((stack) => {
        const Icon = stack.icon;
        const isActive = value === stack.id;
        return (
          <button
            key={stack.id}
            onClick={() => onChange(stack.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
              isActive
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
            }`}
          >
            <Icon className="w-4 h-4" />
            {stack.label}
          </button>
        );
      })}
    </div>
  );
};

export default TechStackSelector;
