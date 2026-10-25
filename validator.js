/**
 * DevScribe Sequence Diagram Plugin - Document Validator & Transformer
 *
 * Normalizes raw LLM content into standard DevScribe sequence-diagram document blocks.
 * Resilient against markdown fences, JSON wrappers, or extra explanation text.
 */

/**
 * Cleans sequence diagram DSL code from raw LLM output
 * @param {string} rawText 
 * @returns {string} Cleaned sequence diagram DSL
 */
function cleanSequenceDsl(rawText) {
  if (typeof rawText !== "string") return "";
  let text = rawText.trim();

  // Strip markdown code fences (e.g. ```sequence ... ```, ```mermaid ... ```, ``` ... ```)
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }

  // If wrapped in a JSON block or payload, extract 'code' field
  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.code && typeof parsed.code === "string") {
        return cleanSequenceDsl(parsed.code);
      }
      if (parsed.data && typeof parsed.data === "object" && parsed.data.code) {
        return cleanSequenceDsl(parsed.data.code);
      }
    } catch (_) {}
  }

  return text;
}

/**
 * Validates and transforms raw LLM content or input into sequence-diagram document payload
 * @param {string|Object|Array} rawContent 
 * @returns {Array<Object>} Document blocks
 */
function validateAndTransform(rawContent) {
  // If already in standard DevScribe block format, return as is
  if (Array.isArray(rawContent) && rawContent.length > 0 && rawContent[0]) {
    const firstBlock = rawContent[0];
    if (firstBlock.type === "sequence-diagram" && firstBlock.data && typeof firstBlock.data.code === "string") {
      return rawContent;
    }
    if (firstBlock.data) {
      return validateAndTransform(firstBlock.data);
    }
  }

  let code = "";

  if (typeof rawContent === "string") {
    code = cleanSequenceDsl(rawContent);
  } else if (rawContent && typeof rawContent === "object") {
    if (typeof rawContent.code === "string") {
      code = cleanSequenceDsl(rawContent.code);
    } else if (rawContent.data && typeof rawContent.data.code === "string") {
      code = cleanSequenceDsl(rawContent.data.code);
    } else if (typeof rawContent.content === "string") {
      code = cleanSequenceDsl(rawContent.content);
    } else {
      code = JSON.stringify(rawContent, null, 2);
    }
  }

  if (!code || !code.trim()) {
    code = `title: Sequence Diagram\n\nactor User as User\nparticipant App as Application\n\nUser -> App: Request\nApp --> User: Response\n`;
  }

  return [
    {
      type: "sequence-diagram",
      data: {
        code,
        viewMode: "split",
        isEditorCollapsed: false,
        editorWidth: 400
      }
    }
  ];
}

module.exports = {
  cleanSequenceDsl,
  validateAndTransform,
};
