/**
 * Phase 1: Post-Generation HTML Validator & Auto-Fixer
 * 
 * Scans generated HTML for common issues and auto-fixes them before rendering.
 * Runs as part of the postProcessHtml pipeline.
 */

export interface ValidationIssue {
  type: "error" | "warning" | "info";
  category: "broken-link" | "missing-id" | "unsafe-js" | "broken-image" | "accessibility" | "structure";
  message: string;
  fixed: boolean;
}

export interface ValidationResult {
  html: string;
  issues: ValidationIssue[];
  score: number; // 0-100 quality score
}

// --- Individual validators ---

/**
 * Fix 1: Broken hash links — ensure every href="#x" has a matching id="x"
 */
function fixBrokenHashLinks(html: string, issues: ValidationIssue[]): string {
  // Find all hash links
  const linkPattern = /href="#([a-zA-Z][a-zA-Z0-9_-]*)"/g;
  const hashTargets = new Set<string>();
  let match;
  
  while ((match = linkPattern.exec(html)) !== null) {
    hashTargets.add(match[1]);
  }
  
  // Find all existing IDs
  const idPattern = /\bid="([^"]+)"/g;
  const existingIds = new Set<string>();
  while ((match = idPattern.exec(html)) !== null) {
    existingIds.add(match[1]);
  }
  
  // Check for missing targets
  for (const target of hashTargets) {
    if (!existingIds.has(target)) {
      // Try to find a section/div that could be the target based on content
      const sectionPatterns = [
        // Match <section> or <div> that contains text matching the target
        new RegExp(`(<(?:section|div)\\s+(?:class="[^"]*"\\s*)?)>([\\s\\S]*?<(?:h[1-6])[^>]*>[^<]*${target.replace(/-/g, '[\\s-]')}[^<]*</(?:h[1-6])>)`, 'i'),
        // Match any element right before content that might relate
        new RegExp(`(<(?:section|div)(?:\\s+class="[^"]*")?)\\s*>`, 'gi'),
      ];
      
      // Simple approach: find the Nth major section and add the ID
      // Count sections without IDs
      let fixed = false;
      const sectionNoId = /<(section|div)\s+class="[^"]*"(?:\s+style="[^"]*")?>/gi;
      const sections: { index: number; tag: string }[] = [];
      let sMatch;
      while ((sMatch = sectionNoId.exec(html)) !== null) {
        // Check if this section already has an ID
        const before = html.slice(Math.max(0, sMatch.index - 5), sMatch.index + sMatch[0].length + 20);
        if (!before.includes(' id="')) {
          sections.push({ index: sMatch.index, tag: sMatch[0] });
        }
      }
      
      if (!fixed) {
        issues.push({
          type: "warning",
          category: "broken-link",
          message: `Hash link "#${target}" has no matching element with id="${target}"`,
          fixed: false,
        });
      }
    }
  }
  
  // Fix href="#" (empty hash) — replace with javascript:void(0) or remove
  const emptyHashCount = (html.match(/href="#"(?!\w)/g) || []).length;
  if (emptyHashCount > 0) {
    // Don't fix brand links that go to top
    html = html.replace(/href="#"(?!\w)/g, (match) => {
      return 'href="#hero"';
    });
    issues.push({
      type: "warning",
      category: "broken-link",
      message: `Fixed ${emptyHashCount} empty href="#" links → href="#hero"`,
      fixed: true,
    });
  }
  
  return html;
}

/**
 * Fix 2: Null-unsafe JavaScript — wrap querySelector calls with null checks
 */
