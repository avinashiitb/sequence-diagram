// Sequence Diagram DSL Parser and Serializer for Live Canvas Editing

export const COLOR_PRESETS = [
  { name: 'Blue', bg: '#eff6ff', border: '#3b82f6', color: '#1e40af' },
  { name: 'Emerald', bg: '#f0fdf4', border: '#22c55e', color: '#166534' },
  { name: 'Amber', bg: '#fffbeb', border: '#f59e0b', color: '#92400e' },
  { name: 'Orange', bg: '#fff7ed', border: '#f97316', color: '#9a3412' },
  { name: 'Purple', bg: '#faf5ff', border: '#a855f7', color: '#6b21a8' },
  { name: 'Pink', bg: '#fdf2f8', border: '#ec4899', color: '#9d174d' },
  { name: 'Slate', bg: '#f8fafc', border: '#64748b', color: '#1e293b' },
  { name: 'Dark', bg: '#1e293b', border: '#475569', color: '#f8fafc' },
];

export const ARROW_OPTIONS = [
  { key: '->', label: 'Solid (Synch)', desc: 'Synchronous request' },
  { key: '-->', label: 'Dashed (Return)', desc: 'Asynchronous response' },
  { key: '->>', label: 'Solid Arrow', desc: 'Direct call' },
  { key: '-->>', label: 'Dashed Arrow', desc: 'Reply' },
];

export const PARTICIPANT_KINDS = [
  { key: 'participant', label: 'Participant', icon: 'ri-computer-line' },
  { key: 'actor', label: 'Actor', icon: 'ri-user-line' },
  { key: 'database', label: 'Database', icon: 'ri-database-2-line' },
];

export const NOTE_PLACEMENTS = [
  { key: 'over', label: 'Over' },
  { key: 'left of', label: 'Left of' },
  { key: 'right of', label: 'Right of' },
];

// Helper to parse bracket styles: [bg: #fff, border: #333, color: #111, moving: true]
export function parseBracketStyles(styleString) {
  if (!styleString) return {};
  const styles = {};
  const parts = styleString.split(',');
  parts.forEach(part => {
    const kv = part.split(':');
    if (kv.length === 2) {
      const k = kv[0].trim().toLowerCase();
      const v = kv[1].trim();
      styles[k] = v;
    }
  });
  return styles;
}

// Helper to format styles object back to bracket string: [bg: #fff, border: #000]
export function formatBracketStyles(styles) {
  if (!styles || typeof styles !== 'object') return '';
  const entries = [];
  
  if (styles.bg) entries.push(`bg: ${styles.bg}`);
  else if (styles.fill) entries.push(`bg: ${styles.fill}`);
  
  if (styles.border) entries.push(`border: ${styles.border}`);
  else if (styles.stroke) entries.push(`border: ${styles.stroke}`);
  
  if (styles.color) entries.push(`color: ${styles.color}`);
  else if (styles.textcolor || styles.textColor) entries.push(`color: ${styles.textcolor || styles.textColor}`);

  if (styles.labelcolor || styles.labelColor) entries.push(`labelcolor: ${styles.labelcolor || styles.labelColor}`);
  
  if (styles.moving === true || styles.moving === 'true') {
    entries.push('moving: true');
  }

  if (entries.length === 0) return '';
  return ` [${entries.join(', ')}]`;
}

/**
 * Parses Sequence Diagram DSL into structured items with line index mapping.
 */
