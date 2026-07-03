import mermaid from 'mermaid';
import { preprocessMermaidCode } from './preprocessor';

// Helper to extract style options from a DSL string
function extractStylesFromDSL(code) {
  const lines = (code || '').split('\n');
  const participants = [];
  const notes = [];
  const messages = [];
  const activations = [];

  const declRegex = /^(participant|actor|database)\s+(.+?)(?:\s+as\s+(.+))?$/i;
  const msgRegex = /^(.+?)\s*(-+>+)\s*(.+?)\s*:\s*(.+)$/;
  const actRegex = /^(activate|deactivate)\s+(.+)$/i;
  const noteRegex = /^note\s+(left of|right of|over)\s+(.+?)\s*:\s*(.+)$/i;

  lines.forEach(rawLine => {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) return;
    if (line.toLowerCase().replace(/\s/g, '') === 'sequencediagram') return;

    // Parse and strip style brackets
    const bracketMatch = line.match(/\[(.*?)\]\s*$/);
    const styles = {};
    if (bracketMatch) {
      const styleStr = bracketMatch[1];
      styleStr.split(',').forEach(part => {
        const kv = part.split(':');
        if (kv.length === 2) {
          styles[kv[0].trim().toLowerCase()] = kv[1].trim();
        }
      });
    }

    const cleanLine = line.replace(/\[(.*?)\]\s*$/, '').trim();

    const declMatch = cleanLine.match(declRegex);
    if (declMatch) {
      const alias = declMatch[2].trim();
      const label = declMatch[3] ? declMatch[3].trim() : alias;
      const truncatedLabel = label.length > 18 ? label.substring(0, 15) + '...' : label;
      participants.push({ alias, label: truncatedLabel, styles: Object.keys(styles).length ? styles : null });
    } else if (cleanLine.match(actRegex)) {
      if (cleanLine.toLowerCase().startsWith('activate')) {
        activations.push({ styles: Object.keys(styles).length ? styles : null });
      }
    } else if (cleanLine.match(noteRegex)) {
      notes.push({ styles: Object.keys(styles).length ? styles : null });
    } else if (cleanLine.match(msgRegex)) {
      messages.push({ styles: Object.keys(styles).length ? styles : null });
    }
  });

  return { participants, notes, messages, activations };
}

/**
 * Renders the sequence diagram using Mermaid.js.
 */
