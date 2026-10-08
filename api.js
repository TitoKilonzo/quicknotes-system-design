// QuickNotes API client
// Talks to the JSONPlaceholder practice API. The real QuickNotes backend is
// designed in the docs/ folder.

const API_URL = "https://jsonplaceholder.typicode.com/posts";

const loadBtn = document.querySelector("#load-btn");
const statusEl = document.querySelector("#status");
const notesList = document.querySelector("#notes-list");

// The notes currently shown on the page, newest first.
let notes = [];

// ---------- Helpers ----------

// Show a message in #status. Type is "loading", "success" or "error".
function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type ? `status ${type}` : "status";
}

// Disable (or re-enable) every button while a request is running.
function setBusy(isBusy) {
  for (const button of document.querySelectorAll("button")) {
    button.disabled = isBusy;
  }
}

// One reusable function for every request: it calls fetch, checks
// response.ok and throws when the server says something went wrong.
async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    ...options,
  });

  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }

  // Some successful replies have no body, so read the text first.
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}

// ---------- Drawing the list ----------

function createNoteItem(note) {
  const item = document.createElement("li");
  item.className = "note-card";

  const title = document.createElement("h3");
  title.textContent = note.title;

  const body = document.createElement("p");
  body.textContent = note.body || "(no text)";

  item.append(title, body);
  return item;
}

// Rebuild the list from the notes array. Shows an empty state if needed.
function render() {
  notesList.textContent = "";

  if (notes.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-message";
    empty.textContent = "No notes to show yet. Click “Load notes” to fetch some.";
    notesList.appendChild(empty);
    return;
  }

  for (const note of notes) {
    notesList.appendChild(createNoteItem(note));
  }
}

// ---------- GET: load notes ----------

async function loadNotes() {
  setBusy(true);
  showStatus("Loading notes...", "loading");

  try {
    const { data } = await request(`${API_URL}?_limit=10`);
    notes = data;
    render();
    showStatus(
      notes.length === 0
        ? "The server has no notes yet."
        : `Loaded ${notes.length} notes from the server.`,
      "success"
    );
  } catch (error) {
    showStatus("Sorry, we could not load your notes. Please check your connection and try again.", "error");
    console.error(error);
  } finally {
    setBusy(false);
  }
}

loadBtn.addEventListener("click", loadNotes);
render();
