# QuickNotes API Design

This is the API the backend team should build for the real QuickNotes service. (The client in this repository uses the JSONPlaceholder practice API only to prove the front end can talk to an API.)

## Conventions

- **Base path:** `/api/v1`. The version number lets us change the API later without breaking old apps.
- **Format:** every request and response body is JSON (`Content-Type: application/json`).
- **Resources are nouns, actions are HTTP methods.** We write `DELETE /notes/12`, not `/deleteNote?id=12`.
- **Authentication:** after logging in, the client sends `Authorization: Bearer <token>` with every request except register and login.
- **Ownership:** a user can only see and change their own notes.
- **Timestamps** are in ISO 8601 format, in UTC (for example `2026-10-08T14:30:00Z`).
- **Pagination:** list endpoints take `page` (default 1) and `limit` (default 20, maximum 100).

## Endpoints

| # | Method | Path | Description | Success status |
|---|--------|------|-------------|----------------|
| 1 | POST | `/api/v1/users` | Register a new user account | 201 Created |
| 2 | POST | `/api/v1/auth/login` | Log in and receive an access token | 200 OK |
| 3 | GET | `/api/v1/notes` | List the logged-in user's notes (supports `page`, `limit` and `tag` filters) | 200 OK |
| 4 | GET | `/api/v1/notes/{id}` | Get one note | 200 OK |
| 5 | POST | `/api/v1/notes` | Create a note | 201 Created |
| 6 | PUT | `/api/v1/notes/{id}` | Replace a note's title, body and tags | 200 OK |
| 7 | DELETE | `/api/v1/notes/{id}` | Delete a note | 204 No Content |
| 8 | GET | `/api/v1/tags` | List the logged-in user's tags | 200 OK |

## Examples

### 1. Register: `POST /api/v1/users`

Request:

```json
{
  "name": "Amina Wanjiru",
  "email": "amina@example.com",
  "password": "a-long-secret-password"
}
```

Response (`201 Created`). The password is never sent back:

```json
{
  "id": 42,
  "name": "Amina Wanjiru",
  "email": "amina@example.com",
  "created_at": "2026-10-08T14:30:00Z"
}
```

### 2. Log in: `POST /api/v1/auth/login`

Request:

```json
{
  "email": "amina@example.com",
  "password": "a-long-secret-password"
}
```

Response (`200 OK`):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600
}
```

### 3. List notes: `GET /api/v1/notes?page=1&limit=2&tag=work`

No request body. Response (`200 OK`):

```json
{
  "data": [
    {
      "id": 12,
      "title": "Email the project report",
      "body": "Send the final report to Grace before Friday.",
      "tags": ["work"],
      "created_at": "2026-10-08T09:15:00Z",
      "updated_at": "2026-10-08T09:15:00Z"
    },
    {
      "id": 9,
      "title": "Prepare Monday standup",
      "body": "",
      "tags": ["work", "meetings"],
      "created_at": "2026-10-06T16:40:00Z",
      "updated_at": "2026-10-07T08:00:00Z"
    }
  ],
  "page": 1,
  "limit": 2,
  "total": 14
}
```

If the user has no notes, `data` is an empty array (`[]`) and the status is still `200 OK`. An empty list is not an error.

### 4. Get one note: `GET /api/v1/notes/12`

No request body. Response (`200 OK`) is a single note, in the same shape as one item of `data` above.

### 5. Create a note: `POST /api/v1/notes`

Request. The title is required (1 to 100 characters), while `body` and `tags` are optional:

```json
{
  "title": "Buy milk and bread",
  "body": "Also check if the shop has eggs.",
  "tags": ["personal", "shopping"]
}
```

Response (`201 Created`), with a `Location: /api/v1/notes/57` header:

```json
{
  "id": 57,
  "title": "Buy milk and bread",
  "body": "Also check if the shop has eggs.",
  "tags": ["personal", "shopping"],
  "created_at": "2026-10-08T14:35:12Z",
  "updated_at": "2026-10-08T14:35:12Z"
}
```

The server decides `id`, `created_at` and `updated_at`. The user id comes from the token, so the client never sends it.

### 6. Update a note: `PUT /api/v1/notes/57`

Request (the whole note is sent again):

```json
{
  "title": "Buy milk, bread and eggs",
  "body": "The shop opens at 8am.",
  "tags": ["personal"]
}
```

Response (`200 OK`) is the updated note.

### 7. Delete a note: `DELETE /api/v1/notes/57`

No request body. Response is `204 No Content` with an empty body.

### 8. List tags: `GET /api/v1/tags`

Response (`200 OK`):

```json
{
  "data": [
    { "id": 1, "name": "work" },
    { "id": 2, "name": "personal" },
    { "id": 3, "name": "shopping" }
  ]
}
```

## Error responses

Every error uses the same body shape, so the client only needs one way to read errors:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The title is required.",
    "details": [{ "field": "title", "problem": "must be 1-100 characters" }]
  }
}
```

| Status | Name | When it happens | Example body |
|--------|------|-----------------|--------------|
| 400 | Bad Request | The request is malformed or breaks a rule, such as a missing title, a title over 100 characters or invalid JSON. | `{"error": {"code": "VALIDATION_ERROR", "message": "The title must be 100 characters or fewer."}}` |
| 401 | Unauthorized | There is no token, or it is invalid or expired. Also used for a wrong email or password at login. | `{"error": {"code": "UNAUTHENTICATED", "message": "Please log in to continue."}}` |
| 403 | Forbidden | The user is logged in but is not allowed to do this, such as opening a note that belongs to someone else. | `{"error": {"code": "FORBIDDEN", "message": "You do not have access to this note."}}` |
| 404 | Not Found | The note or tag does not exist, for example `GET /api/v1/notes/9999`. | `{"error": {"code": "NOT_FOUND", "message": "No note found with id 9999."}}` |
| 409 | Conflict | The request clashes with existing data, such as registering an email that is already in use. | `{"error": {"code": "EMAIL_TAKEN", "message": "An account with this email already exists."}}` |
| 500 | Internal Server Error | Something broke on our side (a bug or a database outage). Details go to the logs, never to the user. | `{"error": {"code": "SERVER_ERROR", "message": "Something went wrong on our side. Please try again."}}` |

### How 401 and 403 differ

- **401** means "we do not know who you are". Fix it by logging in.
- **403** means "we know who you are, but you may not do this". Logging in again will not help.
