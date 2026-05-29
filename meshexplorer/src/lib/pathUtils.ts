export interface PathData {
  origin: string;
  pubkey: string;
  path: string;
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
  
  paths.forEach(({ origin, pubkey, path }, index) => {
    // Parse path into 2-character slices and include pubkey as final hop
    const pathSlices = path.match(/.{1,2}/g) || [];
    const pubkeyPrefix = pubkey.substring(0, 2);
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
export function buildTreeFromPathGroups(pathGroups: PathGroup[], initiatingNodeKey?: string): TreeNode {
  const rootName = initiatingNodeKey ? initiatingNodeKey.substring(0, 2) : "??";
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
