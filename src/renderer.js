import { dia, shapes } from '@joint/core';

// Helper to determine the FontAwesome icon based on the participant name/type
function getParticipantFAIcon(label, type) {
  if (type === 'actor') return '\uf007'; // fa-user
  if (type === 'database') return '\uf1c0'; // fa-database
  
  const text = (label || '').toLowerCase();
  if (text.includes('web') || text.includes('app') || text.includes('client') || text.includes('interface') || text.includes('browser')) {
    return '\uf109'; // fa-laptop
  }
  if (text.includes('api') || text.includes('svc') || text.includes('service') || text.includes('server') || text.includes('gateway')) {
    return '\uf233'; // fa-server
  }
  if (text.includes('pay') || text.includes('card') || text.includes('checkout') || text.includes('stripe')) {
    return '\uf09d'; // fa-credit-card
  }
  if (text.includes('db') || text.includes('database') || text.includes('sql') || text.includes('store') || text.includes('query')) {
    return '\uf1c0'; // fa-database
  }
  return '\uf1b2'; // fa-cube
}

// Custom Shape: Participant (Rounded Rect with FontAwesome icon on left, centered text label)
const ParticipantShape = dia.Element.define('custom.Participant', {
  attrs: {
    body: {
      refWidth: '100%',
      refHeight: '100%',
      fill: '#eff6ff',
      stroke: '#3b82f6',
      strokeWidth: 1.5,
      rx: 6,
      ry: 6
    },
    icon: {
      text: '',
      fill: '#3b82f6',
      fontSize: 13,
      fontFamily: '"Font Awesome 6 Free"',
      fontWeight: '900',
      textVerticalAnchor: 'middle',
      textAnchor: 'middle',
      x: 16,
      refY: '50%'
    },
    label: {
      text: '',
      fill: '#1e40af',
      fontSize: 11,
      fontWeight: 'bold',
      fontFamily: 'Outfit, Inter, sans-serif',
      textVerticalAnchor: 'middle',
      textAnchor: 'middle',
      refX: '50%',
      x: 8, // slight offset to balance the icon on the left
      refY: '50%',
      textWrap: {
        width: 80,
        height: 38,
        ellipsis: true
      }
    }
  },
  markup: [
    { tagName: 'rect', selector: 'body' },
    { tagName: 'text', selector: 'icon' },
    { tagName: 'text', selector: 'label' }
  ]
});

/**
 * Renders the parsed Sequence Diagram AST to JointJS Paper.
 */
