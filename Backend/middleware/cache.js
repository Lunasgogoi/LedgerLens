// backend/middleware/cache.js
const redisClient = require('../config/redis');

async function checkCache(req, res, next) {
    const { address } = req.params;

    try {
        // 1. Check if the graph data for this wallet already exists in Redis
        const cachedData = await redisClient.get(`wallet:${address}`);

        if (cachedData) {
            console.log(`⚡ CACHE HIT: Serving ${address} from Redis`);
            // Parse the stringified JSON back into an object and return immediately
            return res.json({
                message: "Graph data served from cache",
                graph: JSON.parse(cachedData),
                source: "Redis" // Helpful for debugging frontend later
            });
        }

        // 2. If not in cache (CACHE MISS), proceed to the main route logic
        console.log(`🐢 CACHE MISS: Fetching ${address} from Etherscan`);
        next();

    } catch (error) {
        console.error("Redis Error:", error);
        // If Redis crashes, don't crash the app. Just skip the cache and go to Etherscan.
        next(); 
    }
}

module.exports = { checkCache };