import React, { useEffect, useState } from 'react';
import mermaid from 'mermaid';
import { useTheme } from 'next-themes';

export const MermaidDiagram = ({ chart }: { chart: string }) => {
  const [svg, setSvg] = useState<string>('');
  const { theme } = useTheme();

  useEffect(() => {
    let isMounted = true;
    
    const renderChart = async () => {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: theme === 'dark' ? 'dark' : 'default',
          securityLevel: 'loose',
          fontFamily: 'inherit',
        });
        
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg: renderedSvg } = await mermaid.render(id, chart);
        
        if (isMounted) {
          setSvg(renderedSvg);
        }
      } catch (error) {
        console.error('Mermaid rendering failed', error);
        if (isMounted) {
          setSvg(`<div class="text-destructive text-sm font-mono">Failed to render diagram</div>`);
        }
      }
    };

    if (chart) {
      renderChart();
    }

    return () => {
      isMounted = false;
    };
  }, [chart, theme]);

  if (!svg) {
    return (
      <div className="my-4 animate-pulse bg-muted/20 rounded-xl h-32 flex items-center justify-center border border-border/30">
        <span className="text-muted-foreground/50 text-xs">Rendering diagram...</span>
      </div>
    );
  }

  return (
    <div 
      className="my-4 w-full overflow-x-auto bg-card rounded-xl p-4 border border-border/50 flex justify-center mermaid-diagram-container"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};