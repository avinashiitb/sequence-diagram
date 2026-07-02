// Helper to parse trailing style brackets like [bg: #fff, border: #000, color: #000]
function parseStyleOptions(line) {
  const match = line.match(/\[(.*?)\]\s*$/);
  if (!match) return { cleanLine: line, styles: null };
  
  const cleanLine = line.replace(/\[(.*?)\]\s*$/, '').trim();
  const styleStr = match[1];
  const styles = {};
  
  const parts = styleStr.split(',');
  parts.forEach(part => {
    const kv = part.split(':');
    if (kv.length === 2) {
      const k = kv[0].trim().toLowerCase();
      const v = kv[1].trim();
      styles[k] = v;
    }
  });
  
  return { cleanLine, styles };
}

// Helper to determine the FontAwesome icon based on label and type
function getParticipantFAIcon(label, type) {
  if (type === 'actor') return '\uF007'; // fa-user
  if (type === 'database') return '\uF1C0'; // fa-database
  
  const text = (label || '').toLowerCase();
  if (text.includes('web') || text.includes('app') || text.includes('client') || text.includes('interface') || text.includes('browser')) {
    return '\uF109'; // fa-laptop
  }
  if (text.includes('api') || text.includes('svc') || text.includes('service') || text.includes('server') || text.includes('gateway')) {
    return '\uF233'; // fa-server
  }
  if (text.includes('pay') || text.includes('card') || text.includes('checkout') || text.includes('stripe')) {
    return '\uF09D'; // fa-credit-card
  }
  if (text.includes('db') || text.includes('database') || text.includes('sql') || text.includes('store') || text.includes('query')) {
    return '\uF1C0'; // fa-database
  }
  return '\uF1B2'; // fa-cube
}

/**
 * Pre-processes sequence diagram DSL code to:
 * 1. Convert simple JointJS arrows (->, -->) to standard Mermaid arrows (->>, -->>)
 * 2. Rewrite 'database' keywords to standard 'participant' definitions
 * 3. Extract bracket style overrides and compile them into CSS rules injected via themeCSS frontmatter.
 */
