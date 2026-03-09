import { useState, useRef, ReactNode } from "react";
import { Upload, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ImageUploadFieldProps {
  label: string;
  icon: ReactNode;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  previewSize?: string;
  projectId?: string;
  folder?: string;
  hint?: string;
}

const ImageUploadField = ({
  label,
  icon,
  value,
  onChange,
  placeholder = "https://...",
  previewSize = "w-6 h-6",
  projectId,
  folder = "assets",
  hint,
}: ImageUploadFieldProps) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${projectId}/${folder}/${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from("app-assets")
        .upload(path, file, { upsert: true });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from("app-assets")
        .getPublicUrl(path);

      onChange(urlData.publicUrl);
      toast({ title: "Uploaded!", description: `${label} image uploaded.` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </label>
      <div className="flex items-center gap-2">
        {value && (
          <div className="relative shrink-0">
            <img src={value} alt={label} className={`${previewSize} rounded object-cover border border-border`} />
            <button
              onClick={() => onChange("")}
              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
            >
              <X className="w-2 h-2" />
            </button>
          </div>
        )}
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary transition-shadow"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        </button>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
};

export default ImageUploadField;
