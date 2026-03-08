import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

const VoiceInput = ({ onTranscript, disabled }: VoiceInputProps) => {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef("");

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript + " ";
        } else {
          interim += transcript;
        }
      }
      if (final) finalTranscriptRef.current += final;
      setInterimText(interim);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      const result = (finalTranscriptRef.current + interimText).trim();
      if (result) {
        onTranscript(result);
      }
      finalTranscriptRef.current = "";
      setInterimText("");
    };

    recognitionRef.current = recognition;
  }, []);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      finalTranscriptRef.current = "";
      setInterimText("");
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [isListening]);

  if (!supported) return null;

  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={toggleListening}
            disabled={disabled}
            className={`relative transition-colors pb-0.5 ${
              isListening
                ? "text-destructive hover:text-destructive/80"
                : "text-muted-foreground hover:text-foreground"
            } disabled:opacity-50`}
          >
            <AnimatePresence mode="wait">
              {isListening ? (
                <motion.div
                  key="listening"
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0.8 }}
                >
                  <MicOff className="w-4 h-4" />
                  {/* Pulsing ring */}
                  <motion.div
                    className="absolute inset-0 -m-1.5 rounded-full border-2 border-destructive/50"
                    animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0.8 }}
                >
                  <Mic className="w-4 h-4" />
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {isListening ? "Stop recording" : "Voice input"}
        </TooltipContent>
      </Tooltip>

      {/* Live transcript preview */}
      <AnimatePresence>
        {isListening && (finalTranscriptRef.current || interimText) && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 bg-popover border border-border rounded-lg p-2 shadow-lg"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <motion.div
                className="w-2 h-2 rounded-full bg-destructive"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
              <span className="text-[10px] font-medium text-destructive">Listening...</span>
            </div>
            <p className="text-[11px] text-muted-foreground line-clamp-3">
              {finalTranscriptRef.current}
              <span className="text-foreground/50">{interimText}</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VoiceInput;
