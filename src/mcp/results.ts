/** Standard MCP text result carrying formatted JSON. */
export function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/** Standard MCP result for human-readable text. */
export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
