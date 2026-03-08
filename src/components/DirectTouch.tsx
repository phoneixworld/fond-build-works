import { useState, useCallback, useEffect } from "react";
import { Pencil, Type, Palette, X, Check, MousePointer2 } from "lucide-react";
import { usePreview } from "@/contexts/PreviewContext";
import { useProjects } from "@/contexts/ProjectContext";
import { motion, AnimatePresence } from "framer-motion";

interface SelectedElement {
  xpath: string;
  tagName: string;
  text: string;
  color: string;
  bgColor: string;
  fontSize: string;
  fontFamily: string;
}

const DirectTouch = ({ active, onToggle }: { active: boolean; onToggle: () => void }) => {
  const { previewHtml, setPreviewHtml } = usePreview();
  const { currentProject, saveProject } = useProjects();
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [editText, setEditText] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editBgColor, setEditBgColor] = useState("");

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "direct-touch-select") {
        setSelected(e.data.element);
        setEditText(e.data.element.text);
        setEditColor(e.data.element.color);
        setEditBgColor(e.data.element.bgColor);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const applyEdit = useCallback(() => {
    if (!selected || !previewHtml) return;
    const iframe = document.querySelector("iframe[title='Preview']") as HTMLIFrameElement;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({
        type: "direct-touch-apply",
        xpath: selected.xpath,
        text: editText,
        color: editColor,
        bgColor: editBgColor,
      }, "*");
    }
    // Listen for the updated HTML back
    const updateHandler = (e: MessageEvent) => {
      if (e.data?.type === "direct-touch-updated-html") {
        setPreviewHtml(e.data.html);
        if (currentProject) {
          saveProject({ html_content: e.data.html });
        }
        window.removeEventListener("message", updateHandler);
      }
    };
    window.addEventListener("message", updateHandler);
    setSelected(null);
  }, [selected, editText, editColor, editBgColor, previewHtml, setPreviewHtml, currentProject, saveProject]);

  const cancel = () => setSelected(null);

  return (
    <>
      {/* Toggle button in preview toolbar */}
      <button
        onClick={onToggle}
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all ${
          active
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
        }`}
        title="Direct Touch — click to edit elements"
      >
        <MousePointer2 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Edit</span>
      </button>

      {/* Edit panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-popover border border-border rounded-xl shadow-2xl p-4 w-[320px] space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Pencil className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">
                  Edit {selected.tagName.toLowerCase()}
                </span>
              </div>
              <button onClick={cancel} className="text-muted-foreground hover:text-foreground p-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Text edit */}
            {selected.text && (
              <div className="space-y-1">
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                  <Type className="w-3 h-3" /> Text
                </label>
                <textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  className="w-full bg-secondary text-foreground text-xs rounded-lg px-3 py-2 border border-border focus:border-primary outline-none resize-none"
                  rows={2}
                />
              </div>
            )}

            {/* Color edits */}
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                  <Palette className="w-3 h-3" /> Text Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editColor}
                    onChange={e => setEditColor(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border-0"
                  />
                  <input
                    value={editColor}
                    onChange={e => setEditColor(e.target.value)}
                    className="flex-1 bg-secondary text-foreground text-[11px] rounded px-2 py-1 border border-border"
                  />
                </div>
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[10px] text-muted-foreground font-medium">Background</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editBgColor}
                    onChange={e => setEditBgColor(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border-0"
                  />
                  <input
                    value={editBgColor}
                    onChange={e => setEditBgColor(e.target.value)}
                    className="flex-1 bg-secondary text-foreground text-[11px] rounded px-2 py-1 border border-border"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={cancel} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md hover:bg-secondary transition-colors">
                Cancel
              </button>
              <button onClick={applyEdit} className="flex items-center gap-1 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors">
                <Check className="w-3 h-3" /> Apply
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

/** Script injected into the preview iframe to enable Direct Touch */
export const DIRECT_TOUCH_SCRIPT = `
<script>
(function() {
  var dtActive = false;
  var overlay = null;
  var selectedEl = null;

  function getXPath(el) {
    if (!el || el === document.body) return '/html/body';
    var ix = 0;
    var siblings = el.parentNode ? el.parentNode.childNodes : [];
    for (var i = 0; i < siblings.length; i++) {
      var sib = siblings[i];
      if (sib === el) return getXPath(el.parentNode) + '/' + el.tagName.toLowerCase() + '[' + (ix + 1) + ']';
      if (sib.nodeType === 1 && sib.tagName === el.tagName) ix++;
    }
    return '';
  }

  function getElByXPath(xpath) {
    return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  }

  function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '#ffffff';
    var match = rgb.match(/\\d+/g);
    if (!match || match.length < 3) return '#000000';
    return '#' + match.slice(0,3).map(function(x) { return parseInt(x).toString(16).padStart(2,'0'); }).join('');
  }

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'direct-touch-toggle') {
      dtActive = e.data.active;
      document.body.style.cursor = dtActive ? 'crosshair' : '';
      if (!dtActive && overlay) { overlay.remove(); overlay = null; }
    }
    if (e.data && e.data.type === 'direct-touch-apply') {
      var el = getElByXPath(e.data.xpath);
      if (el) {
        if (e.data.text !== undefined && e.data.text !== el.textContent) el.textContent = e.data.text;
        if (e.data.color) el.style.color = e.data.color;
        if (e.data.bgColor) el.style.backgroundColor = e.data.bgColor;
        // Send updated HTML back
        window.parent.postMessage({ type: 'direct-touch-updated-html', html: document.documentElement.outerHTML }, '*');
      }
    }
  });

  document.addEventListener('click', function(e) {
    if (!dtActive) return;
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    if (el === overlay) return;
    selectedEl = el;
    var cs = window.getComputedStyle(el);
    window.parent.postMessage({
      type: 'direct-touch-select',
      element: {
        xpath: getXPath(el),
        tagName: el.tagName,
        text: el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 ? el.textContent : '',
        color: rgbToHex(cs.color),
        bgColor: rgbToHex(cs.backgroundColor),
        fontSize: cs.fontSize,
        fontFamily: cs.fontFamily,
      }
    }, '*');
  }, true);

  document.addEventListener('mouseover', function(e) {
    if (!dtActive) return;
    var el = e.target;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #6366f1;background:rgba(99,102,241,0.08);z-index:99999;transition:all 0.1s ease;border-radius:4px;';
      document.body.appendChild(overlay);
    }
    var rect = el.getBoundingClientRect();
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  });
})();
</script>`;

export default DirectTouch;
