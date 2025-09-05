/**
 * @file This script handles the frontend logic for the Development Event Tracker.
 * It communicates with the backend API to fetch and display development events
 * in a chronological timeline, and supports filtering and searching of those events.
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
  const searchQueryEle = document.getElementById("search-query");

  /**
   * Fetches the list of events from the backend API and triggers rendering.
   * @param {Object} filters - An object containing filter parameters.
   * @param {string} [filters.source] - The source to filter by.
   * @param {string} [filters.eventType] - The event type to filter by.
   * @param {string} [filters.query] - The search term to query for.
   */
  function fetchEvents(filters = {}) {
    const { source, eventType, query } = filters;
    const queryParams = new URLSearchParams();
    if (source) queryParams.append("source", source);
    if (eventType) queryParams.append("event_type", eventType);
    if (query) queryParams.append("q", query);

    const queryString = queryParams.toString();
    const fetchUrl = `${config.API_BASE_URL}/events${queryString ? `?${queryString}` : ''}`;

    appLoadingEle.classList.remove("d-none");
    timelineContainerEle.classList.add("d-none");

    fetch(fetchUrl)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      })
      .then(renderTimeline)
      .catch(displayError);
  }

  /**
   * Renders the fetched events into a timeline format.
   * @param {Array<Object>} events - An array of event objects from the backend.
   */
  function renderTimeline(events) {
    appLoadingEle.classList.add("d-none");
    timelineContainerEle.classList.remove("d-none");

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

    events.forEach(event => {
      const card = document.createElement("div");
      card.className = "card mb-3";

      const cardBody = document.createElement("div");
      cardBody.className = "card-body";

      const title = document.createElement("h5");
      title.className = "card-title";

      const sourceLink = createFilterLink(event.source, 'source');
      const typeLink = createFilterLink(event.event_type, 'eventType');

      title.appendChild(sourceLink);
      title.append(": ");
      title.appendChild(typeLink);

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
   * Creates a clickable link that applies a filter when clicked.
   * @param {string} text - The text content of the link.
   * @param {'source' | 'eventType'} filterType - The type of filter to apply.
   * @returns {HTMLAnchorElement} The created link element.
   */
  function createFilterLink(text, filterType) {
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = text;
      link.onclick = (e) => {
          e.preventDefault();
          if (filterType === 'source') {
              sourceFilterEle.value = text;
              eventTypeFilterEle.value = '';
          } else {
              sourceFilterEle.value = '';
              eventTypeFilterEle.value = text;
          }
          searchQueryEle.value = '';
          handleFilterSubmit(e);
      };
      return link;
  }

  /**
   * Handles the submission of the filter/search form.
   * @param {Event} e - The form submission event.
   */
  function handleFilterSubmit(e) {
    e.preventDefault();
    const source = sourceFilterEle.value.trim();
    const eventType = eventTypeFilterEle.value.trim();
    const query = searchQueryEle.value.trim();
    fetchEvents({ source, eventType, query });
  }

  /**
   * Displays an error message to the user.
   * @param {Error} err - The error object to display.
   */
  function displayError(err) {
    console.error("An error occurred:", err);
    appLoadingEle.classList.remove("d-none");
    timelineContainerEle.classList.add("d-none");
    appLoadingEle.innerHTML = `<div class="alert alert-danger"><strong>Error:</strong> Could not load events. Is the backend server running? <br><small>${err.message}</small></div>`;
  }

  // --- INITIALIZATION ---
  filterFormEle.addEventListener("submit", handleFilterSubmit);
  fetchEvents();
})();