export function parseSequenceDSL(code) {
  const lines = (code || '').split('\n');
  const participants = [];
  const messages = [];
  const notes = [];
  const activations = [];

  const declRegex = /^(participant|actor|database)\s+([^\s[]+)(?:\s+as\s+([^[]+?))?(?:\s*\[(.*?)\])?$/i;
  const msgRegex = /^([^\s[-]+)\s*(-+>+)\s*([^\s[:]+)\s*:\s*([^[]+?)(?:\s*\[(.*?)\])?$/;
  const noteRegex = /^note\s+(left of|right of|over)\s+([^\s[:]+)\s*:\s*([^[]+?)(?:\s*\[(.*?)\])?$/i;
  const actRegex = /^(activate|deactivate)\s+([^\s[]+)(?:\s*\[(.*?)\])?$/i;

  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) return;
    if (line.toLowerCase().replace(/\s/g, '') === 'sequencediagram') return;
    if (line.toLowerCase().startsWith('title:')) return;

    // 1. Participant Declaration
    const declMatch = line.match(declRegex);
    if (declMatch) {
      const kind = declMatch[1].toLowerCase();
      const alias = declMatch[2].trim();
      const label = declMatch[3] ? declMatch[3].trim() : alias;
      const styles = parseBracketStyles(declMatch[4]);

      participants.push({
        type: 'participant',
        kind,
        alias,
        label,
        styles,
        lineIndex,
        raw: rawLine,
      });
      return;
    }

    // 2. Note
    const noteMatch = line.match(noteRegex);
    if (noteMatch) {
      const placement = noteMatch[1].toLowerCase();
      const target = noteMatch[2].trim();
      const text = noteMatch[3].trim();
      const styles = parseBracketStyles(noteMatch[4]);

      notes.push({
        type: 'note',
        placement,
        target,
        text,
        styles,
        lineIndex,
        raw: rawLine,
      });
      return;
    }

    // 3. Message
    const msgMatch = line.match(msgRegex);
    if (msgMatch) {
      const from = msgMatch[1].trim();
      const arrow = msgMatch[2].trim();
      const to = msgMatch[3].trim();
      const text = msgMatch[4].trim();
      const styles = parseBracketStyles(msgMatch[5]);

      messages.push({
        type: 'message',
        from,
        arrow,
        to,
        text,
        styles,
        lineIndex,
        raw: rawLine,
      });
      return;
    }

    // 4. Activation
    const actMatch = line.match(actRegex);
    if (actMatch) {
      const action = actMatch[1].toLowerCase();
      const target = actMatch[2].trim();
      const styles = parseBracketStyles(actMatch[3]);

      activations.push({
        type: 'activation',
        action,
        target,
        styles,
        lineIndex,
        raw: rawLine,
      });
    }
  });

  return { participants, messages, notes, activations, totalLines: lines.length };
}

/**
 * Updates a participant in the code:
 * - If alias changed, updates declarations and all referencing messages, notes, and activations!
 * - Updates kind (participant, actor, database), label, and styles.
 */
export function updateParticipantInCode(code, oldAlias, patch) {
  const lines = (code || '').split('\n');
  const parsed = parseSequenceDSL(code);
  const p = parsed.participants.find(item => item.alias.toLowerCase() === oldAlias.toLowerCase());
  if (!p) return code;

  const newAlias = (patch.alias !== undefined ? patch.alias.trim().replace(/\s+/g, '_') : p.alias) || p.alias;
  const newKind = patch.kind || p.kind || 'participant';
  const newLabel = patch.label !== undefined ? patch.label.trim() : p.label;
  const newStyles = patch.styles ? { ...p.styles, ...patch.styles } : p.styles;

  // Build new declaration line
  let decl = `${newKind} ${newAlias}`;
  if (newLabel && newLabel !== newAlias) {
    decl += ` as ${newLabel}`;
  }
  const styleStr = formatBracketStyles(newStyles);
  if (styleStr) decl += styleStr;

  lines[p.lineIndex] = decl;

  // If alias was renamed, replace all references across messages, notes, and activations
  if (newAlias !== oldAlias) {
    const aliasRegex = new RegExp(`\\b${escapeRegExp(oldAlias)}\\b`, 'g');
    parsed.messages.forEach(m => {
      if (m.from === oldAlias || m.to === oldAlias) {
        lines[m.lineIndex] = lines[m.lineIndex].replace(aliasRegex, newAlias);
      }
    });
    parsed.notes.forEach(n => {
      if (n.target === oldAlias) {
        lines[n.lineIndex] = lines[n.lineIndex].replace(aliasRegex, newAlias);
      }
    });
    parsed.activations.forEach(a => {
      if (a.target === oldAlias) {
        lines[a.lineIndex] = lines[a.lineIndex].replace(aliasRegex, newAlias);
      }
    });
  }

  return lines.join('\n');
}

/**
 * Deletes a participant from code.
 */
export function deleteParticipantFromCode(code, alias) {
  const lines = (code || '').split('\n');
  const parsed = parseSequenceDSL(code);
  const p = parsed.participants.find(item => item.alias.toLowerCase() === alias.toLowerCase());
  if (!p) return code;

  lines.splice(p.lineIndex, 1);
  return lines.join('\n');
}

/**
 * Updates a message line in the code by index.
 */
export function updateMessageInCode(code, messageIndex, patch) {
  const lines = (code || '').split('\n');
  const parsed = parseSequenceDSL(code);
  const msg = parsed.messages[messageIndex];
  if (!msg) return code;

  const from = patch.from !== undefined ? patch.from : msg.from;
  const to = patch.to !== undefined ? patch.to : msg.to;
  const arrow = patch.arrow !== undefined ? patch.arrow : msg.arrow;
  const text = patch.text !== undefined ? patch.text : msg.text;
  const styles = patch.styles ? { ...msg.styles, ...patch.styles } : msg.styles;

  let newLine = `${from} ${arrow} ${to}: ${text}`;
  const styleStr = formatBracketStyles(styles);
  if (styleStr) newLine += styleStr;

  lines[msg.lineIndex] = newLine;
  return lines.join('\n');
}

/**
 * Deletes a message line from code by index.
 */
export function deleteMessageFromCode(code, messageIndex) {
  const lines = (code || '').split('\n');
  const parsed = parseSequenceDSL(code);
  const msg = parsed.messages[messageIndex];
  if (!msg) return code;

  lines.splice(msg.lineIndex, 1);
  return lines.join('\n');
}

/**
 * Updates a note line in code by index.
 */
export function updateNoteInCode(code, noteIndex, patch) {
  const lines = (code || '').split('\n');
  const parsed = parseSequenceDSL(code);
  const note = parsed.notes[noteIndex];
  if (!note) return code;

  const placement = patch.placement !== undefined ? patch.placement : note.placement;
  const target = patch.target !== undefined ? patch.target : note.target;
  const text = patch.text !== undefined ? patch.text : note.text;
  const styles = patch.styles ? { ...note.styles, ...patch.styles } : note.styles;

  let newLine = `note ${placement} ${target}: ${text}`;
  const styleStr = formatBracketStyles(styles);
  if (styleStr) newLine += styleStr;

  lines[note.lineIndex] = newLine;
  return lines.join('\n');
}

/**
 * Deletes a note line from code by index.
 */
export function deleteNoteFromCode(code, noteIndex) {
  const lines = (code || '').split('\n');
  const parsed = parseSequenceDSL(code);
  const note = parsed.notes[noteIndex];
  if (!note) return code;

  lines.splice(note.lineIndex, 1);
  return lines.join('\n');
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Built-in Examples / Templates
export const SEQUENCE_TEMPLATES = [
  {
    id: 'auth',
    title: 'Authentication & Query Flow',
    badge: 'AUTH',
    desc: 'User login, gateway authentication, database lookup, and conditional success/failure branches.',
    code: `title: Authentication & Query Flow

actor User [bg: #eff6ff, border: #3b82f6, color: #1e40af]
participant App as Web App [bg: #fcf7f2, border: #f97316, color: #9a3412]
participant API as Gateway Service [bg: #f0fdf4, border: #22c55e, color: #166534]
database DB as Primary Database [bg: #fdf2f8, border: #ec4899, color: #9d174d]

User -> App: Enter username & password
App -> API: POST /auth/login (user, pass) [color: #4f46e5, moving: true]
activate API [bg: #22c55e, border: #166534]

note over API: Validate credentials\\nand hash passwords [bg: #fef9c3, border: #eab308, color: #713f12]

API -> DB: Query user profile record [color: #22c55e, moving: true]
activate DB [bg: #ec4899, border: #9d174d]
DB --> API: Return user profile data [color: #64748b, moving: true]
deactivate DB

API -> API: Verify security hash [moving: true]

alt Success
  API --> App: 200 OK (JWT Access Token) [color: #22c55e, moving: true]
else Failure
  API --> App: 401 Unauthorized [color: #ef4444, moving: true]
end

deactivate API
App --> User: Render dashboard interface [color: #4f46e5, moving: true]`
  },
  {
    id: 'checkout',
    title: 'E-Commerce Checkout & Payment',
    badge: 'PAY',
    desc: 'Shopping cart checkout, payment gateway intent, 3D secure verification, and order processing.',
    code: `title: E-Commerce Checkout & Payment

actor Customer as Shopper [bg: #eff6ff, border: #3b82f6, color: #1e40af]
participant Store as Online Store [bg: #f0fdf4, border: #22c55e, color: #166534]
participant Payment as Stripe Gateway [bg: #faf5ff, border: #a855f7, color: #6b21a8]
database DB as Orders DB [bg: #fdf2f8, border: #ec4899, color: #9d174d]

Customer -> Store: Click Checkout ($120.00)
activate Store [bg: #22c55e, border: #166534]

Store -> Payment: Create PaymentIntent ($120) [color: #a855f7, moving: true]
activate Payment [bg: #a855f7, border: #6b21a8]
Payment --> Store: client_secret returned [color: #64748b]
deactivate Payment

Store --> Customer: Display Payment Modal [color: #22c55e]

Customer -> Payment: Submit Card Details [color: #3b82f6, moving: true]
activate Payment [bg: #a855f7, border: #6b21a8]

note over Payment: 3D Secure / Fraud Check [bg: #fef9c3, border: #eab308, color: #713f12]

alt Payment Approved
  Payment --> Customer: Payment Succeeded [color: #22c55e]
  Payment -> Store: Webhook: charge.successful [color: #a855f7, moving: true]
  Store -> DB: Save Order as PAID [color: #ec4899]
  Store --> Customer: Send confirmation email [color: #22c55e]
else Payment Declined
  Payment --> Customer: 402 Card Declined [color: #ef4444]
end

deactivate Payment
deactivate Store`
  },
  {
    id: 'microservices',
    title: 'Microservices Order Lifecycle',
    badge: 'SVC',
    desc: 'API gateway dispatch, inventory reservation, and multi-service order fulfillment flow.',
    code: `title: Microservices Order Lifecycle

actor Client as Mobile App [bg: #eff6ff, border: #3b82f6, color: #1e40af]
participant Gateway as API Gateway [bg: #fcf7f2, border: #f97316, color: #9a3412]
participant OrderSvc as Order Service [bg: #f0fdf4, border: #22c55e, color: #166534]
participant StockSvc as Inventory Service [bg: #faf5ff, border: #a855f7, color: #6b21a8]
database OrderDB as Order Database [bg: #fdf2f8, border: #ec4899, color: #9d174d]

Client -> Gateway: POST /orders (items, address) [moving: true]
activate Gateway [bg: #f97316, border: #9a3412]

Gateway -> OrderSvc: Forward request [color: #f97316]
activate OrderSvc [bg: #22c55e, border: #166534]

OrderSvc -> StockSvc: Reserve inventory [color: #a855f7, moving: true]
activate StockSvc [bg: #a855f7, border: #6b21a8]
StockSvc --> OrderSvc: Items reserved [color: #22c55e]
deactivate StockSvc

OrderSvc -> OrderDB: INSERT order record [color: #ec4899, moving: true]
OrderDB --> OrderSvc: Order #8921 created [color: #64748b]

OrderSvc --> Gateway: 201 Created (Order #8921) [color: #22c55e]
deactivate OrderSvc

Gateway --> Client: Display order confirmation [color: #3b82f6]
deactivate Gateway`
  },
  {
    id: 'webhook',
    title: 'Asynchronous Webhook & Event Queue',
    badge: 'QUEUE',
    desc: 'Incoming webhook validation, message broker ingestion, and async worker processing.',
    code: `title: Asynchronous Webhook & Event Queue

participant Source as External API [bg: #eff6ff, border: #3b82f6, color: #1e40af]
participant Ingress as Ingress Worker [bg: #fcf7f2, border: #f97316, color: #9a3412]
participant Queue as Kafka Broker [bg: #faf5ff, border: #a855f7, color: #6b21a8]
participant Consumer as Background Consumer [bg: #f0fdf4, border: #22c55e, color: #166534]
database DB as Primary Store [bg: #fdf2f8, border: #ec4899, color: #9d174d]

Source -> Ingress: POST /webhook/events [moving: true]
activate Ingress [bg: #f97316, border: #9a3412]

note over Ingress: Verify HMAC signature [bg: #fef9c3, border: #eab308, color: #713f12]

Ingress -> Queue: Publish event (topic: incoming_events) [color: #a855f7, moving: true]
Ingress --> Source: 202 Accepted (event_id) [color: #22c55e]
deactivate Ingress

Queue -> Consumer: Poll batch [color: #a855f7, moving: true]
activate Consumer [bg: #22c55e, border: #166534]

Consumer -> DB: Upsert processed event [color: #ec4899, moving: true]
DB --> Consumer: OK [color: #64748b]

Consumer -> Queue: Commit offset [color: #a855f7]
deactivate Consumer`
  }
];
