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

// Gives every note created on this page its own identity (see deleteNote).
let nextKey = 1;

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

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "delete-btn";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => deleteNote(note));

  item.append(title, body, deleteBtn);
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

// ---------- DELETE: remove a note ----------

// JSONPlaceholder is a practice API: it ACCEPTS our requests and replies as if
// they worked, but it never really saves or removes anything. Two things follow:
//
// 1. Every note we create is answered with the same id (101), so we cannot use
//    the server's id to tell our notes apart. Each note we create therefore
//    gets its own client-side "key", and the list is updated by key.
// 2. A note we created locally does not exist on the server. A real API would
//    answer 404 when asked to delete it, so a 404 for such a note is treated
//    as "already gone" and the note is simply removed from the list.
//
// For every other note we send a real DELETE /posts/{id} request, and the note
// only disappears from the page once the server says OK.
async function deleteNote(note) {
  setBusy(true);
  showStatus("Deleting note...", "loading");

  try {
    await request(`${API_URL}/${note.id}`, { method: "DELETE" });
    removeFromList(note);
    showStatus("Note deleted.", "success");
  } catch (error) {
    if (error.status === 404 && note.key !== undefined) {
      removeFromList(note);
      showStatus("Note deleted (it only existed on this page).", "success");
    } else {
      showStatus("Sorry, we could not delete that note. Please try again.", "error");
      console.error(error);
    }
  } finally {
    setBusy(false);
  }
}

function removeFromList(note) {
  notes = notes.filter((item) => item !== note);
  render();
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
    notes.unshift({ ...data, key: nextKey++ });
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
