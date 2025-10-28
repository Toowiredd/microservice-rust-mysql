# Development Event Tracker

This repository contains a proof-of-concept for an "Intelligent Development Tracker". It's a full-stack application composed of a Rust backend service and a simple JavaScript frontend.

The core idea is to provide a central service that can ingest and store various development-related events from multiple sources (e.g., AI assistant hooks, shell commands, logs). This creates a searchable, chronological "development memory" that can be used for analysis, visualization, and building intelligent developer tools.

## Quickstart with Docker

The easiest way to get started is to use a version of Docker Desktop or Docker CLI with Wasm support.

* [Install Docker Desktop + Wasm (Beta)](https://docs.docker.com/desktop/wasm/)
* [Install Docker CLI + Wasm](https://github.com/chris-crone/wasm-day-na-22/tree/main/server)

Then, run the following command:

```bash
export BUILDX_NO_DEFAULT_ATTESTATIONS=1
docker compose up
```

This will build the Rust source code, run the Wasm server, start up a MySQL database, and serve the frontend via nginx.
- The backend API will be available at `http://localhost:8080`.
- The frontend web interface will be available at `http://localhost:8090`.

## API Endpoints

The service provides a simple REST API to ingest and retrieve development events.

### `GET /init`

Initializes the database. This drops the existing `events` table (if any) and creates a new one. You should run this once before using the service for the first time.

-   **Response `200 OK`**
    ```json
    {
      "status": "initialized"
    }
    ```
-   **Example**
    ```bash
    curl http://localhost:8080/init
    ```

### `POST /ingest`

Ingests a single new development event.

-   **Request Body**: A JSON object representing the event.
    - `timestamp`: An ISO 8601 string representing when the event occurred.
    - `source`: A string identifying the source of the event (e.g., "ClaudeHook").
    - `event_type`: A string identifying the type of event (e.g., "UserPromptSubmit").
    - `data`: An arbitrary JSON object containing the event's payload.

-   **Example**
    ```bash
    curl http://localhost:8080/ingest -X POST \
    -H "Content-Type: application/json" \
    -d '{
      "timestamp": "2025-09-04T08:30:00Z",
      "source": "ClaudeHook",
      "event_type": "PreToolUse",
      "data": {
        "tool_name": "run_in_bash_session",
        "tool_input": "ls -l"
      }
    }'
    ```
-   **Response `200 OK`**
    ```json
    {
      "status": "ingested"
    }
    ```

### `GET /events`

Retrieves a list of all stored development events, ordered with the most recent events first.

-   **Response `200 OK`**: A JSON array of event objects.
-   **Example**
    ```bash
    curl http://localhost:8080/events
    ```

## Frontend

The frontend, accessible at `http://localhost:8090`, provides a simple timeline view of the events stored in the database. It automatically fetches and displays the events from the `/events` endpoint, providing a real-time look at the development activity being tracked.
