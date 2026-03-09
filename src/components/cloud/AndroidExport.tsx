import { useState } from "react";
import {
  Smartphone,
  Package,
  Image,
  Shield,
  Loader2,
  Download,
  CheckCircle2,
  Info,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useProjects } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";
import ImageUploadField from "@/components/publish/ImageUploadField";

interface AndroidConfig {
  appName: string;
  packageId: string;
  versionName: string;
  versionCode: number;
  iconUrl: string;
  splashUrl: string;
  splashBgColor: string;
  permissions: {
    camera: boolean;
    location: boolean;
    storage: boolean;
    notifications: boolean;
    microphone: boolean;
  };
  orientation: "portrait" | "landscape" | "any";
  statusBarColor: string;
  enableDeepLinks: boolean;
}

const DEFAULT_CONFIG: AndroidConfig = {
  appName: "",
  packageId: "com.phoenix.app",
  versionName: "1.0.0",
  versionCode: 1,
  iconUrl: "",
  splashUrl: "",
  splashBgColor: "#0a0a0b",
  permissions: {
    camera: false,
    location: false,
    storage: true,
    notifications: true,
    microphone: false,
  },
  orientation: "any",
  statusBarColor: "#6d28d9",
  enableDeepLinks: false,
};

const PERMISSION_LABELS: Record<string, { label: string; desc: string }> = {
  camera: { label: "Camera", desc: "Access device camera for photo/video capture" },
  location: { label: "Location", desc: "Access GPS for location-based features" },
  storage: { label: "Storage", desc: "Read/write files and handle uploads" },
  notifications: { label: "Push Notifications", desc: "Send push notifications to users" },
  microphone: { label: "Microphone", desc: "Access microphone for audio input" },
};

const STEPS = [
  { id: "config", label: "App Details", icon: Package },
  { id: "branding", label: "Branding", icon: Image },
  { id: "permissions", label: "Permissions", icon: Shield },
  { id: "generate", label: "Generate", icon: Sparkles },
] as const;

type StepId = (typeof STEPS)[number]["id"];

