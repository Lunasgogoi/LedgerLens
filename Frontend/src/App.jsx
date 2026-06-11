import { useState, useMemo, useRef } from 'react'
import axios from 'axios'
import ForceGraph2D from 'react-force-graph-2d'


// Add this right below your other useState declarations

function App() {
  const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
  const fgRef = useRef();

  const [address, setAddress] = useState('') // Defaults to Vitalik
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [highlightedNode, setHighlightedNode] = useState(null);
  // Add this under your existing state variables
  const [activeToken, setActiveToken] = useState('All');

  const handleFocusNode = (nodeId) => {
    const node = displayGraph.nodes.find(n => n.id === nodeId);
    if (node && fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 1000);
      fgRef.current.zoom(6, 1000);

      // --- NEW: Trigger the visual highlight ---
      setHighlightedNode(nodeId);
      setTimeout(() => {
        setHighlightedNode(null); // Turn it off after 2 seconds
      }, 1500);
    }
  };

  // Dynamically calculate which tokens are currently on the screen
  const availableTokens = useMemo(() => {
    const tokens = new Set(graphData.links.map(link => link.symbol || 'Tokens'));
    return ['All', ...Array.from(tokens)];
  }, [graphData.links]);

  // Create a computed version of the graph based on the selected filter
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const displayGraph = useMemo(() => {
    // 1. FILTERING (Only filter if not 'All')
    let filteredLinks = graphData.links;
    if (activeToken !== 'All') {
      filteredLinks = graphData.links.filter(link => (link.symbol || 'Tokens') === activeToken);
    }

    // 2. DEDUPLICATION (Fixes the double transaction bug)
    // Create a Set to remember which transaction hashes we've already drawn
    const seenHashes = new Set();
    filteredLinks = filteredLinks.filter(link => {
      if (seenHashes.has(link.hash)) {
        return false; // We already drew this exact transaction, skip it!
      }
      seenHashes.add(link.hash);
      return true;
    });

    // 3. NODE CLEANUP (Keep only nodes connected to the remaining links)
    const connectedNodeIds = new Set();
    filteredLinks.forEach(link => {
      connectedNodeIds.add(typeof link.source === 'object' ? link.source.id : link.source);
      connectedNodeIds.add(typeof link.target === 'object' ? link.target.id : link.target);
    });

    const filteredNodes = graphData.nodes.filter(node => connectedNodeIds.has(node.id));

    // 4. MULTIGRAPH CURVATURE MATH (Now runs unconditionally!)
    const pairCounts = {};

    // Pass 1: Count how many links exist between the exact same two wallets
    filteredLinks.forEach(link => {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      const pair = s < t ? `${s}-${t}` : `${t}-${s}`;

      if (!pairCounts[pair]) pairCounts[pair] = 0;
      pairCounts[pair]++;
      link.pairIndex = pairCounts[pair];
    });

    // Pass 2: Attach the total count to the link so the graph knows how far to bend it
    filteredLinks.forEach(link => {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      const pair = s < t ? `${s}-${t}` : `${t}-${s}`;
      link.totalPairs = pairCounts[pair];
    });

    return { nodes: filteredNodes, links: filteredLinks };
  }, [graphData, activeToken]);

  const fetchGraphData = async () => {
    if (!address) return;

    setLoading(true);
    setError(null);

    try {
      // Hitting your local backend!
      // Use the live URL if it exists, otherwise fall back to localhost for local testing
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

      // Change your fetch calls to use the variable:
      const response = await axios.get(`${API_BASE_URL}/api/wallet/${address}`);

      if (response.data.message === "No transactions found") {
        setError("No transactions found for this wallet.");
        setGraphData({ nodes: [], links: [] });
      } else {
        setGraphData(response.data.graph);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to fetch data. Check if your backend is running.");
    } finally {
      setLoading(false);
    }
  }

  // Add this right below fetchGraphData
  const handleNodeClick = async (node) => {
    // Prevent re-fetching the root node
    if (node.id === address) return;

    setLoading(true);
    try {
      // Hit our Redis-cached backend!
      // Use the live URL if it exists, otherwise fall back to localhost for local testing
      const response = await axios.get(`${API_BASE_URL}/api/wallet/${node.id}`);

      if (response.data.message !== "No transactions found") {
        const newGraphData = response.data.graph;

        setGraphData(prevData => {
          // 1. Merge Nodes (Using a Map to prevent duplicates)
          const nodeMap = new Map(prevData.nodes.map(n => [n.id, n]));
          newGraphData.nodes.forEach(n => {
            if (!nodeMap.has(n.id)) nodeMap.set(n.id, n);
          });

          // 2. Merge Links (Using transaction hashes to prevent duplicate lines)
          const existingLinks = new Set(prevData.links.map(l => l.hash));
          const uniqueNewLinks = newGraphData.links.filter(l => !existingLinks.has(l.hash));

          return {
            nodes: Array.from(nodeMap.values()),
            links: [...prevData.links, ...uniqueNewLinks]
          };
        });
      }
    } catch (err) {
      console.error("Failed to expand node:", err);
    } finally {
      setLoading(false);
    }
  };

  // --- REAL-TIME GRAPH ANALYTICS ---
  const getNetworkStats = () => {
    if (graphData.nodes.length === 0) return null;

    let maxTx = { value: 0 };
    const degreeMap = {}; // Tracks how many connections each wallet has

    graphData.links.forEach(link => {
      // 1. Find the biggest transaction
      if (parseFloat(link.value) > parseFloat(maxTx.value)) {
        maxTx = link;
      }

      // 2. Calculate Degree Centrality (who is the busiest hub?)
      // Note: ForceGraph changes source/target from strings to objects after rendering, so we handle both
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      degreeMap[sourceId] = (degreeMap[sourceId] || 0) + 1;
      degreeMap[targetId] = (degreeMap[targetId] || 0) + 1;
    });

    // Find the wallet with the highest degree (most connections)
    let mostActiveWallet = null;
    let maxDegree = 0;
    for (const [wallet, count] of Object.entries(degreeMap)) {
      if (count > maxDegree) {
        maxDegree = count;
        mostActiveWallet = wallet;
      }
    }

    return {
      nodeCount: graphData.nodes.length,
      linkCount: graphData.links.length,
      maxTx,
      mostActiveWallet,
      maxDegree
    };
  };

  const stats = getNetworkStats();

  return (
    <div className="h-screen w-screen flex flex-col font-sans">

      {/* Top Search Bar */}
      <div className="absolute z-10 top-0 left-0 w-full p-4 bg-gray-900/80 backdrop-blur-md border-b border-gray-800 flex justify-center items-center gap-4">
        <h1 className="text-xl font-bold text-blue-400">LedgerLens</h1>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-96 px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-blue-500"
          placeholder="Enter 0x Wallet Address..."
        />
        <button
          onClick={fetchGraphData}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold transition-colors disabled:opacity-50"
        >
          {loading ? 'Scanning...' : 'Analyze'}
        </button>
      </div>

      {/* Analytics Sidebar */}
      {stats && (
        <div className="absolute z-10 top-24 right-6 w-80 bg-gray-900/80 backdrop-blur-md border border-gray-700 rounded-xl p-5 shadow-2xl text-sm">
          <h2 className="text-lg font-bold text-white mb-4 border-b border-gray-700 pb-2">Network Analytics</h2>

          {/* NEW: Token Filter Dropdown */}
          <div className="mb-4">
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">Filter by Asset</label>
            <select
              value={activeToken}
              onChange={(e) => setActiveToken(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded focus:ring-blue-500 focus:border-blue-500 block p-2 outline-none"
            >
              {availableTokens.map(token => (
                <option key={token} value={token}>{token}</option>
              ))}
            </select>
          </div>
          <h2 className="text-lg font-bold text-white mb-4 border-b border-gray-700 pb-2">Network Analytics</h2>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Wallets Tracked</span>
              <span className="font-mono font-bold text-blue-400">{stats.nodeCount}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-400">Total Transactions</span>
              <span className="font-mono font-bold text-blue-400">{stats.linkCount}</span>
            </div>

            <div
              className="bg-gray-800/50 p-3 rounded-lg border border-gray-700/50 mt-2 cursor-pointer hover:bg-gray-700/80 transition-colors"
              onClick={() => {
                if (stats.maxTx) {
                  // react-force-graph mutates the source string into an object, so we check for both
                  const senderId = typeof stats.maxTx.source === 'object' ? stats.maxTx.source.id : stats.maxTx.source;
                  handleFocusNode(senderId);
                }
              }}
            >
              <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Highest Value Transfer</span>
              <span className="font-mono text-green-400 font-bold text-lg">
                {stats.maxTx.value} {stats.maxTx.symbol || 'Tokens'}
              </span>
            </div>

            <div
              className="bg-gray-800/50 p-3 rounded-lg border border-gray-700/50 mt-4 cursor-pointer hover:bg-gray-700/80 transition-colors"
              onClick={() => {
                if (stats.mostActiveWallet) {
                  handleFocusNode(stats.mostActiveWallet);
                }
              }}
            >
              <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Central Hub (Most Active)</span>
              <span className="font-mono text-gray-300 text-xs truncate block w-full" title={stats.mostActiveWallet}>
                {stats.mostActiveWallet.substring(0, 8)}...{stats.mostActiveWallet.substring(38)}
              </span>

              <span className="text-xs text-gray-500 mt-1 block">
                {stats.maxDegree} direct connections
              </span>
            </div>
          </div>
        </div>
      )}


      {/* Error Message */}
      {error && (
        <div className="absolute z-10 top-20 left-1/2 -translate-x-1/2 bg-red-500/20 text-red-400 px-4 py-2 rounded border border-red-500/50">
          {error}
        </div>
      )}

      {/* The Physics Graph Canvas */}
      <div className="grow flex items-center justify-center">
        {graphData.nodes.length === 0 && !loading && !error ? (
          <div className="text-gray-500 text-lg flex flex-col items-center">
            <svg className="w-16 h-16 mb-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <p>Enter a 0x wallet address to map its network</p>
          </div>
        ) : (
          graphData.nodes.length > 0 && (

            <ForceGraph2D
              ref={fgRef}
              graphData={displayGraph}
              nodeLabel="id"
              linkLabel={(link) => `${link.value} ${link.symbol || 'Tokens'}`}
              linkCurvature={link => {
                if (link.totalPairs <= 1) return 0;
                const offset = (link.pairIndex % 2 === 0 ? 1 : -1) * (Math.floor(link.pairIndex / 2) * 0.15);
                return offset;
              }}

              // --- Updated Elegant Visual Flags ---
              nodeColor={(node) => {
                // Priority 0: Is the graph currently in "flash" mode and is this NOT the target?
                // Make all other nodes transparent faded blue.
                if (highlightedNode && node.id !== highlightedNode) {
                  return 'rgba(59, 130, 246, 0.1)'; // Barely visible translucent blue
                }

                // Priority 1: Is this the FLASH TARGET? Make it glowing Vibrant Teal!
                if (node.id === highlightedNode) return '#14b8a6'; // Vibrant Teal glow

                // Priority 2: DFS Cycle (preserve bad loop indicators)
                if (node.isCycle) return '#ef4444'; // Red

                // Priority 3: Color based on ML Behavioral Profiles
                if (node.profile === 'Whale') return '#fbbf24'; // Gold Whale
                if (node.profile === 'Bot') return '#9ca3af';   // Grey Bot

                // Default: Standard Retail User
                return '#3b82f6'; // Blue
              }}

              nodeVal={(node) => {
                // --- FIXED SIZES ---
                // Give it a temporary size bump while it's flashing
                if (node.id === highlightedNode) return 5; // Smaller size 5 highlight (was 8)

                // Regular sizes, scaled down to look elegant again.
                if (node.profile === 'Whale') return 3;   // Whales are 3x normal
                if (node.profile === 'Bot') return 0.5;   // Bots are tiny
                return 1.5;                               // Retail is standard
              }}

              // ... keep linkColor, widths, particles, onNodeClick, onNodeHover exactly the same
              linkColor={(link) => link.isCycle ? '#ef4444' : '#4b5563'}
              linkWidth={(link) => link.isCycle ? 2.5 : 1.5}
              linkDirectionalParticles={3}
              linkDirectionalParticleSpeed={0.005}
              linkDirectionalParticleColor={(link) => link.isCycle ? '#ef4444' : '#9ca3af'}
              linkDirectionalParticleWidth={2}
              linkDirectionalArrowLength={3.5}
              linkDirectionalArrowRelPos={1}
              enableNodeDrag={true}
              enableZoomPanInteraction={true}
              onNodeClick={handleNodeClick}
              onNodeHover={node => document.body.style.cursor = node ? 'pointer' : null}
            />
          )
        )}

      </div>

    </div>
  )
}

export default App