/**
 * DevScribe Sequence Diagram Plugin - LLM Parser
 *
 * Converts stored sequence-diagram document payload into clean, LLM-readable Sequence Diagram DSL.
 * Used by update_file and contextManager to inspect and update existing sequence diagrams.
 */

/**
 * Extracts raw DSL code string from sequence-diagram document payload
 * @param {*} rawPayload 
 * @returns {string} Clean sequence diagram DSL
 */
function extractDsl(rawPayload) {
  if (!rawPayload) return "";

  let data = rawPayload;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (_) {
      return rawPayload.trim();
    }
  }

  // DevScribe block array: [{ type: "sequence-diagram", data: { code: "..." } }]
  if (Array.isArray(data)) {
    if (data.length > 0 && data[0]) {
      if (data[0].type === "sequence-diagram" && data[0].data) {
        return extractDsl(data[0].data);
      }
      if (typeof data[0] === "object" && (data[0].code !== undefined || data[0].content !== undefined)) {
        return extractDsl(data[0]);
      }
    }
    return "";
  }

  if (data && typeof data === "object") {
    if (typeof data.code === "string") {
      return data.code.trim();
    }
    if (data.data && typeof data.data.code === "string") {
      return data.data.code.trim();
    }
    if (typeof data.content === "string") {
      return data.content.trim();
    }
  }

  return String(rawPayload || "").trim();
}

/**
 * Serializes sequence-diagram document into human/LLM-readable text format
 * @param {*} documentPayload 
 * @returns {string}
 */
function parseToLlmFormat(documentPayload) {
  return extractDsl(documentPayload);
}

module.exports = {
  extractDsl,
  parseToLlmFormat,
  serialize: parseToLlmFormat,
};
