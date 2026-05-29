/**
 * Shared utilities for handling node names, links, and text processing
 */

/**
 * Generate a search URL for a node name
 */
export function createNodeSearchUrl(nodeName: string): string {
  return `https://map.w0z.is/search?q=${encodeURIComponent(nodeName)}&exact&redirect`;
}

/**
 * Process text to replace @[Node Name] patterns with markdown links
 * Returns the processed text with node mentions converted to markdown links
 */
export function processNodeMentionsForMarkdown(text: string): string {
  const nodePatternRegex = /@\[[^\]]+\]/g;
  
  return text.replace(nodePatternRegex, (match) => {
    // Extract node name by removing @[ and ]
    const nodeName = match.slice(2, -1);
    const searchUrl = createNodeSearchUrl(nodeName);
    
    // Return markdown link format
    return `[@${nodeName}](${searchUrl})`;
  });
}

/**
 * Extract all node mentions from text
 * Returns an array of node names found in @[Node Name] patterns
 */
export function extractNodeMentions(text: string): string[] {
  const nodePatternRegex = /@\[[^\]]+\]/g;
  const matches = text.match(nodePatternRegex) || [];
  
  return matches.map(match => match.slice(2, -1)); // Remove @[ and ]
}

/**
 * Check if text contains node mentions
 */
export function hasNodeMentions(text: string): boolean {
  return /@\[[^\]]+\]/.test(text);
}

/**
 * Type definitions for node processing
 */
export interface NodeMention {
  nodeName: string;
  originalMatch: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Find all node mentions in text with their positions
 * Returns detailed information about each node mention found
 */
export function findNodeMentions(text: string): NodeMention[] {
  const nodePatternRegex = /@\[[^\]]+\]/g;
  const mentions: NodeMention[] = [];
  let match;
  
  while ((match = nodePatternRegex.exec(text)) !== null) {
    const nodeName = match[0].slice(2, -1); // Remove @[ and ]
    mentions.push({
      nodeName,
      originalMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }
  
  return mentions;
}
