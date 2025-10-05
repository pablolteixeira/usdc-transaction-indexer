# USDC Transfer Indexer

This project is a robust and fault-tolerant indexer for tracking USDC `Transfer` events on the Ethereum blockchain. It listens for new events, stores them in a persistent database, and exposes a REST API to query the indexed data. The system is designed for high reliability, capable of handling network interruptions, service restarts, and blockchain reorganizations without data loss or corruption.

## Table of Contents

-   [Getting Started](#getting-started)
    -   [Prerequisites](#prerequisites)
    -   [Setup](#setup)
-   [Running Tests](#running-tests)
-   [API Documentation](#api-documentation)
-   [System Design & Fault Tolerance](#system-design--fault-tolerance)

## Getting Started

Follow these instructions to get the indexer and its associated services up and running on your local machine.

### Prerequisites

-   [Docker](https://www.docker.com/products/docker-desktop/) and Docker Compose
-   [Node.js](https://nodejs.org/en) and npm (for running tests)
-   An Ethereum RPC provider URL (e.g., from Alchemy, Infura, or a self-hosted node)

### Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/pablolteixeira/usdc-transaction-indexer.git
    cd usdc-transaction-indexer
    ```

2.  **Configure environment variables:**
    Create a `.env` file in the root of the project by copying the example file:
    ```bash
    cp .env.example .env
    ```
    Now, edit the `.env` file and add your Ethereum RPC provider URL:
    ```env
    RPC_URL="YOUR_ETHEREUM_RPC_PROVIDER_URL_HERE"
    ```

3.  **Build and run the services:**
    Use Docker Compose to build the application images and start the containers.

    First, build the images. The `--no-cache` flag is recommended for the first build to ensure all dependencies are fetched cleanly.
    ```bash
    docker compose build --no-cache
    ```

    Next, start the services in detached mode. This will run the indexer, the API server, and the database in the background.
    ```bash
    docker compose up -d
    ```

    The API should now be accessible at `http://localhost:3000`.

## Running Tests

The project includes a suite of tests to verify the functionality of its components. To run the tests, execute the following command from the project's root directory:

```bash
npm install
npm run test
```

This will run all unit and integration tests and output the results to your console.

## API Documentation

This document provides an overview of the USDC Indexer API, its endpoints, and how to interact with them.

### Interactive API Console (Swagger UI)

The easiest way to explore and test the API is through our interactive Swagger UI documentation. Once the application is running, this interface is available at:

**[http://localhost:3000/api-docs](http://localhost:3000/api-docs)**

The interactive console allows you to:

-   View a complete list of available API endpoints.
-   See detailed information about each endpoint, including required parameters and request body structures.
-   Inspect example request and response models.
-   Execute live API requests directly from your browser.

### Base URL

All API endpoints are available under the following base URL:

```
http://localhost:3000/api/v1
```

### Rate Limiting

To ensure service stability, the API employs rate limiting. If you send too many requests in a short period, you will receive an `HTTP 429 Too Many Requests` response.

The response headers will indicate the current limit (`X-RateLimit-Limit`), the number of requests remaining (`X-RateLimit-Remaining`), and when you can try again (`Retry-After`).

### Common Data Models

#### Transfer Object

Represents a single USDC transfer event.

```json
{
    "id": 123,
    "fromAddress": "0x...",
    "toAddress": "0x...",
    "amount": "10000000",
    "transactionHash": "0x...",
    "blockNumber": 18000000,
    "blockTimestamp": "2023-10-27T10:30:00.000Z",
    "logIndex": 45
}
```

#### Paginated Response

Endpoints that return a list of items will use a paginated structure.

```json
{
    "data": [
        // ... an array of objects (e.g., Transfer Objects)
    ],
    "meta": {
        "total": 1234,
        "page": 1,
        "limit": 20,
        "totalPages": 62
    }
}
```

### Core Endpoints

This is a high-level overview of the main API functionalities.

| Method | Endpoint                       | Description                                            | Authentication |
| :----- | :----------------------------- | :----------------------------------------------------- | :------------- |
| `GET`  | `/transfers`                   | Query and filter all indexed transfers. Supports pagination. | Public         |
| `GET`  | `/transfers/balance/{address}` | Get the calculated USDC balance for a specific wallet. | Public         |
| `GET`  | `/transfers/history/{address}` | Get the transfer history for a specific wallet.        | Public         |

## System Design & Fault Tolerance

This indexer is designed for high reliability and guarantees data integrity by implementing several key fault tolerance mechanisms.

### 1. Resume Indexing from Last Successful Block

The core of the indexer's reliability is its ability to survive crashes and restarts without skipping or duplicating data.

-   **Problem:** A simple indexer that stores its progress in memory will suffer from "amnesia" on restart, causing it to re-process old blocks or miss blocks that occurred during downtime.
-   **Solution:** The indexer's "memory" is stored persistently in the database in an `IndexerState` table.
-   **Mechanism:**
    1.  At the start of every processing cycle, the indexer first reads the `lastProcessedBlock` from the database.
    2.  After fetching and processing new data, it saves both the new `Transfer` records and the updated `lastProcessedBlock` state within a single **atomic database transaction**.
-   **Outcome:** This guarantees that the state is only updated if the data is successfully saved. If the service crashes at any point, it will simply restart, read the last known good state from the database, and continue exactly where it left off.

### 2. Handle Network Interruptions Gracefully

Network calls to the blockchain RPC provider are inherently unreliable. The indexer uses a two-layer defense to handle these failures.

-   **Mechanism (Layer 1): Retry Logic with Exponential Backoff**
    -   Every RPC call (e.g., `getBlock`, `queryFilter`) is wrapped in a `retryRpcCall` helper function.
    -   If a call fails with a transient network error (like a timeout, rate limit, or DNS issue), the helper will automatically wait and try again.
    -   The delay between retries increases exponentially (e.g., 1s, 2s, 4s...) to give the network or provider time to recover. This handles short-lived interruptions within a single processing cycle.

-   **Mechanism (Layer 2): The Polling Loop**
    -   If the immediate retries fail after several attempts, the entire processing cycle is aborted, and an error is logged.
    -   The indexer then simply waits for the next scheduled poll (e.g., 20 seconds later) to try the whole process again, starting from the last successful block stored in the database.
-   **Outcome:** The indexer can survive both brief network blips and longer outages (minutes or hours) without requiring manual intervention.

### 3. Manage Blockchain Reorganizations (Reorgs)

Blockchains are not always final. A reorg can occur where the last few blocks are discarded and replaced with a different version of history, leaving stale data in the indexer's database.

-   **Problem:** The indexer's database can fall out of sync with the canonical chain, containing data from orphaned (discarded) blocks.
-   **Solution:** A "Detect and Rollback" strategy is implemented.
-   **Mechanism:**
    1.  **Detection:** In addition to the block number, the indexer stores the `lastProcessedBlockHash` in its state. At the start of each cycle, it verifies that this hash still exists on the live chain at the expected block height. A mismatch indicates a reorg.
    2.  **Rollback:** When a reorg is detected, the `handleReorg` function is triggered. It finds a recent, stable "common ancestor" block that exists on both chains. It then runs a `DELETE` query to remove all transfer records from the database that came after this ancestor block and resets its state.
-   **Outcome:** The indexer automatically self-heals by purging stale data and reprocessing the new, correct blocks, ensuring the database always reflects the true state of the blockchain.