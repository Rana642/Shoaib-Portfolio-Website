import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request project scope for the restricted user MCP. While a tool handler
 * runs inside kbScope.run(...), the Knowledge Base's project lookup can only
 * see the projects in allowedProjectIds, so a user cannot read (or even learn
 * the name of) any other project. The admin MCP never sets it (no scope = all).
 */
export const kbScope = new AsyncLocalStorage<{ allowedProjectIds: Set<string> }>();