export function renderSequenceDiagram({ ast, paperEl, theme }) {
  if (!ast || !paperEl) return null;

  const isDark = theme === 'dark';

  // Colorful Palettes for Participants/Actors (Light and Dark)
  const lightColorsPalette = [
    { fill: '#eff6ff', stroke: '#3b82f6', text: '#1e40af' }, // Blue
    { fill: '#fcf7f2', stroke: '#f97316', text: '#9a3412' }, // Orange/Peach
    { fill: '#f0fdf4', stroke: '#22c55e', text: '#166534' }, // Green
    { fill: '#faf5ff', stroke: '#a855f7', text: '#6b21a8' }, // Purple
    { fill: '#fdf2f8', stroke: '#ec4899', text: '#9d174d' }, // Pink
    { fill: '#f0fdfa', stroke: '#14b8a6', text: '#0f766e' }  // Teal
  ];

  const darkColorsPalette = [
    { fill: '#172554', stroke: '#3b82f6', text: '#dbeafe' }, // Blue
    { fill: '#2c140a', stroke: '#f97316', text: '#ffedd5' }, // Orange
    { fill: '#052e16', stroke: '#22c55e', text: '#dcfce7' }, // Green
    { fill: '#240747', stroke: '#a855f7', text: '#faf5ff' }, // Purple
    { fill: '#31041a', stroke: '#ec4899', text: '#fce7f3' }, // Pink
    { fill: '#042f2e', stroke: '#14b8a6', text: '#ccfbf1' }  // Teal
  ];

  const colors = {
    bg: isDark ? '#090d16' : '#f8fafc',
    gridMain: isDark ? '#334155' : '#e2e8f0',
    gridSub: isDark ? '#1e293b' : '#f1f5f9',
    
    // Lifelines
    lifelineStroke: isDark ? '#475569' : '#cbd5e1',
    
    // Messages
    msgRequestStroke: isDark ? '#818cf8' : '#4f46e5',
    msgResponseStroke: isDark ? '#94a3b8' : '#64748b',
    msgText: isDark ? '#f8fafc' : '#1e293b',
    msgTextBg: isDark ? '#090d16' : '#ffffff',
    
    // Activation bars
    activationFill: isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(99, 102, 241, 0.15)',
    activationStroke: isDark ? '#818cf8' : '#4f46e5',
    
    // Notes
    noteFill: isDark ? '#854d0e' : '#fef9c3',
    noteStroke: isDark ? '#ca8a04' : '#eab308',
    noteText: isDark ? '#fef08a' : '#713f12',

    // Title
    titleText: isDark ? '#f8fafc' : '#0f172a'
  };

  // Create Graph and Paper
  const graph = new dia.Graph();
  
  const paperWidth = Math.max(800, window.innerWidth - 450); // initial size
  const paper = new dia.Paper({
    el: paperEl,
    model: graph,
    width: paperWidth,
    height: 600,
    gridSize: 10,
    drawGrid: {
      name: 'doubleMesh',
      args: [
        { color: colors.gridSub, thickness: 1 },
        { color: colors.gridMain, scaleFactor: 5, thickness: 1 }
      ]
    },
    background: { color: colors.bg },
    interactive: false,
    sorting: dia.Paper.sorting.APPROX
  });

  // Compute Layout (Pass 1)
  const boxHeight = 45;
  const noteWidth = 140;
  
  const numParticipants = ast.participants.length;
  // Compute horizontal spacing dynamically
  const spacing = Math.max(200, Math.min(280, (paperWidth - 160) / Math.max(1, numParticipants - 1)));
  const paddingLeft = 100;
  
  let startY = ast.title ? 80 : 50;
  let currentY = startY + boxHeight + 25; // first message Y

  const activeActivations = {}; // alias -> [{ startY, depth, styles }]
  const depthMap = {};         // alias -> current depth
  const completedActivations = []; // [{ alias, startY, endY, depth, styles }]
  const notesLayout = [];       // [{ placement, participant, text, y, height, styles }]
  const messagesLayout = [];    // [{ from, to, text, style, y, styles }]
  
  const altBlocks = []; // [{ startY, endY, condition, elseSegments: [{ y, condition }], styles }]
  const altStack = [];  // Stack for nesting alt boxes

  // Track coordinates of messages sent/received by participants to align activation bars exactly
  const lastReceivedMessageY = {}; // alias -> Y coordinate
  const lastSentMessageY = {};     // alias -> Y coordinate

  // Pre-calculate dynamic widths for each participant box
  ast.participants.forEach(p => {
    p.cellWidth = Math.max(80, Math.min(220, 35 + (p.label || '').length * 7.5 + 12));
    activeActivations[p.alias] = [];
    depthMap[p.alias] = 0;
  });

  ast.steps.forEach(step => {
    if (step.type === 'message') {
      currentY += 45;
      
      const isSelf = step.from === step.to;
      const cleanMsgText = step.text.replace(/\\n/g, ' ');

      messagesLayout.push({
        from: step.from,
        to: step.to,
        text: cleanMsgText,
        style: step.style,
        y: currentY,
        isSelf,
        styles: step.styles
      });

      // Record Y coordinates of the message
      lastReceivedMessageY[step.to] = currentY;
      lastSentMessageY[step.from] = currentY;

      if (isSelf) {
        currentY += 35; // Add extra vertical space for self loop
      }
    } else if (step.type === 'activate') {
      const depth = depthMap[step.participant] || 0;
      
      // Align activation start Y exactly with the Y coordinate of the incoming message
      const startActivationY = lastReceivedMessageY[step.participant] !== undefined
        ? lastReceivedMessageY[step.participant]
        : currentY;

      activeActivations[step.participant].push({ 
        startY: startActivationY, 
        depth,
        styles: step.styles
      });
      depthMap[step.participant] = depth + 1;
    } else if (step.type === 'deactivate') {
      const act = (activeActivations[step.participant] || []).pop();
      if (act) {
        // Align activation end Y exactly with the Y coordinate of the outgoing message
        const endActivationY = lastSentMessageY[step.participant] !== undefined
          ? lastSentMessageY[step.participant]
          : currentY;

        completedActivations.push({
          alias: step.participant,
          startY: act.startY,
          endY: endActivationY,
          depth: act.depth,
          styles: act.styles
        });
        depthMap[step.participant] = Math.max(0, (depthMap[step.participant] || 1) - 1);
      }
    } else if (step.type === 'note') {
      currentY += 10;
      
      const text = step.text.replace(/\\n/g, '\n');
      const lines = text.split('\n');
      let estimatedLines = 0;
      lines.forEach(line => {
        estimatedLines += Math.max(1, Math.ceil(line.length / 20));
      });
      const noteHeight = Math.max(45, estimatedLines * 16 + 18);
      
      notesLayout.push({
        placement: step.placement,
        participant: step.participant,
        text: text,
        y: currentY,
        height: noteHeight,
        styles: step.styles
      });
      
      currentY += noteHeight + 15;
    } else if (step.type === 'block_start') {
      currentY += 15;
      altStack.push({
        startY: currentY,
        condition: step.condition,
        elseSegments: [],
        styles: step.styles
      });
    } else if (step.type === 'block_else') {
      currentY += 15;
      const top = altStack[altStack.length - 1];
      if (top) {
        top.elseSegments.push({
          y: currentY,
          condition: step.condition
        });
      }
    } else if (step.type === 'block_end') {
      currentY += 15;
      const top = altStack.pop();
      if (top) {
        top.endY = currentY;
        altBlocks.push(top);
      }
    }
  });

  // Close open activations
  ast.participants.forEach(p => {
    while ((activeActivations[p.alias] || []).length > 0) {
      const act = activeActivations[p.alias].pop();
      completedActivations.push({
        alias: p.alias,
        startY: act.startY,
        endY: currentY + 25,
        depth: act.depth,
        styles: act.styles
      });
    }
  });

  // Close open alt boxes
  while (altStack.length > 0) {
    const top = altStack.pop();
    top.endY = currentY + 25;
    altBlocks.push(top);
  }

  const maxY = currentY + 50;

  // Drawing (Pass 2)

  // Draw Title
  if (ast.title) {
    const titleCell = new shapes.standard.Rectangle();
    titleCell.position(paddingLeft, 15);
    titleCell.resize(Math.max(600, numParticipants * spacing), 30);
    titleCell.attr({
      body: { fill: 'none', stroke: 'none' },
      label: {
        text: ast.title,
        fill: colors.titleText,
        fontSize: 20,
        fontWeight: '700',
        fontFamily: 'Outfit, Inter, sans-serif'
      }
    });
    titleCell.addTo(graph);
  }

  // Draw Lifelines and Header/Footer Boxes
  const participantPositions = {}; // alias -> { centerX, index }

  ast.participants.forEach((p, idx) => {
    const x = paddingLeft + idx * spacing;
    const cellWidth = p.cellWidth;
    const centerX = x + cellWidth / 2; // Center aligns element around the main lifeline column
    participantPositions[p.alias] = { centerX, index: idx };

    // 1. Vertical Lifeline Path (descends from bottom of shape to maxY)
    const lifeline = new shapes.standard.Path();
    lifeline.resize(1, maxY - startY - boxHeight);
    lifeline.position(centerX, startY + boxHeight);
    lifeline.attr({
      body: {
        d: `M 0 0 L 0 ${maxY - startY - boxHeight}`,
        stroke: colors.lifelineStroke,
        strokeWidth: 2,
        strokeDasharray: '6,6'
      }
    });
    lifeline.addTo(graph);
    lifeline.toBack();

    // 2. Create Header Box
    const colorIndex = idx % lightColorsPalette.length;
    const pColor = isDark ? darkColorsPalette[colorIndex] : lightColorsPalette[colorIndex];
    
    const headerEl = new ParticipantShape();
    headerEl.position(centerX - cellWidth / 2, startY);
    headerEl.resize(cellWidth, boxHeight);
    
    // Check for custom overrides in DSL
    const customBg = p.styles?.fill || p.styles?.bg || p.styles?.background || p.styles?.bgcolor;
    const customBorder = p.styles?.stroke || p.styles?.border || p.styles?.bordercolor;
    const customText = p.styles?.color || p.styles?.textcolor || p.styles?.textColor || p.styles?.text;

    const iconCode = getParticipantFAIcon(p.label, p.type);
    headerEl.attr({
      body: {
        fill: customBg || pColor.fill,
        stroke: customBorder || pColor.stroke,
        strokeWidth: 1.5
      },
      icon: {
        text: iconCode,
        fill: customBorder || pColor.stroke
      },
      label: {
        text: p.label,
        fill: customText || pColor.text,
        textWrap: {
          width: cellWidth - 36, // subtract left icon padding for proper wrapping center align
          height: 38,
          ellipsis: true
        }
      }
    });
    headerEl.addTo(graph);

    // 3. Footer Box
    if (maxY - startY > 300) {
      const footerEl = headerEl.clone();
      footerEl.position(centerX - cellWidth / 2, maxY);
      footerEl.addTo(graph);
    }
  });

  // Draw Alt Boxes
  altBlocks.forEach(block => {
    const leftX = paddingLeft - 30;
    const rightX = paddingLeft + (numParticipants - 1) * spacing + 30;
    const width = rightX - leftX;
    const height = Math.max(20, block.endY - block.startY);

    // Check for custom border/fill styles for the alt box
    const customBg = block.styles?.fill || block.styles?.bg || block.styles?.bgcolor;
    const customBorder = block.styles?.stroke || block.styles?.border || block.styles?.bordercolor;

    // 1. Draw outer boundary box
    const outerBox = new shapes.standard.Rectangle();
    outerBox.position(leftX, block.startY);
    outerBox.resize(width, height);
    outerBox.attr({
      body: {
        fill: customBg || 'none',
        stroke: customBorder || (isDark ? '#818cf8' : '#6366f1'),
        strokeWidth: 1.5,
        rx: 4,
        ry: 4
      }
    });
    outerBox.addTo(graph);
    outerBox.toBack();

    // 2. Draw the Tab Shape at top-left
    const tabWidth = 35;
    const tabHeight = 18;
    const tabPath = new shapes.standard.Path();
    tabPath.position(leftX, block.startY);
    tabPath.resize(tabWidth, tabHeight);
    tabPath.attr({
      body: {
        d: "M 0 0 L 35 0 L 30 18 L 0 18 Z",
        fill: isDark ? '#312e81' : '#e0e7ff',
        stroke: customBorder || (isDark ? '#818cf8' : '#6366f1'),
        strokeWidth: 1.5
      },
      label: {
        text: 'alt',
        fill: isDark ? '#a5b4fc' : '#4f46e5',
        fontSize: 9,
        fontWeight: 'bold',
        fontFamily: 'Inter, sans-serif',
        ref: 'body', // reference the body path element to align properly inside scaled bounds
        refX: '45%',
        refY: '50%',
        textAnchor: 'middle',
        textVerticalAnchor: 'middle'
      }
    });
    tabPath.addTo(graph);

    // 3. Draw Condition text (next to the tab)
    const condText = new shapes.standard.Rectangle();
    condText.position(leftX + tabWidth + 10, block.startY + 2);
    condText.resize(width - tabWidth - 20, tabHeight);
    condText.attr({
      body: { fill: 'none', stroke: 'none' },
      label: {
        text: block.condition,
        fill: isDark ? '#94a3b8' : '#475569',
        fontSize: 11,
        fontFamily: 'Inter, sans-serif',
        textAnchor: 'left',
        textVerticalAnchor: 'middle',
        refX: 0,
        refY: '50%'
      }
    });
    condText.addTo(graph);

    // 4. Draw else segments (divider lines + labels)
    block.elseSegments.forEach(seg => {
      // Dashed separator line
      const sep = new shapes.standard.Link();
      sep.source({ x: leftX, y: seg.y });
      sep.target({ x: rightX, y: seg.y });
      sep.attr({
        line: {
          stroke: customBorder || (isDark ? '#818cf8' : '#6366f1'),
          strokeWidth: 1.5,
          strokeDasharray: '4,4',
          targetMarker: 'none'
        }
      });
      sep.addTo(graph);

      // Else condition text (just below the separator line)
      if (seg.condition) {
        const elseText = new shapes.standard.Rectangle();
        elseText.position(leftX + 10, seg.y + 4);
        elseText.resize(width - 20, 20);
        elseText.attr({
          body: { fill: 'none', stroke: 'none' },
          label: {
            text: seg.condition,
            fill: isDark ? '#94a3b8' : '#475569',
            fontSize: 11,
            fontFamily: 'Inter, sans-serif',
            textAnchor: 'left',
            textVerticalAnchor: 'top',
            refX: 0,
            refY: 0
          }
        });
        elseText.addTo(graph);
      }
    });
  });

  // Draw Activation Bars
  completedActivations.forEach(act => {
    const pos = participantPositions[act.alias];
    if (!pos) return;

    // Check for custom fill/stroke on activations
    const customBg = act.styles?.fill || act.styles?.bg || act.styles?.bgcolor;
    const customBorder = act.styles?.stroke || act.styles?.border || act.styles?.bordercolor;

    const width = 10;
    const height = Math.max(10, act.endY - act.startY);
    const barX = pos.centerX - width / 2 + act.depth * 6;

    const bar = new shapes.standard.Rectangle();
    bar.position(barX, act.startY);
    bar.resize(width, height);
    bar.attr({
      body: {
        fill: customBg || colors.activationFill,
        stroke: customBorder || colors.activationStroke,
        strokeWidth: 1.5,
        rx: 2,
        ry: 2
      }
    });
    bar.addTo(graph);
  });

  // Draw Notes
  notesLayout.forEach(note => {
    const pos = participantPositions[note.participant];
    if (!pos) return;

    // Check for custom note styling
    const customBg = note.styles?.fill || note.styles?.bg || note.styles?.bgcolor;
    const customBorder = note.styles?.stroke || note.styles?.border || note.styles?.bordercolor;
    const customText = note.styles?.color || note.styles?.textcolor || note.styles?.textColor || note.styles?.text;

    let noteX = pos.centerX;
    if (note.placement === 'left') {
      noteX = pos.centerX - noteWidth - 20;
    } else if (note.placement === 'right') {
      noteX = pos.centerX + 20;
    } else { // 'over'
      noteX = pos.centerX - noteWidth / 2;
    }

    const noteBox = new shapes.standard.Rectangle();
    noteBox.position(noteX, note.y);
    noteBox.resize(noteWidth, note.height);
    noteBox.attr({
      body: {
        fill: customBg || colors.noteFill,
        stroke: customBorder || colors.noteStroke,
        strokeWidth: 1.5,
        rx: 4,
        ry: 4
      },
      label: {
        text: note.text,
        textWrap: {
          width: noteWidth - 12,
          height: note.height - 8,
          ellipsis: true
        },
        textVerticalAnchor: 'middle',
        textAnchor: 'middle',
        fill: customText || colors.noteText,
        fontSize: 11,
        fontFamily: 'Inter, sans-serif'
      }
    });
    noteBox.addTo(graph);
  });

  // Draw Messages (Links)
  messagesLayout.forEach(msg => {
    const fromPos = participantPositions[msg.from];
    const toPos = participantPositions[msg.to];
    if (!fromPos || !toPos) return;

    const link = new shapes.standard.Link();
    const isDashed = msg.style === 'dashed';

    // Check for custom connector colors
    const customColor = msg.styles?.stroke || msg.styles?.color || msg.styles?.bordercolor || msg.styles?.linecolor;
    const strokeColor = customColor || (isDashed ? colors.msgResponseStroke : colors.msgRequestStroke);

    if (msg.isSelf) {
      link.source({ x: fromPos.centerX + 5, y: msg.y });
      link.target({ x: fromPos.centerX + 5, y: msg.y + 35 });
      link.vertices([
        { x: fromPos.centerX + 55, y: msg.y },
        { x: fromPos.centerX + 55, y: msg.y + 35 }
      ]);
      link.connector('rounded', { radius: 8 });
    } else {
      link.source({ x: fromPos.centerX, y: msg.y });
      link.target({ x: toPos.centerX, y: msg.y });
    }

    link.attr({
      line: {
        stroke: strokeColor,
        strokeWidth: isDashed ? 1.5 : 2,
        strokeDasharray: isDashed ? '5,5' : 'none',
        targetMarker: {
          type: 'path',
          d: isDashed ? 'M 6 -3 L 0 0 L 6 3' : 'M 8 -4 L 0 0 L 8 4 Z',
          fill: isDashed ? 'none' : strokeColor,
          stroke: strokeColor,
          strokeWidth: isDashed ? 1.5 : 1
        }
      }
    });

    // Add Label
    // Check for custom label text color
    const customLabelColor = msg.styles?.labelcolor || msg.styles?.textcolor || msg.styles?.textColor || msg.styles?.color;
    link.appendLabel({
      attrs: {
        text: {
          text: msg.text,
          fill: customLabelColor || colors.msgText,
          fontSize: 12,
          fontWeight: '600',
          fontFamily: 'Inter, sans-serif'
        },
        rect: {
          fill: colors.msgTextBg,
          rx: 4,
          ry: 4,
          stroke: 'none'
        }
      },
      position: msg.isSelf ? 1.0 : 0.5,
      offset: msg.isSelf ? { x: 60, y: -10 } : { x: 0, y: -10 }
    });

    link.addTo(graph);
  });

  // Adjust paper dimensions to fit content
  const totalWidth = Math.max(paperWidth, paddingLeft * 2 + numParticipants * spacing);
  const totalHeight = maxY + boxHeight + 40;
  paper.setDimensions(totalWidth, totalHeight);

  return { graph, paper };
}
