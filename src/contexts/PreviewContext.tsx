import { createContext, useContext, useState, ReactNode } from "react";

interface PreviewContextType {
  previewHtml: string;
  setPreviewHtml: (html: string) => void;
  isBuilding: boolean;
  setIsBuilding: (building: boolean) => void;
  buildStep: string;
  setBuildStep: (step: string) => void;
}

const PreviewContext = createContext<PreviewContextType | null>(null);

export const PreviewProvider = ({ children }: { children: ReactNode }) => {
  const [previewHtml, setPreviewHtml] = useState("");
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildStep, setBuildStep] = useState("");

  return (
    <PreviewContext.Provider value={{ previewHtml, setPreviewHtml, isBuilding, setIsBuilding, buildStep, setBuildStep }}>
      {children}
    </PreviewContext.Provider>
  );
};

export const usePreview = () => {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error("usePreview must be used within PreviewProvider");
  return ctx;
};