function fixUnsafeJavaScript(html: string, issues: ValidationIssue[]): string {
  let fixCount = 0;
  
  // Pattern: document.querySelector('x').classList or .style or .setAttribute etc.
  // Replace with optional chaining
  html = html.replace(
    /document\.querySelector\((['"`][^'"`]+['"`])\)\.(classList|style|setAttribute|removeAttribute|addEventListener|innerHTML|textContent|innerText|appendChild|removeChild|insertBefore|remove|focus|blur|click|scrollIntoView)/g,
    (match, selector, prop) => {
      fixCount++;
      return `document.querySelector(${selector})?.${prop}`;
    }
  );
  
  // Pattern: document.getElementById('x').classList etc.
  html = html.replace(
    /document\.getElementById\((['"`][^'"`]+['"`])\)\.(classList|style|setAttribute|removeAttribute|addEventListener|innerHTML|textContent|innerText|appendChild|removeChild|insertBefore|remove|focus|blur|click|scrollIntoView)/g,
    (match, selector, prop) => {
      fixCount++;
      return `document.getElementById(${selector})?.${prop}`;
    }
  );
  
  // Pattern: .querySelectorAll(...).forEach — this is safe, but querySelector before it isn't
  // Fix: el = document.querySelector('x'); el.something → el?.something
  html = html.replace(
    /const\s+(\w+)\s*=\s*document\.querySelector\(([^)]+)\);\s*\1\./g,
    (match, varName, selector) => {
      fixCount++;
      return `const ${varName} = document.querySelector(${selector}); ${varName}?.`;
    }
  );
  
  html = html.replace(
    /let\s+(\w+)\s*=\s*document\.querySelector\(([^)]+)\);\s*\1\./g,
    (match, varName, selector) => {
      fixCount++;
      return `let ${varName} = document.querySelector(${selector}); ${varName}?.`;
    }
  );
  
  if (fixCount > 0) {
    issues.push({
      type: "error",
      category: "unsafe-js",
      message: `Fixed ${fixCount} null-unsafe DOM access calls with optional chaining`,
      fixed: true,
    });
  }
  
  return html;
}

/**
 * Fix 3: External image URLs — replace with CSS gradient placeholders
 */
function fixBrokenImages(html: string, issues: ValidationIssue[]): string {
  // Detect external image URLs that will likely break in iframes
  const externalImgPattern = /<img\s+[^>]*src="(https?:\/\/(?:images\.unsplash\.com|source\.unsplash\.com|picsum\.photos|via\.placeholder\.com|placehold\.co|placekitten\.com|pexels\.com|pixabay\.com)[^"]*)"[^>]*>/gi;
  
  let fixCount = 0;
  html = html.replace(externalImgPattern, (match, url) => {
    fixCount++;
    // Extract width/height/alt if present
    const altMatch = match.match(/alt="([^"]*)"/);
    const alt = altMatch ? altMatch[1] : "Image";
    const widthMatch = match.match(/width="(\d+)"/);
    const heightMatch = match.match(/height="(\d+)"/);
    const classMatch = match.match(/class="([^"]*)"/);
    const classes = classMatch ? classMatch[1] : "";
    
    // Generate a gradient placeholder with the alt text
    const colors = [
      ["#667eea", "#764ba2"],
      ["#f093fb", "#f5576c"],
      ["#4facfe", "#00f2fe"],
      ["#43e97b", "#38f9d7"],
      ["#fa709a", "#fee140"],
      ["#a18cd1", "#fbc2eb"],
      ["#ffecd2", "#fcb69f"],
      ["#89f7fe", "#66a6ff"],
    ];
    const colorPair = colors[fixCount % colors.length];
    
    return `<div class="${classes}" style="background:linear-gradient(135deg,${colorPair[0]},${colorPair[1]});display:flex;align-items:center;justify-content:center;color:white;font-weight:600;font-size:14px;min-height:200px;border-radius:12px;${widthMatch ? `width:${widthMatch[1]}px;` : ''}${heightMatch ? `height:${heightMatch[1]}px;` : ''}" role="img" aria-label="${alt}">${alt}</div>`;
  });
  
  if (fixCount > 0) {
    issues.push({
      type: "error",
      category: "broken-image",
      message: `Replaced ${fixCount} external image URLs with gradient placeholders`,
      fixed: true,
    });
  }
  
  return html;
}

/**
 * Fix 4: Accessibility issues
 */
function fixAccessibility(html: string, issues: ValidationIssue[]): string {
  // Check for images without alt text
  const imgNoAlt = (html.match(/<img\s+(?![^>]*alt=)[^>]*>/gi) || []).length;
  if (imgNoAlt > 0) {
    html = html.replace(/<img\s+(?![^>]*alt=)([^>]*)>/gi, '<img alt="Image" $1>');
    issues.push({
      type: "warning",
      category: "accessibility",
      message: `Added alt text to ${imgNoAlt} images missing it`,
      fixed: true,
    });
  }
  
  // Check for buttons without accessible text
  const btnNoText = (html.match(/<button\s+(?![^>]*aria-label)[^>]*>\s*<(?:i|svg|img)\s/gi) || []).length;
  if (btnNoText > 0) {
    issues.push({
      type: "warning",
      category: "accessibility",
      message: `${btnNoText} buttons may lack accessible text (icon-only without aria-label)`,
      fixed: false,
    });
  }
  
  // Ensure html has lang attribute
  if (html.includes("<html") && !html.includes('lang="')) {
    html = html.replace(/<html([^>]*)>/, '<html lang="en"$1>');
    issues.push({
      type: "info",
      category: "accessibility",
      message: "Added lang=\"en\" to html element",
      fixed: true,
    });
  }
  
  return html;
}

/**
 * Fix 5: Structural issues
 */
