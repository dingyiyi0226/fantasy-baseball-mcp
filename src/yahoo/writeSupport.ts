// Yahoo writes change a real roster, so MCP clients should require explicit
// confirmation before executing them.
export const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
} as const;

export const WRITE_NOT_SUPPORTED =
  "Yahoo's write-scoped Fantasy API is deprecated, so this MCP server does not " +
  "support write actions in normal use. For lineup changes, use the browser-based " +
  "roster management flow. For add/drop moves, make the approved transaction " +
  "directly on Yahoo Fantasy.\n\n" +
  "This legacy API path is retained only for future compatibility testing. Pass " +
  "`force=true` only if you explicitly want to try it anyway.";
