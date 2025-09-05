/**
 * @file This script handles the frontend logic for the Development Event Tracker.
 * It communicates with the backend API to fetch and display development events
 * in a chronological timeline, and supports filtering of those events.
 */

(function() {
  // --- CONFIGURATION ---
  const config = {
    API_BASE_URL: "http://localhost:8080",
  };

  // --- DOM ELEMENT REFERENCES ---
  const appLoadingEle = document.getElementById("app-loading-display");
  const timelineContainerEle = document.getElementById("timeline-container");
  const filterFormEle = document.getElementById("filter-form");
  const sourceFilterEle = document.getElementById("source-filter");
  const eventTypeFilterEle = document.getElementById("event-type-filter");

  /**
   * Fetches the list of events from the backend API and triggers rendering.
   * @param {Object} filters - An object containing filter parameters.
   * @param {string} [filters.source] - The source to filter by.
   * @param {string} [filters.eventType] - The event type to filter by.
   */
  function fetchEvents(filters = {}) {
    const { source, eventType } = filters;
    const queryParams = new URLSearchParams();
    if (source) {
      queryParams.append("source", source);
    }
    if (eventType) {
      queryParams.append("event_type", eventType);
    }

    const queryString = queryParams.toString();
    const fetchUrl = `${config.API_BASE_URL}/events${queryString ? `?${queryString}` : ''}`;

    // Show loading indicator before fetching
    appLoadingEle.classList.remove("d-none");
    timelineContainerEle.classList.add("d-none");

    fetch(fetchUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(events => renderTimeline(events))
      .catch((e) => {
        console.error("Failed to fetch events.", e);
        displayError(e);
      });
  }

  /**
   * Renders the fetched events into a timeline format.
   * @param {Array<Object>} events - An array of event objects from the backend.
   */
  function renderTimeline(events) {
    appLoadingEle.classList.add("d-none");
    timelineContainerEle.classList.remove("d-none");

    // Clear any existing content
    while (timelineContainerEle.firstChild) {
      timelineContainerEle.removeChild(timelineContainerEle.firstChild);
    }

    if (!events || events.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "alert alert-info";
      emptyState.textContent = "No development events match the current filters.";
      timelineContainerEle.appendChild(emptyState);
      return;
    }

    // Create and append a card for each event.
    events.forEach(event => {
      const card = document.createElement("div");
      card.className = "card mb-3";

      const cardBody = document.createElement("div");
      cardBody.className = "card-body";

      const title = document.createElement("h5");
      title.className = "card-title";
      title.textContent = `${event.source}: ${event.event_type}`;

      const subtitle = document.createElement("h6");
      subtitle.className = "card-subtitle mb-2 text-muted";
      subtitle.textContent = new Date(event.timestamp).toLocaleString();

      const dataPre = document.createElement("pre");
      dataPre.className = "bg-light p-2 rounded";
      dataPre.textContent = JSON.stringify(event.data, null, 2);

      cardBody.appendChild(title);
      cardBody.appendChild(subtitle);
      cardBody.appendChild(dataPre);
      card.appendChild(cardBody);
      timelineContainerEle.appendChild(card);
    });
  }

  /**
   * Handles the submission of the filter form.
   * @param {Event} e - The form submission event.
   */
  function handleFilterSubmit(e) {
    e.preventDefault();
    const source = sourceFilterEle.value.trim();
    const eventType = eventTypeFilterEle.value.trim();
    fetchEvents({ source, eventType });
  }

  /**
   * Displays an error message to the user.
   * @param {Error} err - The error object to display.
   */
  function displayError(err) {
    appLoadingEle.classList.remove("d-none");
    timelineContainerEle.classList.add("d-none");
    appLoadingEle.innerHTML = `<div class="alert alert-danger"><strong>Error:</strong> Could not load events. Is the backend server running? <br><small>${err.message}</small></div>`;
  }

  // --- INITIALIZATION ---
  filterFormEle.addEventListener("submit", handleFilterSubmit);
  // Start the application by fetching all events.
  fetchEvents();
})();