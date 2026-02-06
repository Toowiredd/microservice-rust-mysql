#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Test Data ---
TEST_EVENTS_FILE="test_events.json"

# --- Helper Functions ---
function start_services {
    echo "Starting services..."
    sudo docker compose up -d
    echo "Waiting for services to become healthy..."
    sleep 20
}

function stop_services {
    echo "Stopping services..."
    sudo docker compose down
}

function run_tests {
    echo "Initializing database..."
    curl -s --fail http://localhost:8080/init

    echo "Ingesting test data..."
    # Read the whole file and then iterate over each object
    jq -c '.[]' < "$TEST_EVENTS_FILE" | while IFS= read -r event; do
        curl -s --fail -X POST http://localhost:8080/ingest \
        -H "Content-Type: application/json" \
        -d "$event"
    done
    echo "Test data ingested."

    # --- Verification ---
    echo "--- Running API Tests ---"

    # 1. Test fetching all events
    echo "Test 1: Fetching all events"
    all_events=$(curl -s http://localhost:8080/events)
    count=$(echo "$all_events" | jq '. | length')
    if [ "$count" -eq 4 ]; then
        echo "  [SUCCESS] Found 4 events as expected."
    else
        echo "  [FAILURE] Expected 4 events, but found $count."
        exit 1
    fi

    # 2. Test filtering by source
    echo "Test 2: Filtering by source=Shell"
    shell_events=$(curl -s "http://localhost:8080/events?source=Shell")
    count=$(echo "$shell_events" | jq '. | length')
    if [ "$count" -eq 2 ]; then
        echo "  [SUCCESS] Found 2 events for source 'Shell' as expected."
    else
        echo "  [FAILURE] Expected 2 events for source 'Shell', but found $count."
        exit 1
    fi

    # 3. Test searching by query
    echo "Test 3: Searching for q=database"
    db_events=$(curl -s "http://localhost:8080/events?q=database")
    count=$(echo "$db_events" | jq '. | length')
    if [ "$count" -eq 1 ]; then
        echo "  [SUCCESS] Found 1 event for query 'database' as expected."
    else
        echo "  [FAILURE] Expected 1 event for query 'database', but found $count."
        exit 1
    fi

    echo "--- All API Tests Passed ---"
}

# --- Main Execution ---
# Ensure services are stopped before starting, in case of a previous failed run
trap stop_services EXIT
start_services
run_tests
# The trap will automatically call stop_services on exit
