// backend/utils/graphEngine.js

function detectCycles(nodes, links) {
    // 1. Build an Adjacency List for fast lookups
    const adjList = {};
    nodes.forEach(n => adjList[n.id] = []);
    links.forEach((link, index) => {
        if (!adjList[link.source]) adjList[link.source] = [];
        adjList[link.source].push({ target: link.target, linkIndex: index });
    });

    const visited = new Set();
    const visitingStack = new Set();
    const cycleNodes = new Set();
    const cycleLinks = new Set();

    // 2. The standard DFS traversal for directed graphs
    function dfs(nodeId) {
        if (visitingStack.has(nodeId)) return true; // Cycle detected!
        if (visited.has(nodeId)) return false;      // Already processed

        visited.add(nodeId);
        visitingStack.add(nodeId);

        let participatesInCycle = false;
        const neighbors = adjList[nodeId] || [];

        for (let edge of neighbors) {
            // If the neighbor is currently in the stack, it's a back-edge (a loop)
            if (visitingStack.has(edge.target)) {
                cycleLinks.add(edge.linkIndex);
                cycleNodes.add(nodeId);
                cycleNodes.add(edge.target);
                participatesInCycle = true;
            } else if (!visited.has(edge.target)) {
                // Recursively check deeper
                if (dfs(edge.target)) {
                    cycleLinks.add(edge.linkIndex);
                    cycleNodes.add(nodeId);
                    participatesInCycle = true;
                }
            }
        }

        visitingStack.delete(nodeId);
        return participatesInCycle;
    }

    // 3. Run DFS on every node (in case of disconnected graph islands)
    nodes.forEach(n => {
        if (!visited.has(n.id)) dfs(n.id);
    });

    // 4. Mutate the original arrays to flag the bad actors
    nodes.forEach(n => { if (cycleNodes.has(n.id)) n.isCycle = true; });
    links.forEach((l, index) => { if (cycleLinks.has(index)) l.isCycle = true; });
}

function transformToGraph(transactions) {
    const uniqueNodes = new Set();
    const links = [];

    transactions.forEach(tx => {
        uniqueNodes.add(tx.from);
        uniqueNodes.add(tx.to);

        links.push({
            source: tx.from,
            target: tx.to,
            value: parseFloat(tx.value),
            symbol: tx.symbol, 
            hash: tx.hash
        });
    });

    const formattedNodes = Array.from(uniqueNodes).map(nodeId => ({ id: nodeId }));

    // RUN THE ALGORITHM BEFORE SENDING TO CLIENT
    detectCycles(formattedNodes, links);

    return { nodes: formattedNodes, links: links };
}

module.exports = { transformToGraph };