export async function renderSequenceDiagram({ code, paperEl, theme }) {
  if (!code || !paperEl) return null;

  const isDark = theme === 'dark';

  // 1. Preprocess the code to translate custom bracket styling and arrows
  const preprocessedCode = preprocessMermaidCode(code, isDark);

  // 2. Initialize Mermaid with correct configuration
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'base',
    securityLevel: 'loose',
    fontFamily: 'Outfit, Inter, sans-serif',
    themeVariables: {
      fontFamily: 'Outfit, Inter, sans-serif',
      fontSize: '12px'
    }
  });

  // 3. Create a unique render ID
  const uniqueId = `mermaid-diagram-${Date.now()}`;

  // 4. Validate parse syntax using mermaid.parse
  try {
    await mermaid.parse(preprocessedCode);
  } catch (err) {
    throw new Error(err.message || 'Syntax error in Mermaid sequence diagram');
  }

  // 5. Render SVG
  const { svg } = await mermaid.render(uniqueId, preprocessedCode);

  // 6. Inject the SVG into the canvas element
  paperEl.innerHTML = svg;

  // 7. Configure SVG styles using native viewBox dimensions for accurate zooming
  const svgEl = paperEl.querySelector('svg');
  if (svgEl) {
    const viewBox = svgEl.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/\s+/).map(Number);
      if (parts.length === 4) {
        const [, , w, h] = parts;
        svgEl.style.width = `${w}px`;
        svgEl.style.height = `${h}px`;
        svgEl.style.maxWidth = 'none'; // Allow zooming beyond screen bounds
      }
    }
  }

  // 8. Apply custom colors and FontAwesome styling directly onto the rendered SVG DOM elements
  try {
    const metadata = extractStylesFromDSL(code);
    const textEls = Array.from(paperEl.querySelectorAll('text, tspan'));
    const lifelines = Array.from(paperEl.querySelectorAll('line.actor-line'));
    const numP = metadata.participants.length;

    // A. Style Participants (Headers and Footers matched by text content)
    metadata.participants.forEach((p, idx) => {
      const alias = p.alias;
      const label = p.label;

      // Look for text elements matching this alias or label
      const matches = textEls.filter(el => {
        const val = el.textContent.trim();
        // Strip FontAwesome glyph range (U+F000 to U+F8FF) or space
        const cleanVal = val.replace(/[\uF000-\uF8FF]/g, '').trim();
        return cleanVal === alias || (label && cleanVal === label);
      });

      const bg = p.styles?.fill || p.styles?.bg || p.styles?.bgcolor;
      const border = p.styles?.stroke || p.styles?.border || p.styles?.bordercolor;
      const color = p.styles?.color || p.styles?.textcolor || p.styles?.textColor;

      matches.forEach(textEl => {
        // Split the text node into two tspans: one for the FontAwesome icon, one for the text label
        const textContent = textEl.textContent.trim();
        const iconMatch = textContent.match(/^([\uF000-\uF8FF])\s*(.*)$/);
        
        if (iconMatch) {
          const icon = iconMatch[1];
          const labelText = iconMatch[2];
          
          textEl.innerHTML = '';
          
          // 1. Icon tspan
          const iconSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          iconSpan.textContent = icon;
          iconSpan.style.setProperty('font-family', '"Font Awesome 6 Free"', 'important');
          iconSpan.style.setProperty('font-weight', '900', 'important');
          if (color) {
            iconSpan.style.setProperty('fill', color, 'important');
          }
          
          // 2. Spacer tspan
          const spaceSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          spaceSpan.textContent = ' ';
          
          // 3. Label text tspan (uses standard font-weight to prevent overflow!)
          const labelSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          labelSpan.textContent = labelText;
          labelSpan.style.setProperty('font-family', '"Outfit", "Inter", sans-serif', 'important');
          labelSpan.style.setProperty('font-weight', '500', 'important');
          if (color) {
            labelSpan.style.setProperty('fill', color, 'important');
          }
          
          textEl.appendChild(iconSpan);
          textEl.appendChild(spaceSpan);
          textEl.appendChild(labelSpan);
        } else {
          // Standard styling fallback if no icon
          textEl.style.setProperty('font-family', '"Outfit", "Inter", sans-serif', 'important');
          textEl.style.setProperty('font-weight', '500', 'important');
          if (color) {
            textEl.style.setProperty('fill', color, 'important');
          }
        }

        // Find nearest parent <g> group representing this participant box
        const parentGroup = textEl.closest('g');
        if (parentGroup) {
          // Style all SVG rectangles/circles/paths inside this group
          const shapes = parentGroup.querySelectorAll('rect, circle, path');
          shapes.forEach(shape => {
            if (bg) shape.style.setProperty('fill', bg, 'important');
            if (border) shape.style.setProperty('stroke', border, 'important');
          });
        }
      });

      // Style corresponding descending lifeline line (Mermaid renders lifelines in reverse order)
      const lifelineIdx = numP - 1 - idx;
      if (lifelines[lifelineIdx] && border) {
        lifelines[lifelineIdx].style.setProperty('stroke', border, 'important');
      }
    });

    // B. Style Note Boxes (Sequential index matching)
    const noteGroups = Array.from(paperEl.querySelectorAll('g.note'));
    metadata.notes.forEach((note, idx) => {
      if (!note.styles || !noteGroups[idx]) return;
      
      const bg = note.styles.fill || note.styles.bg || note.styles.bgcolor;
      const border = note.styles.stroke || note.styles.border || note.styles.bordercolor;
      const color = note.styles.color || note.styles.textcolor || note.styles.textColor;

      const rect = noteGroups[idx].querySelector('rect');
      if (rect) {
        if (bg) rect.style.setProperty('fill', bg, 'important');
        if (border) rect.style.setProperty('stroke', border, 'important');
      }

      const texts = noteGroups[idx].querySelectorAll('text, tspan');
      texts.forEach(el => {
        if (color) el.style.setProperty('fill', color, 'important');
      });
    });

    // C. Style Messages & Arrows (Sequential index matching)
    metadata.messages.forEach((msg, idx) => {
      if (!msg.styles) return;

      const color = msg.styles.stroke || msg.styles.color || msg.styles.linecolor;
      const labelColor = msg.styles.labelcolor || msg.styles.textcolor || msg.styles.textColor || msg.styles.color;

      const path = paperEl.querySelector(`path.messageLine${idx}`);
      if (path && color) {
        path.style.setProperty('stroke', color, 'important');
      }

      const text = paperEl.querySelector(`text.messageText${idx}`);
      if (text && labelColor) {
        text.style.setProperty('fill', labelColor, 'important');
        text.querySelectorAll('tspan').forEach(ts => ts.style.setProperty('fill', labelColor, 'important'));
      }

      // Dynamic arrowhead markers
      const markers = Array.from(paperEl.querySelectorAll('marker'));
      markers.forEach(marker => {
        if (marker.id && marker.id.includes(`arrowhead-${idx}`)) {
          marker.querySelectorAll('path').forEach(p => {
            if (color) {
              p.style.setProperty('fill', color, 'important');
              p.style.setProperty('stroke', color, 'important');
            }
          });
        }
      });
    });

    // D. Style Activations (Sequential index matching)
    const activations = Array.from(paperEl.querySelectorAll('rect.activation'));
    metadata.activations.forEach((act, idx) => {
      if (!act.styles || !activations[idx]) return;

      const bg = act.styles.fill || act.styles.bg || act.styles.bgcolor;
      const border = act.styles.stroke || act.styles.border || act.styles.bordercolor;

      if (bg) activations[idx].style.setProperty('fill', bg, 'important');
      if (border) activations[idx].style.setProperty('stroke', border, 'important');
    });

    // E. Convert Curved Self-loops to Rectangular Paths with Rounded Corners
    const paths = Array.from(paperEl.querySelectorAll('path'));
    paths.forEach(path => {
      const d = path.getAttribute('d');
      if (!d) return;
      const match = d.match(/^M\s*([\d.-]+)[\s,]+([\d.-]+)\s*C\s*([\d.-]+)[\s,]+([\d.-]+)\s*([\d.-]+)[\s,]+([\d.-]+)\s*([\d.-]+)[\s,]+([\d.-]+)$/i);
      if (match) {
        const x1_f = parseFloat(match[1]);
        const y1_f = parseFloat(match[2]);
        const x_turn_f = parseFloat(match[3]);
        const x2_f = parseFloat(match[7]);
        const y2_f = parseFloat(match[8]);

        const height = Math.abs(y2_f - y1_f);
        const r = Math.min(6, height / 2); // Corner radius capped safely
        let newD = '';

        if (x_turn_f > x1_f) {
          // Loop to the right
          newD = `M ${x1_f},${y1_f} ` +
                 `L ${x_turn_f - r},${y1_f} ` +
                 `A ${r},${r} 0 0,1 ${x_turn_f},${y1_f + r} ` +
                 `L ${x_turn_f},${y2_f - r} ` +
                 `A ${r},${r} 0 0,1 ${x_turn_f - r},${y2_f} ` +
                 `L ${x2_f},${y2_f}`;
        } else {
          // Loop to the left
          newD = `M ${x1_f},${y1_f} ` +
                 `L ${x_turn_f + r},${y1_f} ` +
                 `A ${r},${r} 0 0,0 ${x_turn_f},${y1_f + r} ` +
                 `L ${x_turn_f},${y2_f - r} ` +
                 `A ${r},${r} 0 0,0 ${x_turn_f + r},${y2_f} ` +
                 `L ${x2_f},${y2_f}`;
        }
        path.setAttribute('d', newD);
      }
    });

  } catch (err) {
    console.warn('Post-render DOM styling warning:', err);
  }

  // Return helper references matching original paper signature for App.js compatibility
  return {
    paper: {
      scale: () => {},
      translate: () => {},
      remove: () => {
        paperEl.innerHTML = '';
      }
    }
  };
}
