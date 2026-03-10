import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { User, Settings, CreditCard, HelpCircle, ExternalLink, Mail, Shield, Bell, Palette, MessageCircle, BookOpen, Bug, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTier } from "@/hooks/useTier";
import PricingPage from "@/components/PricingPage";

type DialogType = "profile" | "settings" | "billing" | "help" | null;

interface UserMenuDialogsProps {
  open: DialogType;
  onOpenChange: (dialog: DialogType) => void;
}

const UserMenuDialogs = ({ open, onOpenChange }: UserMenuDialogsProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(user?.user_metadata?.display_name || "");

  const handleSaveProfile = () => {
    toast({ title: "Profile updated", description: "Your display name has been saved." });
    onOpenChange(null);
  };

  return (
    <>
      {/* Profile Dialog */}
      <Dialog open={open === "profile"} onOpenChange={(v) => onOpenChange(v ? "profile" : null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <User className="w-4 h-4 text-primary" />
              Profile
            </DialogTitle>
            <DialogDescription className="text-xs">Manage your account profile</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground text-lg font-bold">
                {(user?.email || "U").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium">{user?.user_metadata?.display_name || "User"}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="display-name" className="text-xs">Display Name</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Email</Label>
              <Input value={user?.email || ""} disabled className="h-9 text-sm bg-muted" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveProfile}>Save changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={open === "settings"} onOpenChange={(v) => onOpenChange(v ? "settings" : null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Settings className="w-4 h-4 text-primary" />
              Settings
            </DialogTitle>
            <DialogDescription className="text-xs">Application preferences</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {[
              { icon: Palette, label: "Theme", desc: "Dark mode is active", action: "System default" },
              { icon: Bell, label: "Notifications", desc: "Build alerts & team mentions", action: "Enabled" },
              { icon: Shield, label: "Security", desc: "Two-factor authentication", action: "Not set up" },
              { icon: Mail, label: "Email preferences", desc: "Weekly digest & updates", action: "Subscribed" },
            ].map(({ icon: Icon, label, desc, action }) => (
              <div key={label} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-secondary/30 transition-colors">
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-medium">{label}</p>
                    <p className="text-[10px] text-muted-foreground">{desc}</p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-[10px]">{action}</Badge>
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={() => { toast({ title: "Settings saved" }); onOpenChange(null); }}>
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Billing & Usage Dialog */}
      <Dialog open={open === "billing"} onOpenChange={(v) => onOpenChange(v ? "billing" : null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CreditCard className="w-4 h-4 text-primary" />
              Billing & Usage
            </DialogTitle>
            <DialogDescription className="text-xs">Your plan and resource usage</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">Pro Plan</span>
                </div>
                <Badge className="text-[10px]">Active</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">Unlimited projects · Priority builds · Custom domains</p>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">AI Credits</span>
                  <span className="font-medium">847 / 1,000</span>
                </div>
                <Progress value={84.7} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Storage</span>
                  <span className="font-medium">2.3 GB / 10 GB</span>
                </div>
                <Progress value={23} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Edge Function Invocations</span>
                  <span className="font-medium">12.4K / 100K</span>
                </div>
                <Progress value={12.4} className="h-2" />
              </div>
            </div>

            <Separator />
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground">Next billing date: April 9, 2026</p>
              <Button variant="outline" size="sm" className="text-xs gap-1">
                <ExternalLink className="w-3 h-3" />
                Manage plan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Help & Support Dialog */}
      <Dialog open={open === "help"} onOpenChange={(v) => onOpenChange(v ? "help" : null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <HelpCircle className="w-4 h-4 text-primary" />
              Help & Support
            </DialogTitle>
            <DialogDescription className="text-xs">Get help with Phoneix Builder</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            {[
              { icon: BookOpen, label: "Documentation", desc: "Guides, API reference & tutorials", href: "#" },
              { icon: MessageCircle, label: "Community", desc: "Join our Discord community", href: "#" },
              { icon: Bug, label: "Report a Bug", desc: "Found something broken? Let us know", href: "#" },
              { icon: Mail, label: "Contact Support", desc: "Email us at support@phoneix.world", href: "#" },
            ].map(({ icon: Icon, label, desc, href }) => (
              <button
                key={label}
                onClick={() => toast({ title: label, description: "Opening..." })}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-secondary/30 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-medium">{label}</p>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </div>
                <ExternalLink className="w-3 h-3 text-muted-foreground ml-auto shrink-0" />
              </button>
            ))}
          </div>

          <Separator className="my-2" />
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Phoneix Builder v2.0 · Made with ⚡</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UserMenuDialogs;
export type { DialogType };
