export interface PathData {
  origin: string;
  pubkey: string;
  path: string;
  // Bytes per path hop (MeshCore path hash size: 1/2/3). The hex `path` is a
  // sequence of hop identifiers, each hashSize bytes (2*hashSize hex chars).
  // Defaults to 1 for backward compatibility / unknown.
  hashSize?: number;
}

export interface PathGroup {
  path: string;
  pathSlices: string[];
  indices: number[];
  count: number;
}

export interface TreeNode {
  name: string;
  children?: TreeNode[];
}

/**
 * Groups paths by their structure similarity
 */
export function groupPathsByStructure(paths: PathData[]): PathGroup[] {
  const pathGroups: PathGroup[] = [];
  
  paths.forEach(({ origin, pubkey, path, hashSize }, index) => {
    // Each hop identifier is hashSize bytes = 2*hashSize hex chars. Split the path
    // accordingly, and take the matching-length prefix of the origin pubkey as the
    // final hop so it's comparable to the in-path hop identifiers.
    const hopChars = 2 * (hashSize && hashSize > 0 ? hashSize : 1);
    const pathSlices = path.match(new RegExp(`.{1,${hopChars}}`, "g")) || [];
    const pubkeyPrefix = pubkey.substring(0, hopChars);
    const fullPathSlices = [...pathSlices, pubkeyPrefix];
    
    // Find existing group with same path structure
    const existingGroup = pathGroups.find(group => 
      group.pathSlices.length === fullPathSlices.length &&
      group.pathSlices.every((slice, i) => slice === fullPathSlices[i])
    );
    
    if (existingGroup) {
      existingGroup.indices.push(index);
      existingGroup.count++;
    } else {
      pathGroups.push({
        path: path + pubkeyPrefix,
        pathSlices: fullPathSlices,
        indices: [index],
        count: 1
      });
    }
  });

  return pathGroups;
}

/**
 * Builds a tree structure from path groups for visualization
 */
export function buildTreeFromPathGroups(pathGroups: PathGroup[], initiatingNodeKey?: string, hashSize?: number): TreeNode {
  const hopChars = 2 * (hashSize && hashSize > 0 ? hashSize : 1);
  const rootName = initiatingNodeKey ? initiatingNodeKey.substring(0, hopChars) : "??";
  const root: TreeNode = { name: rootName, children: [] };
  
  pathGroups.forEach(group => {
    let currentNode = root;
    
    group.pathSlices.forEach((slice) => {
      let child = currentNode.children?.find(c => c.name === slice);
      
      if (!child) {
        child = { name: slice, children: [] };
        if (!currentNode.children) currentNode.children = [];
        currentNode.children.push(child);
      }
      
      currentNode = child;
    });
  });
  
  return root;
}

/**
 * Extracts all unique prefixes from a tree structure
 */
export function extractUniquePrefixes(treeData: TreeNode | null): string[] {
  if (!treeData) return [];
  
  const prefixes = new Set<string>();
  
  const extractPrefixes = (node: TreeNode) => {
    prefixes.add(node.name);
    node.children?.forEach(extractPrefixes);
  };
  
  extractPrefixes(treeData);
  return Array.from(prefixes);
}
