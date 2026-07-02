/**
 * Parses sequence diagram DSL code into a structured AST.
 * Supported syntax:
 * - title: Diagram Title
 * - participant Alias [as Display Name] [style options]
 * - actor Alias [as Display Name] [style options]
 * - database Alias [as Display Name] [style options]
 * - Alias -> Alias: Message Text [style options]
 * - Alias --> Alias: Message Text [style options]
 * - activate Alias [style options]
 * - deactivate Alias
 * - note [left of|right of|over] Alias: Note Text [style options]
 * - Comments starting with // or #
 */

// Helper to parse trailing style brackets like [fill: #fff, stroke: #000]
function parseStyleOptions(line) {
  const match = line.match(/\[(.*?)\]\s*$/);
  if (!match) return { cleanLine: line, styles: {} };
  
  const cleanLine = line.replace(/\[(.*?)\]\s*$/, '').trim();
  const styleStr = match[1];
  const styles = {};
  
  // Split by comma
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

export function parseSequenceDiagram(code) {
  const lines = (code || '').split('\n');
  
  const participantsMap = new Map(); // alias -> { name, type, styles }
  const participantsList = [];      // Array of aliases in order of declaration
  const steps = [];
  let title = null;

  const declRegex = /^(participant|actor|database)\s+(.+?)(?:\s+as\s+(.+))?$/i;
  const msgRegex = /^(.+?)\s*(-+>+)\s*(.+?)\s*:\s*(.+)$/;
  const actRegex = /^(activate|deactivate)\s+(.+)$/i;
  const noteRegex = /^note\s+(left of|right of|over)\s+(.+?)\s*:\s*(.+)$/i;
  const titleRegex = /^title(?:\s*:\s*|\s+)(.+)$/i;
  const altRegex = /^alt\s+(.+)$/i;
  const elseRegex = /^else(?:\s+(.+))?$/i;
  const endRegex = /^end$/i;

  const addParticipant = (alias, label, type = 'participant', styles = {}) => {
    const cleanAlias = alias.trim();
    if (!participantsMap.has(cleanAlias)) {
      participantsMap.set(cleanAlias, {
        label: (label || cleanAlias).trim(),
        type: type.toLowerCase(),
        styles
      });
      participantsList.push(cleanAlias);
    }
  };

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) {
      continue;
    }
    if (line.toLowerCase() === 'sequencediagram') continue;

    // Extract styles from the end of the line
    const { cleanLine, styles } = parseStyleOptions(line);

    // 1. Parse Title
    let match = cleanLine.match(titleRegex);
    if (match) {
      title = match[1].trim();
      continue;
    }

    // 2. Parse Participant Declarations
    match = cleanLine.match(declRegex);
    if (match) {
      const type = match[1];
      const alias = match[2];
      const displayName = match[3];
      addParticipant(alias, displayName, type, styles);
      continue;
    }

    // 3. Parse Activations
    match = cleanLine.match(actRegex);
    if (match) {
      const action = match[1].toLowerCase();
      const alias = match[2].trim();
      addParticipant(alias); // ensure declared
      steps.push({
        type: action, // 'activate' or 'deactivate'
        participant: alias,
        styles
      });
      continue;
    }

    // 4. Parse Notes
    match = cleanLine.match(noteRegex);
    if (match) {
      const placement = match[1].toLowerCase().replace(/\s+of$/, ''); // 'left', 'right', 'over'
      const alias = match[2].trim();
      const text = match[3].trim();
      addParticipant(alias); // ensure declared
      steps.push({
        type: 'note',
        placement,
        participant: alias,
        text,
        styles
      });
      continue;
    }

    // 5. Parse Alt Block Start
    match = cleanLine.match(altRegex);
    if (match) {
      steps.push({
        type: 'block_start',
        blockType: 'alt',
        condition: match[1].trim(),
        styles
      });
      continue;
    }

    // 6. Parse Else Block
    match = cleanLine.match(elseRegex);
    if (match) {
      steps.push({
        type: 'block_else',
        condition: match[1] ? match[1].trim() : '',
        styles
      });
      continue;
    }

    // 7. Parse Block End
    match = cleanLine.match(endRegex);
    if (match) {
      steps.push({
        type: 'block_end',
        styles
      });
      continue;
    }

    // 8. Parse Messages
    match = cleanLine.match(msgRegex);
    if (match) {
      const from = match[1].trim();
      const arrow = match[2].trim();
      const to = match[3].trim();
      const text = match[4].trim();

      addParticipant(from);
      addParticipant(to);

      steps.push({
        type: 'message',
        from,
        to,
        text,
        style: arrow.includes('--') ? 'dashed' : 'solid',
        styles
      });
      continue;
    }
  }

  // Map participant list to full objects
  const participants = participantsList.map(alias => ({
    alias,
    ...participantsMap.get(alias)
  }));

  return {
    title,
    participants,
    steps
  };
}
