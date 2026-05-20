// backend/config/redis.js
const { createClient } = require('redis');

// Initialize the Redis client using the Upstash URL
const redisClient = createClient({
    url: process.env.REDIS_URL
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Successfully connected to Upstash Redis!'));

// Connect immediately
redisClient.connect().catch(console.error);

module.exports = redisClient;