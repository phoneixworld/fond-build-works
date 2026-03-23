/**
 * StreamingMessageRenderer — Renders streaming AI text with a blinking cursor,
 * smooth token fade-in, and graceful code block handling.
 */
import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { MermaidDiagram } from "./MermaidDiagram";

interface StreamingMessageRendererProps {
  /** The accumulated text so far */
  text: string;
  /** Whether the stream is still active */
  isStreaming: boolean;
}

export default function StreamingMessageRenderer({ text, isStreaming }: StreamingMessageRendererProps) {
  const endRef = useRef<HTMLSpanElement>(null);
  const [showCursor, setShowCursor] = useState(true);

  // Blink cursor
  useEffect(() => {
    if (!isStreaming) { setShowCursor(false); return; }
    const id = setInterval(() => setShowCursor(v => !v), 530);
    return () => clearInterval(id);
  }, [isStreaming]);

  // Auto-scroll to cursor
  useEffect(() => {
    if (isStreaming && endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [text, isStreaming]);

  // Check if we're mid-code-block (unclosed ```)
  const backtickCount = (text.match(/```/g) || []).length;
  const inCodeBlock = backtickCount % 2 !== 0;

  // Close the code block temporarily for rendering if we're mid-block
  const renderText = inCodeBlock ? text + "\n```" : text;

  return (
    <div className="relative">
      <div
        className="text-sm text-foreground/90 leading-[1.8] prose prose-invert prose-sm max-w-none
          prose-p:my-2
          prose-headings:my-3 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground
          prose-ul:my-2 prose-ul:space-y-1 prose-li:my-0.5
          prose-code:font-[JetBrains_Mono] prose-code:text-primary prose-code:bg-primary/8 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs prose-code:font-medium
          prose-pre:bg-[hsl(var(--ide-panel))] prose-pre:rounded-xl prose-pre:p-4 prose-pre:border prose-pre:border-border/50 prose-pre:font-[JetBrains_Mono] prose-pre:text-xs prose-pre:leading-relaxed
          prose-strong:text-foreground prose-strong:font-semibold
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
          prose-blockquote:border-l-2 prose-blockquote:border-primary/30 prose-blockquote:pl-4 prose-blockquote:text-muted-foreground prose-blockquote:italic"
      >
        <ReactMarkdown
          components={{
            code(props) {
              const { children, className, node, ...rest } = props;
              const match = /language-(\w+)/.exec(className || '');
              if (match && match[1] === 'mermaid') {
                return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />;
              }
              return <code {...rest} className={className}>{children}</code>;
            }
          }}
        >
          {renderText}
        </ReactMarkdown>
      </div>

      {/* Blinking cursor */}
      {isStreaming && (
        <motion.span
          ref={endRef}
          animate={{ opacity: showCursor ? 1 : 0 }}
          transition={{ duration: 0.1 }}
          className="inline-block w-[2px] h-[1.1em] bg-primary ml-0.5 align-text-bottom rounded-full"
          aria-hidden
        />
      )}
    </div>
  );
}
