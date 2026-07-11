// Yahoo writes change a real roster, so MCP clients should require explicit
// confirmation before executing them.
export const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
} as const;

export const WRITE_NOT_SUPPORTED =
  "Yahoo's write-scoped Fantasy API is deprecated, so this MCP server does not " +
  "support write actions in normal use. For lineup changes or add/drop moves, use the " +
  "browser-based workflows.\n\n" +
  "This legacy API path is retained only for future compatibility testing. Pass " +
  "`force=true` only if you explicitly want to try it anyway.";
