// backend/utils/graphEngine.js
const { kmeans } = require('ml-kmeans');

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

    // --- STEP 1: RUN DFS CYCLE DETECTION ---
    detectCycles(formattedNodes, links);

    // --- STEP 2: RUN K-MEANS BEHAVIORAL PROFILING ---
    // Extract features: [Transaction Count, Total Volume]
    const mlData = formattedNodes.map(node => {
        const nodeTxs = links.filter(link => link.source === node.id || link.target === node.id);
        const txCount = nodeTxs.length;
        const totalValue = nodeTxs.reduce((sum, tx) => sum + (parseFloat(tx.value) || 0), 0);
        return [txCount, totalValue];
    });

    // Normalize the data (0 to 1 scale) so value doesn't overpower count
    const maxTx = Math.max(...mlData.map(d => d[0])) || 1;
    const maxValue = Math.max(...mlData.map(d => d[1])) || 1;
    const normalizedData = mlData.map(d => [d[0] / maxTx, d[1] / maxValue]);

    // Apply clustering if we have enough nodes
    if (normalizedData.length >= 3) {
        const ans = kmeans(normalizedData, 3, { initialization: 'kmeans++' });
        
        formattedNodes.forEach((node, index) => {
            const stats = mlData[index];
            
            // Assign heuristic labels based on normalized behavior
            if (stats[0] > (maxTx * 0.7) && stats[1] < (maxValue * 0.3)) {
                node.profile = 'Bot'; 
            } else if (stats[1] > (maxValue * 0.5)) {
                node.profile = 'Whale'; 
            } else {
                node.profile = 'Retail'; 
            }
        });
    }

    return { nodes: formattedNodes, links: links };
}

module.exports = { transformToGraph };