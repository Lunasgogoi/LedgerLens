// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { transformToGraph } = require('./utils/graphEngines');
const redisClient = require('./config/redis');
const { checkCache } = require('./middleware/cache');

const app = express();
app.use(cors());
app.use(express.json());

// Day 1: Raw Data Fetching Route
app.get('/api/wallet/:address', checkCache, async (req, res) => {
    try {
        const { address } = req.params;
        const apiKey = process.env.ETHERSCAN_API_KEY;

        // Etherscan API: Get normal transactions for an address
        // We limit to 10 offset to prevent massive data dumps on our first test
        // Upgraded to fetch ERC-20 Token Transfers instead of raw ETH
        const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=15&sort=desc&apikey=${apiKey}`;
        
        const response = await axios.get(url);
        
        if (response.data.status !== "1") {
            if (response.data.message === "No transactions found") {
                console.log(`No transactions found for ${address}. Returning empty graph.`);
                return res.json({ message: "No transactions found", graph: { nodes: [], links: [] } });
            }
            console.error("Etherscan Error Details:", response.data.result); 
            return res.status(400).json({ error: "NOTOK", reason: response.data.result });
        }

        const rawTransactions = response.data.result;

        // Clean the data: Now including Token Math
        const cleanedData = rawTransactions.map(tx => {
            // Tokens use different decimals (e.g., USDC uses 6, UNI uses 18)
            const decimals = Number(tx.tokenDecimal) || 18;
            const actualValue = tx.value / Math.pow(10, decimals);
            
            return {
                from: tx.from,
                to: tx.to,
                value: actualValue.toFixed(2), 
                symbol: tx.tokenSymbol, // We can label the graph lines with this later!
                hash: tx.hash
            };
        });

        // Pass the data through our new Graph Engine
        const graphData = transformToGraph(cleanedData);

        console.log(`Generated ${graphData.nodes.length} nodes and ${graphData.links.length} links.`);

        // --- NEW: Save the computed graph to Redis ---
        // Save it under the key "wallet:0x..." 
        // EX 86400 tells Redis to automatically delete this cache after 24 hours (86,400 seconds)
        await redisClient.set(`wallet:${address}`, JSON.stringify(graphData), {
            EX: 86400 
        });

        res.json({
            message: "Graph data generated successfully",
            graph: graphData,
            source: "Etherscan"
        });

    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ error: "Server Error" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`System Design Note: Redis Caching layer will be inserted here next.`);
});