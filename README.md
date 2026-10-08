# QuickNotes System Design

QuickNotes is growing from a browser-only note-taking app into an online service for 1 million people. This repository has two halves. The first is a small **API client** that proves the front end can talk to a real API, using the free JSONPlaceholder practice API to load, create and delete notes. The second is a set of **design documents** that the backend team can build from: the REST API, the database model, and the system architecture that keeps it fast and reliable at scale.

## Features of the API client

- **Load notes (GET):** fetches 10 notes and shows each title and body.
- **Create a note (POST):** validates the title (required, 100 characters at most), then sends it and shows the status code and new id.
- **Delete a note (DELETE):** every note has a Delete button.
- **Clear states for the user:** loading, success, error and empty messages, with different colours for success and error.
- **Safe and tidy:** buttons are disabled while a request is running, and note text is always inserted with `textContent`.

## How to run the API client

1. Clone the repository:
   ```bash
   git clone https://github.com/TitoKilonzo/quicknotes-system-design.git
   ```
2. Open the `quicknotes-system-design` folder in VS Code.
3. Right-click `index.html` and choose **Open with Live Server** (or just open `index.html` in your browser). You need an internet connection, because the notes come from `https://jsonplaceholder.typicode.com/posts`.
4. Click **Load notes**, add a note with the form, and try the Delete buttons.

**A note about the practice API:** JSONPlaceholder accepts requests and replies as if they worked, but it never actually saves or removes anything. A created note always comes back with the id `101`, and it will vanish when you reload the page. The code handles this and explains how in a comment in `api.js`.

## Design documents

- [API design](docs/api-design.md): the REST endpoints, request and response examples, and error codes.
- [Data model](docs/data-model.md): the four tables, relationships, `CREATE TABLE` statements, example queries, an index, and the SQL vs NoSQL decision.
- [Architecture](docs/architecture.md): requirements, load estimates, the diagram, the request flows, trade-offs and how single points of failure are avoided.

## Project files

```text
quicknotes-system-design/
├── index.html
├── style.css
├── api.js
├── README.md
└── docs/
    ├── api-design.md
    ├── data-model.md
    └── architecture.md
```

## What I learned

- How a front end talks to an API: one reusable `request()` function that calls `fetch`, checks `response.ok` and throws on errors keeps GET, POST and DELETE simple, and `try / catch / finally` makes sure buttons are always switched back on.
- A good UI shows every state: loading, success, error and empty. Without them, users cannot tell whether something worked.
- A practice API behaves differently from a real one. JSONPlaceholder gives every new note the same id, so I had to track notes on the page separately from the server's ids.
- REST API design is mostly consistent conventions: nouns for paths, HTTP methods for actions, correct status codes (201 for created, 204 for deleted, 401 versus 403) and one error format.
- Many-to-many relationships, like notes and tags, need a join table, and the right indexes depend on the queries the app runs most often.
- Scaling starts with estimating. The numbers (about 100 reads and 10 writes per second) show what the system really needs: a cache and a read replica, and no single point of failure.
