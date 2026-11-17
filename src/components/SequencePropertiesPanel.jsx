import React from 'react';
import {
  COLOR_PRESETS,
  ARROW_OPTIONS,
  PARTICIPANT_KINDS,
  NOTE_PLACEMENTS,
} from '../utils/sequenceSync';

export function SequencePropertiesPanel({
  selectedItem,
  participants = [],
  onUpdateParticipant,
  onDeleteParticipant,
  onUpdateMessage,
  onDeleteMessage,
  onUpdateNote,
  onDeleteNote,
  onClose,
}) {
  if (!selectedItem) return null;

  const { type, data } = selectedItem;

  return (
    <div
      className="sequence-properties-panel"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {type === 'participant' && (
        <ParticipantEditor
          data={data}
          onUpdate={onUpdateParticipant}
          onDelete={onDeleteParticipant}
          onClose={onClose}
        />
      )}

      {type === 'message' && (
        <MessageEditor
          data={data}
          onUpdate={onUpdateMessage}
          onDelete={onDeleteMessage}
          onClose={onClose}
        />
      )}

      {type === 'note' && (
        <NoteEditor
          data={data}
          participants={participants}
          onUpdate={onUpdateNote}
          onDelete={onDeleteNote}
          onClose={onClose}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Participant Editor
───────────────────────────────────────────────────────────── */
function ParticipantEditor({ data, onUpdate, onDelete, onClose }) {
  const currentKind = data.kind || 'participant';
  const styles = data.styles || {};
  const currentBg = styles.bg || styles.fill || '#ffffff';
  const currentBorder = styles.border || styles.stroke || '#cbd5e1';
  const currentColor = styles.color || styles.textcolor || '#0f172a';

  const applyPreset = (preset) => {
    onUpdate(data.alias, {
      styles: {
        bg: preset.bg,
        border: preset.border,
        color: preset.color,
      },
    });
  };

  return (
    <div className="prop-section">
      <div className="prop-header">
        <div className="prop-badge participant">
          <i className="ri-user-settings-line"></i>
        </div>
        <div className="prop-title-container">
          <div className="prop-title">Participant</div>
          <div className="prop-subtitle">{data.alias}</div>
        </div>
        <button className="prop-close-btn" onClick={onClose} title="Close properties panel">
          <i className="ri-close-line"></i>
        </button>
      </div>

      <div className="prop-body">
        {/* Component Kind */}
        <div className="prop-field">
          <label className="prop-label">Type</label>
          <div className="prop-segmented-group">
            {PARTICIPANT_KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                className={`prop-seg-btn ${currentKind === k.key ? 'active' : ''}`}
                onClick={() => onUpdate(data.alias, { kind: k.key })}
              >
                <i className={k.icon}></i>
                <span>{k.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Alias / Identifier */}
        <div className="prop-field">
          <label className="prop-label">Identifier (ID)</label>
          <input
            type="text"
            className="prop-input"
            value={data.alias || ''}
            onChange={(e) => onUpdate(data.alias, { alias: e.target.value })}
            placeholder="e.g. WebApp"
          />
        </div>

        {/* Display Label */}
        <div className="prop-field">
          <label className="prop-label">Display Label</label>
          <input
            type="text"
            className="prop-input"
            value={data.label || ''}
            onChange={(e) => onUpdate(data.alias, { label: e.target.value })}
            placeholder="e.g. Web Application"
          />
        </div>

        {/* Color Palette Presets */}
        <div className="prop-field">
          <label className="prop-label">Color Presets</label>
          <div className="prop-palette-presets">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="prop-swatch-btn"
                title={preset.name}
                style={{ backgroundColor: preset.bg, borderColor: preset.border }}
                onClick={() => applyPreset(preset)}
              >
                <span className="prop-swatch-dot" style={{ backgroundColor: preset.border }}></span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Colors */}
        <div className="prop-colors-grid">
          <div className="prop-color-item">
            <span className="prop-color-title">Background</span>
            <div className="prop-color-input-wrap">
              <input
                type="color"
                className="prop-color-picker"
                value={toHexColor(currentBg, '#ffffff')}
                onChange={(e) =>
                  onUpdate(data.alias, { styles: { bg: e.target.value } })
                }
              />
              <input
                type="text"
                className="prop-color-hex"
                value={currentBg}
                onChange={(e) =>
                  onUpdate(data.alias, { styles: { bg: e.target.value } })
                }
              />
            </div>
          </div>

          <div className="prop-color-item">
            <span className="prop-color-title">Border</span>
            <div className="prop-color-input-wrap">
              <input
                type="color"
                className="prop-color-picker"
                value={toHexColor(currentBorder, '#cbd5e1')}
                onChange={(e) =>
                  onUpdate(data.alias, { styles: { border: e.target.value } })
                }
              />
              <input
                type="text"
                className="prop-color-hex"
                value={currentBorder}
                onChange={(e) =>
                  onUpdate(data.alias, { styles: { border: e.target.value } })
                }
              />
            </div>
          </div>

          <div className="prop-color-item">
            <span className="prop-color-title">Text Color</span>
            <div className="prop-color-input-wrap">
              <input
                type="color"
                className="prop-color-picker"
                value={toHexColor(currentColor, '#0f172a')}
                onChange={(e) =>
                  onUpdate(data.alias, { styles: { color: e.target.value } })
                }
              />
              <input
                type="text"
                className="prop-color-hex"
                value={currentColor}
                onChange={(e) =>
                  onUpdate(data.alias, { styles: { color: e.target.value } })
                }
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="prop-actions">
          <button
            type="button"
            className="prop-delete-btn"
            onClick={() => onDelete(data.alias)}
          >
            <i className="ri-delete-bin-line"></i>
            <span>Delete Participant</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Message Editor
───────────────────────────────────────────────────────────── */
function MessageEditor({ data, onUpdate, onDelete, onClose }) {
  const styles = data.styles || {};
  const currentLineColor = styles.color || styles.stroke || '#4f46e5';
  const currentLabelColor = styles.labelcolor || styles.color || '#334155';
  const isMoving = styles.moving === true || styles.moving === 'true';

  const handleSwapDirection = () => {
    onUpdate(data.index, {
      from: data.to,
      to: data.from,
    });
  };

  return (
    <div className="prop-section">
      <div className="prop-header">
        <div className="prop-badge message">
          <i className="ri-arrow-right-line"></i>
        </div>
        <div className="prop-title-container">
          <div className="prop-title">Message / Call</div>
          <div className="prop-subtitle">
            {data.from} → {data.to}
          </div>
        </div>
        <button className="prop-close-btn" onClick={onClose} title="Close properties panel">
          <i className="ri-close-line"></i>
        </button>
      </div>

      <div className="prop-body">
        {/* Swap direction helper */}
        <div className="prop-flow-summary">
          <div className="prop-flow-endpoints">
            <span className="prop-endpoint from">{data.from}</span>
            <span className="prop-flow-arrow">{data.arrow || '->'}</span>
            <span className="prop-endpoint to">{data.to}</span>
          </div>
          <button
            type="button"
            className="prop-swap-btn"
            onClick={handleSwapDirection}
            title="Swap message direction"
          >
            <i className="ri-arrow-left-right-line"></i>
            <span>Swap</span>
          </button>
        </div>

        {/* Message label / text */}
        <div className="prop-field">
          <label className="prop-label">Message Label</label>
          <input
            type="text"
            className="prop-input"
            value={data.text || ''}
            onChange={(e) => onUpdate(data.index, { text: e.target.value })}
            placeholder="e.g. POST /auth/login"
          />
        </div>

        {/* Arrow Style */}
        <div className="prop-field">
          <label className="prop-label">Arrow Style</label>
          <div className="prop-arrow-options">
            {ARROW_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`prop-arrow-btn ${data.arrow === opt.key ? 'active' : ''}`}
                onClick={() => onUpdate(data.index, { arrow: opt.key })}
              >
                <span className="prop-arrow-code">{opt.key}</span>
                <span className="prop-arrow-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Animated flow toggle */}
        <div className="prop-field">
          <label className="prop-toggle-label">
            <div className="prop-toggle-text">
              <span className="prop-toggle-title">Flow Animation</span>
              <span className="prop-toggle-desc">Animated dashed pulse effect</span>
            </div>
            <input
              type="checkbox"
              className="prop-toggle-checkbox"
              checked={isMoving}
              onChange={(e) =>
                onUpdate(data.index, {
                  styles: { moving: e.target.checked },
                })
              }
            />
          </label>
        </div>

        {/* Colors */}
        <div className="prop-colors-grid">
          <div className="prop-color-item">
            <span className="prop-color-title">Line Color</span>
            <div className="prop-color-input-wrap">
              <input
                type="color"
                className="prop-color-picker"
                value={toHexColor(currentLineColor, '#4f46e5')}
                onChange={(e) =>
                  onUpdate(data.index, { styles: { color: e.target.value } })
                }
              />
              <input
                type="text"
                className="prop-color-hex"
                value={currentLineColor}
                onChange={(e) =>
                  onUpdate(data.index, { styles: { color: e.target.value } })
                }
              />
            </div>
          </div>

          <div className="prop-color-item">
            <span className="prop-color-title">Label Color</span>
            <div className="prop-color-input-wrap">
              <input
                type="color"
                className="prop-color-picker"
                value={toHexColor(currentLabelColor, '#334155')}
                onChange={(e) =>
                  onUpdate(data.index, { styles: { labelcolor: e.target.value } })
                }
              />
              <input
                type="text"
                className="prop-color-hex"
                value={currentLabelColor}
                onChange={(e) =>
                  onUpdate(data.index, { styles: { labelcolor: e.target.value } })
                }
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="prop-actions">
          <button
            type="button"
            className="prop-delete-btn"
            onClick={() => onDelete(data.index)}
          >
            <i className="ri-delete-bin-line"></i>
            <span>Delete Message</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Note Editor
───────────────────────────────────────────────────────────── */
function NoteEditor({ data, participants, onUpdate, onDelete, onClose }) {
  const styles = data.styles || {};
  const currentBg = styles.bg || styles.fill || '#fef9c3';
  const currentBorder = styles.border || styles.stroke || '#eab308';
  const currentColor = styles.color || styles.textcolor || '#713f12';

  return (
    <div className="prop-section">
      <div className="prop-header">
        <div className="prop-badge note">
          <i className="ri-sticky-note-line"></i>
        </div>
        <div className="prop-title-container">
          <div className="prop-title">Note</div>
          <div className="prop-subtitle">
            {data.placement} {data.target}
          </div>
        </div>
        <button className="prop-close-btn" onClick={onClose} title="Close properties panel">
          <i className="ri-close-line"></i>
        </button>
      </div>

      <div className="prop-body">
        {/* Placement */}
        <div className="prop-field">
          <label className="prop-label">Placement</label>
          <div className="prop-segmented-group">
            {NOTE_PLACEMENTS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`prop-seg-btn ${data.placement === p.key ? 'active' : ''}`}
                onClick={() => onUpdate(data.index, { placement: p.key })}
              >
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Target Participant */}
        <div className="prop-field">
          <label className="prop-label">Target Participant</label>
          <select
            className="prop-select"
            value={data.target || ''}
            onChange={(e) => onUpdate(data.index, { target: e.target.value })}
          >
            {participants.map((p) => (
              <option key={p.alias} value={p.alias}>
                {p.alias} {p.label && p.label !== p.alias ? `(${p.label})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Note Text */}
        <div className="prop-field">
          <label className="prop-label">Note Text</label>
          <textarea
            className="prop-textarea"
            rows={3}
            value={(data.text || '').replace(/\\n/g, '\n')}
            onChange={(e) =>
              onUpdate(data.index, { text: e.target.value.replace(/\n/g, '\\n') })
            }
            placeholder="Enter note text..."
          />
        </div>

        {/* Colors */}
        <div className="prop-colors-grid">
          <div className="prop-color-item">
            <span className="prop-color-title">Background</span>
            <div className="prop-color-input-wrap">
              <input
                type="color"
                className="prop-color-picker"
                value={toHexColor(currentBg, '#fef9c3')}
                onChange={(e) =>
                  onUpdate(data.index, { styles: { bg: e.target.value } })
                }
              />
              <input
                type="text"
                className="prop-color-hex"
                value={currentBg}
                onChange={(e) =>
                  onUpdate(data.index, { styles: { bg: e.target.value } })
                }
              />
            </div>
          </div>

          <div className="prop-color-item">
            <span className="prop-color-title">Border</span>
            <div className="prop-color-input-wrap">
              <input
                type="color"
                className="prop-color-picker"
                value={toHexColor(currentBorder, '#eab308')}
                onChange={(e) =>
                  onUpdate(data.index, { styles: { border: e.target.value } })
                }
              />
              <input
                type="text"
                className="prop-color-hex"
                value={currentBorder}
                onChange={(e) =>
                  onUpdate(data.index, { styles: { border: e.target.value } })
                }
              />
            </div>
          </div>

          <div className="prop-color-item">
            <span className="prop-color-title">Text Color</span>
            <div className="prop-color-input-wrap">
              <input
                type="color"
                className="prop-color-picker"
                value={toHexColor(currentColor, '#713f12')}
                onChange={(e) =>
                  onUpdate(data.index, { styles: { color: e.target.value } })
                }
              />
              <input
                type="text"
                className="prop-color-hex"
                value={currentColor}
                onChange={(e) =>
                  onUpdate(data.index, { styles: { color: e.target.value } })
                }
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="prop-actions">
          <button
            type="button"
            className="prop-delete-btn"
            onClick={() => onDelete(data.index)}
          >
            <i className="ri-delete-bin-line"></i>
            <span>Delete Note</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Convert any color string to a valid 6-char hex for <input type="color">
function toHexColor(colorStr, fallback = '#3b82f6') {
  if (!colorStr) return fallback;
  const c = colorStr.trim();
  if (/^#([0-9a-f]{6})$/i.test(c)) return c;
  if (/^#([0-9a-f]{3})$/i.test(c)) {
    return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  }
  return fallback;
}