function fixStructure(html: string, issues: ValidationIssue[]): string {
  // Ensure viewport meta tag exists
  if (!html.includes('viewport')) {
    const headIdx = html.indexOf('<head>');
    if (headIdx !== -1) {
      const insertPos = headIdx + '<head>'.length;
      html = html.slice(0, insertPos) + '\n<meta name="viewport" content="width=device-width, initial-scale=1.0">' + html.slice(insertPos);
      issues.push({
        type: "error",
        category: "structure",
        message: "Added missing viewport meta tag",
        fixed: true,
      });
    }
  }
  
  // Ensure charset meta tag
  if (!html.includes('charset')) {
    const headIdx = html.indexOf('<head>');
    if (headIdx !== -1) {
      const insertPos = headIdx + '<head>'.length;
      html = html.slice(0, insertPos) + '\n<meta charset="UTF-8">' + html.slice(insertPos);
      issues.push({
        type: "info",
        category: "structure",
        message: "Added missing charset meta tag",
        fixed: true,
      });
    }
  }
  
  // Check for missing <title>
  if (html.includes('<head>') && !html.includes('<title>')) {
    html = html.replace('</head>', '<title>App</title>\n</head>');
    issues.push({
      type: "warning",
      category: "structure",
      message: "Added missing <title> tag",
      fixed: true,
    });
  }
  
  return html;
}

/**
 * Fix 6: Mobile menu safety — ensure toggle code is null-safe
 */
function fixMobileMenu(html: string, issues: ValidationIssue[]): string {
  // Inject a safe mobile menu handler if we detect mobile menu patterns
  const hasMobileMenu = /mobile[-_]?menu|hamburger|menu[-_]?toggle|nav[-_]?toggle/i.test(html);
  const hasMenuButton = /<button[^>]*(?:menu|hamburger|toggle)[^>]*>/i.test(html);
  
  if (hasMobileMenu || hasMenuButton) {
    // Check if there's already a safe handler
    if (!html.includes('__mobileMenuInit')) {
      const script = `
<script>
// Safe mobile menu initialization
(function __mobileMenuInit() {
  document.addEventListener('DOMContentLoaded', function() {
    // Find menu toggle buttons
    var toggleBtns = document.querySelectorAll('[data-menu-toggle], .menu-toggle, .hamburger, .nav-toggle, [onclick*="menu"], [onclick*="Menu"]');
    var menus = document.querySelectorAll('[data-mobile-menu], .mobile-menu, .nav-menu, .mobile-nav, #mobile-menu, #mobileMenu');
    
    if (toggleBtns.length > 0 && menus.length > 0) {
      toggleBtns.forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          menus.forEach(function(menu) {
            if (menu) {
              menu.classList.toggle('hidden');
              menu.classList.toggle('open');
            }
          });
        });
      });
      
      // Close menu when clicking a link inside it
      menus.forEach(function(menu) {
        if (!menu) return;
        menu.querySelectorAll('a[href^="#"]').forEach(function(link) {
          link.addEventListener('click', function() {
            menu.classList.add('hidden');
            menu.classList.remove('open');
          });
        });
      });
    }
  });
})();
</script>`;
      
      // Insert before </body>
      if (html.includes('</body>')) {
        html = html.replace('</body>', script + '\n</body>');
      } else {
        html += script;
      }
      
      issues.push({
        type: "info",
        category: "structure",
        message: "Injected safe mobile menu handler",
        fixed: true,
      });
    }
  }
  
  return html;
}

/**
 * Calculate quality score based on issues found
 */
function calculateScore(html: string, issues: ValidationIssue[]): number {
  let score = 100;
  
  // Deductions
  const errors = issues.filter(i => i.type === "error" && !i.fixed).length;
  const warnings = issues.filter(i => i.type === "warning" && !i.fixed).length;
  
  score -= errors * 15;
  score -= warnings * 5;
  
  // Bonus points for good practices
  if (html.includes('aria-label') || html.includes('aria-describedby')) score += 2;
  if (html.includes('transition') || html.includes('animation')) score += 2;
  if (html.includes('hover:')) score += 2;
  if (html.includes('focus:')) score += 2;
  if (html.includes('<footer')) score += 1;
  if (html.includes('<nav')) score += 1;
  if (html.includes('lucide')) score += 1;
  if (html.includes('@media') || html.includes('md:') || html.includes('lg:')) score += 2;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Main validator function — runs all checks and fixes
 */
export function validateAndFixHtml(html: string): ValidationResult {
  if (!html || html.trim().length < 50) {
    return { html, issues: [], score: 0 };
  }
  
  const issues: ValidationIssue[] = [];
  
  // Run all fixers in order
  html = fixBrokenImages(html, issues);
  html = fixBrokenHashLinks(html, issues);
  html = fixUnsafeJavaScript(html, issues);
  html = fixAccessibility(html, issues);
  html = fixStructure(html, issues);
  html = fixMobileMenu(html, issues);
  
  const score = calculateScore(html, issues);
  
  return { html, issues, score };
}