const AndroidExport = () => {
  const { currentProject } = useProjects();
  const { toast } = useToast();
  const [config, setConfig] = useState<AndroidConfig>({
    ...DEFAULT_CONFIG,
    appName: currentProject?.name || "My App",
    packageId: `com.phoenix.${(currentProject?.name || "app").replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}`,
  });
  const [currentStep, setCurrentStep] = useState<StepId>("config");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const updateConfig = <K extends keyof AndroidConfig>(key: K, value: AndroidConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const updatePermission = (key: string, value: boolean) => {
    setConfig((prev) => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: value },
    }));
  };

  const validateStep = (step: StepId): boolean => {
    switch (step) {
      case "config":
        if (!config.appName.trim()) {
          toast({ title: "App name required", variant: "destructive" });
          return false;
        }
        if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/i.test(config.packageId)) {
          toast({ title: "Invalid package ID", description: "Use format: com.company.appname", variant: "destructive" });
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const nextStep = () => {
    const stepIndex = STEPS.findIndex((s) => s.id === currentStep);
    if (!validateStep(currentStep)) return;
    if (stepIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[stepIndex + 1].id);
    }
  };

  const prevStep = () => {
    const stepIndex = STEPS.findIndex((s) => s.id === currentStep);
    if (stepIndex > 0) {
      setCurrentStep(STEPS[stepIndex - 1].id);
    }
  };

  const generateProject = async () => {
    if (!currentProject) return;
    setGenerating(true);

    try {
      const publishedUrl = currentProject.published_slug
        ? `https://fond-build-works.lovable.app`
        : null;

      if (!publishedUrl) {
        toast({
          title: "Publish first",
          description: "Your app must be published before generating an Android export.",
          variant: "destructive",
        });
        setGenerating(false);
        return;
      }

      // Generate the project zip via edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/android-export`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            config,
            publishedUrl,
            projectName: currentProject.name,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Generation failed");
      }

      // Download the zip
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${config.appName.replace(/\s+/g, "-").toLowerCase()}-android.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setGenerated(true);
      toast({ title: "Android project generated!", description: "Push to GitHub and the Actions workflow will build your APK." });
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case "config":
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">App Name</Label>
              <Input
                value={config.appName}
                onChange={(e) => updateConfig("appName", e.target.value)}
                placeholder="My Awesome App"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Package ID</Label>
              <Input
                value={config.packageId}
                onChange={(e) => updateConfig("packageId", e.target.value)}
                placeholder="com.company.appname"
                className="mt-1 font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Unique identifier for Google Play Store (e.g., com.mycompany.myapp)</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Version Name</Label>
                <Input
                  value={config.versionName}
                  onChange={(e) => updateConfig("versionName", e.target.value)}
                  placeholder="1.0.0"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Version Code</Label>
                <Input
                  type="number"
                  value={config.versionCode}
                  onChange={(e) => updateConfig("versionCode", parseInt(e.target.value) || 1)}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Orientation</Label>
              <div className="flex gap-2 mt-1">
                {(["portrait", "landscape", "any"] as const).map((o) => (
                  <Button
                    key={o}
                    size="sm"
                    variant={config.orientation === o ? "default" : "outline"}
                    onClick={() => updateConfig("orientation", o)}
                    className="text-xs capitalize flex-1"
                  >
                    {o}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        );

      case "branding":
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">App Icon (512×512 PNG recommended)</Label>
              <ImageUploadField
                value={config.iconUrl}
                onChange={(url) => updateConfig("iconUrl", url)}
                label="Upload Icon"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Splash Screen Image</Label>
              <ImageUploadField
                value={config.splashUrl}
                onChange={(url) => updateConfig("splashUrl", url)}
                label="Upload Splash"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Splash Background</Label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="color"
                    value={config.splashBgColor}
                    onChange={(e) => updateConfig("splashBgColor", e.target.value)}
                    className="w-8 h-8 rounded border border-border cursor-pointer"
                  />
                  <Input
                    value={config.splashBgColor}
                    onChange={(e) => updateConfig("splashBgColor", e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Status Bar Color</Label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="color"
                    value={config.statusBarColor}
                    onChange={(e) => updateConfig("statusBarColor", e.target.value)}
                    className="w-8 h-8 rounded border border-border cursor-pointer"
                  />
                  <Input
                    value={config.statusBarColor}
                    onChange={(e) => updateConfig("statusBarColor", e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case "permissions":
        return (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Toggle permissions your app needs. Only enabled permissions will be requested from users.</p>
            {Object.entries(PERMISSION_LABELS).map(([key, { label, desc }]) => (
              <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-[11px] text-muted-foreground">{desc}</p>
                </div>
                <Switch
                  checked={config.permissions[key as keyof typeof config.permissions]}
                  onCheckedChange={(v) => updatePermission(key, v)}
                />
              </div>
            ))}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
              <div>
                <p className="text-sm font-medium text-foreground">Deep Links</p>
                <p className="text-[11px] text-muted-foreground">Open your app from web URLs</p>
              </div>
              <Switch
                checked={config.enableDeepLinks}
                onCheckedChange={(v) => updateConfig("enableDeepLinks", v)}
              />
            </div>
          </div>
        );

      case "generate":
        return (
          <div className="space-y-4">
            {/* Summary */}
            <div className="rounded-lg bg-secondary/50 border border-border p-4 space-y-2">
              <p className="text-xs font-semibold text-foreground">Build Summary</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">App Name</span>
                <span className="text-foreground font-medium">{config.appName}</span>
                <span className="text-muted-foreground">Package ID</span>
                <span className="text-foreground font-mono text-[11px]">{config.packageId}</span>
                <span className="text-muted-foreground">Version</span>
                <span className="text-foreground">{config.versionName} ({config.versionCode})</span>
                <span className="text-muted-foreground">Orientation</span>
                <span className="text-foreground capitalize">{config.orientation}</span>
                <span className="text-muted-foreground">Permissions</span>
                <span className="text-foreground">
                  {Object.entries(config.permissions)
                    .filter(([, v]) => v)
                    .map(([k]) => PERMISSION_LABELS[k]?.label)
                    .join(", ") || "None"}
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">How it works:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Download the generated Android project zip</li>
                    <li>Push to a new GitHub repository</li>
                    <li>GitHub Actions will automatically build your APK</li>
                    <li>Download the signed APK from the Actions artifacts</li>
                  </ol>
                </div>
              </div>
            </div>

            <Button
              onClick={generateProject}
              disabled={generating}
              className="w-full"
              size="lg"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating Android project…
                </>
              ) : generated ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Download Again
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Generate & Download Project
                </>
              )}
            </Button>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border bg-ide-panel-header">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Android Export</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Generate a WebView Android app from your published web app.
        </p>
      </div>

      {/* Step indicators */}
      <div className="px-5 py-3 border-b border-border flex gap-1">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isActive = currentStep === step.id;
          const stepIndex = STEPS.findIndex((s) => s.id === currentStep);
          const isDone = i < stepIndex;
          return (
            <button
              key={step.id}
              onClick={() => setCurrentStep(step.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors flex-1 justify-center ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isDone
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="w-3 h-3" />
              <span className="hidden sm:inline">{step.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {renderStepContent()}
      </div>

      {/* Navigation */}
      {currentStep !== "generate" && (
        <div className="px-5 py-3 border-t border-border flex justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={prevStep}
            disabled={currentStep === "config"}
          >
            Back
          </Button>
          <Button size="sm" onClick={nextStep}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
};

export default AndroidExport;
