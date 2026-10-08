// QuickNotes API client
// Talks to the JSONPlaceholder practice API. The real QuickNotes backend is
// designed in the docs/ folder.

const API_URL = "https://jsonplaceholder.typicode.com/posts";

const loadBtn = document.querySelector("#load-btn");
const statusEl = document.querySelector("#status");
const notesList = document.querySelector("#notes-list");
const noteForm = document.querySelector("#note-form");
const titleInput = document.querySelector("#title-input");
const bodyInput = document.querySelector("#body-input");

const MAX_TITLE_LENGTH = 100;

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

// ---------- POST: create a note ----------

// Returns an error message, or "" when the title is fine.
function validateTitle(title) {
  if (title === "") {
    return "Please give your note a title.";
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return `The title must be ${MAX_TITLE_LENGTH} characters or fewer (it is ${title.length}).`;
  }
  return "";
}

async function createNote(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  const problem = validateTitle(title);
  if (problem) {
    showStatus(problem, "error");
    titleInput.focus();
    return;
  }

  setBusy(true);
  showStatus("Saving your note...", "loading");

  try {
    const { status, data } = await request(API_URL, {
      method: "POST",
      body: JSON.stringify({ title, body, userId: 1 }),
    });

    // Newest note goes to the top of the list.
    notes.unshift(data);
    render();
    noteForm.reset();
    showStatus(`Note created (status ${status}, id ${data.id}).`, "success");
  } catch (error) {
    showStatus("Sorry, we could not save your note. Please try again.", "error");
    console.error(error);
  } finally {
    setBusy(false);
  }
}

loadBtn.addEventListener("click", loadNotes);
noteForm.addEventListener("submit", createNote);
render();