export function preprocessMermaidCode(code, isDark) {
  const lines = (code || '').split('\n');
  const processedLines = [];
  const cssRules = [];
  
  let participantCount = 0;
  let messageCount = 0;
  let noteCount = 0;

  const declRegex = /^(participant|actor|database)\s+(.+?)(?:\s+as\s+(.+))?$/i;
  const msgRegex = /^(.+?)\s*(-+>+)\s*(.+?)\s*:\s*(.+)$/;
  const actRegex = /^(activate|deactivate)\s+(.+)$/i;
  const noteRegex = /^note\s+(left of|right of|over)\s+(.+?)\s*:\s*(.+)$/i;

  lines.forEach(rawLine => {
    let line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) {
      return;
    }

    if (line.toLowerCase().replace(/\s/g, '') === 'sequencediagram') {
      return;
    }

    // Extract custom styles
    const { cleanLine, styles } = parseStyleOptions(line);
    let finalLine = cleanLine;

    // 1. Participant Declarations
    let match = finalLine.match(declRegex);
    if (match) {
      participantCount++;
      const type = match[1].toLowerCase();
      const alias = match[2].trim();
      const label = match[3] ? match[3].trim() : alias;

      const icon = getParticipantFAIcon(label, type);

      // Truncate label to keep a maximum box width
      const truncatedLabel = label.length > 18 ? label.substring(0, 15) + '...' : label;

      // Render actors as boxes (participants) as requested: "user should be also with box"
      finalLine = `participant ${alias} as ${icon} ${truncatedLabel}`;

      if (styles) {
        const bg = styles.fill || styles.bg || styles.bgcolor;
        const border = styles.stroke || styles.border || styles.bordercolor;
        const color = styles.color || styles.textColor || styles.textcolor;

        if (bg) {
          cssRules.push(`g.actor:nth-of-type(${participantCount}) rect.actor { fill: ${bg} !important; }`);
          cssRules.push(`g.actor:nth-of-type(${participantCount}) rect.actor-man { fill: ${bg} !important; }`);
        }
        if (border) {
          cssRules.push(`g.actor:nth-of-type(${participantCount}) rect.actor { stroke: ${border} !important; }`);
          cssRules.push(`g.actor:nth-of-type(${participantCount}) line.actor-line { stroke: ${border} !important; }`);
          cssRules.push(`g.actor:nth-of-type(${participantCount}) circle.actor-man { stroke: ${border} !important; }`);
          cssRules.push(`g.actor:nth-of-type(${participantCount}) path.actor-man { stroke: ${border} !important; }`);
        }
        if (color) {
          cssRules.push(`g.actor:nth-of-type(${participantCount}) text.actor { fill: ${color} !important; }`);
          cssRules.push(`g.actor:nth-of-type(${participantCount}) text.actor tspan { fill: ${color} !important; }`);
        }
      }
      processedLines.push(finalLine);
      return;
    }

    // 2. Activations
    match = finalLine.match(actRegex);
    if (match) {
      processedLines.push(finalLine);
      if (styles) {
        const bg = styles.fill || styles.bg || styles.bgcolor;
        const border = styles.stroke || styles.border || styles.bordercolor;
        if (bg) {
          cssRules.push(`rect.activation { fill: ${bg} !important; }`);
        }
        if (border) {
          cssRules.push(`rect.activation { stroke: ${border} !important; }`);
        }
      }
      return;
    }

    // 3. Notes
    match = finalLine.match(noteRegex);
    if (match) {
      noteCount++;
      const noteType = match[1];
      const target = match[2];
      let noteText = match[3];
      noteText = noteText.replace(/\\n/g, '<br/>').replace(/\n/g, '<br/>');
      finalLine = `note ${noteType} ${target}: ${noteText}`;
      processedLines.push(finalLine);
      if (styles) {
        const bg = styles.fill || styles.bg || styles.bgcolor;
        const border = styles.stroke || styles.border || styles.bordercolor;
        const color = styles.color || styles.textColor || styles.textcolor;

        if (bg) {
          cssRules.push(`g.note:nth-of-type(${noteCount}) rect { fill: ${bg} !important; }`);
        }
        if (border) {
          cssRules.push(`g.note:nth-of-type(${noteCount}) rect { stroke: ${border} !important; }`);
        }
        if (color) {
          cssRules.push(`g.note:nth-of-type(${noteCount}) text { fill: ${color} !important; }`);
        }
      }
      return;
    }

    // 4. Messages (Arrows)
    match = finalLine.match(msgRegex);
    if (match) {
      messageCount++;
      const from = match[1].trim();
      let arrow = match[2].trim();
      const to = match[3].trim();
      let text = match[4].trim();

      // Convert simple arrows: -> becomes ->>, --> becomes -->>
      const originalArrow = arrow;
      if (arrow === '->') arrow = '->>';
      else if (arrow === '-->') arrow = '-->>';

      text = text.replace(/\\n/g, '<br/>').replace(/\n/g, '<br/>');

      finalLine = `${from}${arrow}${to}: ${text}`;
      processedLines.push(finalLine);

      const index = messageCount - 1;
      const isDashed = originalArrow === '-->' || arrow === '-->>';
      
      const isAnimated = !(styles && (styles.animated === 'false' || styles.fixed === 'true' || styles.static === 'true'));
      
      // Inject moving line flow animations: dashed (fast, short dashes) vs solid (slower, longer dashes)
      if (isAnimated) {
        if (isDashed) {
          cssRules.push(`.messageLine${index} { stroke-dasharray: 3, 3 !important; animation: svgFlow 1.2s linear infinite !important; }`);
        } else {
          cssRules.push(`.messageLine${index} { stroke-dasharray: 4, 2 !important; animation: svgFlow 1.6s linear infinite !important; }`);
        }
      } else {
        if (isDashed) {
          cssRules.push(`.messageLine${index} { stroke-dasharray: 3, 3 !important; animation: none !important; }`);
        } else {
          cssRules.push(`.messageLine${index} { stroke-dasharray: none !important; animation: none !important; }`);
        }
      }

      if (styles) {
        const color = styles.stroke || styles.color || styles.linecolor;
        const labelColor = styles.labelcolor || styles.textcolor || styles.color;
        
        if (color) {
          cssRules.push(`.messageLine${index} { stroke: ${color} !important; }`);
          cssRules.push(`.arrowheadPath { fill: ${color} !important; stroke: ${color} !important; }`);
          cssRules.push(`marker[id*="arrowhead"] path { fill: ${color} !important; stroke: ${color} !important; }`);
        }
        if (labelColor) {
          cssRules.push(`text.messageText${index} { fill: ${labelColor} !important; }`);
        }
      }
      return;
    }

    // Fallback standard lines (alt, else, end, loop, etc.)
    processedLines.push(finalLine);
  });

  // Inject FontAwesome font-family onto actor text elements globally to render vector unicode glyphs
  cssRules.push(`g.actor text.actor { font-family: "Font Awesome 6 Free", "Outfit", "Inter", sans-serif !important; font-weight: 900 !important; }`);
  cssRules.push(`g.actor text.actor tspan { font-family: "Font Awesome 6 Free", "Outfit", "Inter", sans-serif !important; font-weight: 900 !important; }`);

  // Add the moving line keyframe animation (LCM of 6 and 9 is 18, so 72 ensures perfect loop synchronization)
  cssRules.push(`@keyframes svgFlow { from { stroke-dashoffset: 72; } to { stroke-dashoffset: 0; } }`);

  // Build Frontmatter with theme configurations and injected CSS rules
  const cssString = cssRules.join('\n');
  const themeValue = isDark ? 'dark' : 'default';
  
  const frontmatter = `%%{init: {
  "theme": "${themeValue}",
  "themeCSS": "${cssString.replace(/"/g, '\\"')}"
}}%%`;

  return `${frontmatter}\nsequenceDiagram\n${processedLines.join('\n')}`;
}
