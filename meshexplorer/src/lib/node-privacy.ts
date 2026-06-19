/**
 * Node privacy: operators can opt a node out of the public-facing surfaces of
 * meshexplorer (map, neighbors, chat, search, detail page) by putting any of the
 * "hidden" emoji in the node name.
 *
 * Match on the base codepoints below, ignoring the optional variation selector
 * (⛔️ = ⛔ + U+FE0F): a substring / position() check on the base codepoint matches
 * whether or not the VS-16 is present, so we never special-case it.
 */

// Base codepoints only — the VS-16 (U+FE0F) variant of ⛔ is matched by substring.
export const HIDDEN_NODE_EMOJIS = ["⛔", "🛑", "🚫"] as const;

/** JS check used client-side (chat) and server-side (node detail). */
export function isHiddenNodeName(name?: string | null): boolean {
  if (!name) return false;
  return HIDDEN_NODE_EMOJIS.some((e) => name.includes(e));
}

/**
 * SQL predicate that is TRUE for VISIBLE (non-hidden) nodes, for pushing into a
 * WHERE list. `column` is a trusted column identifier (never user input); the
 * emoji are our own constants, so inlining them as literals is safe.
 */
export function visibleNodeSqlClause(column: string): string {
  return HIDDEN_NODE_EMOJIS.map((e) => `position(${column}, '${e}') = 0`).join(" AND ");
}
