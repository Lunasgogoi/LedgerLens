# 🔍 LedgerLens

**LedgerLens** is a full-stack, AI-driven blockchain forensics and data visualization platform. It transforms raw, tabular Ethereum transaction histories into interactive, force-directed network graphs, allowing users to visually track capital flows, detect malicious wash-trading rings, and identify key network participants using machine learning.

[![LedgerLens Banner](https://res.cloudinary.com/dkzrxdwmq/image/upload/v1781182738/Screenshot_2026-06-11_182825_hqqoeo.png)](https://your-target-url.com)

## ✨ Key Features

* **Interactive Force-Directed Graphing:** Visualizes complex transaction webs using a custom 2D physics engine, supporting dynamic node clustering, panning, and zooming.
* **Algorithmic Wash-Trade Detection:** Implements a custom Depth-First Search (DFS) algorithm on the backend to dynamically detect and visually flag cyclic financial anomalies (e.g., tumbling rings and wash trading) in real-time.
* **Machine Learning Behavioral Profiling:** Utilizes K-Means clustering to normalize and analyze transaction volume vs. frequency, automatically classifying wallets into actionable profiles (`Whales`, `Trading Bots`, and `Retail Users`).
* **High-Performance Caching:** Architected with a Redis Read-Through Caching layer to mitigate third-party API rate limits, eliminating redundant compute cycles and significantly reducing latency for previously queried data.
* **Client-Side Token Filtering:** Optimized complex React state management utilizing `useMemo` to allow instant, localized filtering of specific ERC-20 token flows without triggering new network requests.
* **Multigraph Edge Resolution:** Dynamically calculates edge curvature to mathematically separate and render multiple transactions between the exact same entities.

## 🛠️ Tech Stack

**Frontend:**
* React.js
* Tailwind CSS
* `react-force-graph` (WebGL 2D rendering)

**Backend:**
* Node.js / Express
* `ml-kmeans` (Data clustering)
* Redis (Caching Layer)
* Etherscan API (On-chain data ingestion)

## 🚀 Getting Started

### Prerequisites
* Node.js (v16+)
* A running local instance of Redis (or a Redis cloud URL)
* An Etherscan API Key

### Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/Lunasgogoi/LedgerLens.git](https://github.com/Lunasgogoi/LedgerLens.git)
   cd LedgerLens
   ```
2. **Setup the Backend:**
   ```bash
   cd backend
   npm install

   ```
   Create a .env file in the backend directory:

   ```bash
   PORT=5000
   ETHERSCAN_API_KEY=your_etherscan_api_key
   REDIS_URL=redis://localhost:6379

   ```

   Start the server:

   ```bash

   npm start
   ```
3. **Setup the Frontend:**
   ```bash
    cd frontend
    npm install
   ```
   Create a .env file in the frontend directory:

   ```bash

   VITE_BACKEND_URL=http://localhost:5000

   ```

   Start the development server:

   ```bash

   npm run dev

   ```


## Architecture Overview

The DFS Cycle Detection (Security)
To identify potential wash trading, the backend builds an adjacency list of all queried transactions.
A directed Depth-First Search (DFS) algorithm traverses the network, maintaining a visitingStack to detect back-edges.
If a node attempts to send capital to an ancestor node actively in the current traversal path, a cycle is flagged,
and the frontend highlights the involved wallets and transactions in bright red.

## K-Means Profiling (Analytics)
The backend intercepts standard graph data and extracts a 2D feature array for each wallet: [Transaction Count, Total Volume].
The data is normalized to a 0-to-1 scale to prevent massive token values from overshadowing transaction frequency.
A K-Means algorithm ($k=3$) clusters the nodes, appending a behavioral profile to the payload. The React frontend interprets these flags, 
dynamically adjusting node volume and color (e.g., Gold Whales, Grey Bots).

## Author
Lunas Gogoi,
NIT Silchar
