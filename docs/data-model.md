# QuickNotes Data Model

QuickNotes stores four kinds of things: **users**, their **notes**, **tags** to organise the notes, and the links between notes and tags (**note_tags**).

## Entities

### `users`

| Column | Type | Key / rules | Meaning |
|--------|------|-------------|---------|
| `id` | INTEGER | Primary key | Unique id for the user |
| `name` | TEXT | NOT NULL | Display name |
| `email` | TEXT | NOT NULL, UNIQUE | Login email (two users cannot share one) |
| `password_hash` | TEXT | NOT NULL | The password after hashing. We never store the real password. |
| `created_at` | TEXT (timestamp) | NOT NULL | When the account was created |

### `notes`

| Column | Type | Key / rules | Meaning |
|--------|------|-------------|---------|
| `id` | INTEGER | Primary key | Unique id for the note |
| `user_id` | INTEGER | Foreign key to `users(id)`, NOT NULL | The owner of the note |
| `title` | TEXT | NOT NULL, 1 to 100 characters | The note's title |
| `body` | TEXT | NOT NULL, default empty | The note's text (optional for the user) |
| `created_at` | TEXT (timestamp) | NOT NULL | When the note was created |
| `updated_at` | TEXT (timestamp) | NOT NULL | When the note last changed |

### `tags`

| Column | Type | Key / rules | Meaning |
|--------|------|-------------|---------|
| `id` | INTEGER | Primary key | Unique id for the tag |
| `user_id` | INTEGER | Foreign key to `users(id)`, NOT NULL | The user who owns this tag |
| `name` | TEXT | NOT NULL, UNIQUE per user | The tag text, such as `work` |

### `note_tags` (join table)

| Column | Type | Key / rules | Meaning |
|--------|------|-------------|---------|
| `note_id` | INTEGER | Foreign key to `notes(id)` | The note |
| `tag_id` | INTEGER | Foreign key to `tags(id)` | The tag attached to it |
| | | Primary key is the pair (`note_id`, `tag_id`) | A tag can be attached to a note only once |

## Relationships

- **users to notes: one-to-many.** One user has many notes, but each note belongs to exactly one user. This is the `notes.user_id` foreign key.
- **users to tags: one-to-many.** One user creates many tags, and each tag belongs to one user, so two people can both have their own `work` tag without clashing.
- **notes to tags: many-to-many.** One note can have many tags (`work`, `urgent`), and one tag can be on many notes. A relational table cannot hold a list in one cell, so the `note_tags` join table turns this into two one-to-many links: one note has many `note_tags` rows, and one tag has many `note_tags` rows.

```text
users 1 ---- * notes 1 ---- * note_tags * ---- 1 tags * ---- 1 users
```

## CREATE TABLE statements

These are written for SQLite and run unchanged in an SQLite playground. For PostgreSQL, change `INTEGER PRIMARY KEY AUTOINCREMENT` to `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`.

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  body       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE tags (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name    TEXT NOT NULL,
  UNIQUE (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE note_tags (
  note_id INTEGER NOT NULL,
  tag_id  INTEGER NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)  REFERENCES tags (id)  ON DELETE CASCADE
);
```

`ON DELETE CASCADE` means that deleting a note also removes its tag links, and deleting a user removes everything they own, so no orphaned rows are left behind.

## Example data

```sql
INSERT INTO users (name, email, password_hash) VALUES
  ('Amina Wanjiru', 'amina@example.com', 'hash-1'),
  ('Brian Otieno',  'brian@example.com', 'hash-2');

INSERT INTO notes (user_id, title, body) VALUES
  (1, 'Email the project report', 'Send it to Grace before Friday.'),
  (1, 'Buy milk and bread',       ''),
  (1, 'Prepare Monday standup',   'Three bullet points.'),
  (2, 'Call mum',                 '');

INSERT INTO tags (user_id, name) VALUES
  (1, 'work'), (1, 'personal'), (1, 'meetings'), (2, 'family');

INSERT INTO note_tags (note_id, tag_id) VALUES
  (1, 1), (3, 1), (3, 3), (2, 2), (4, 4);
```

## Example queries

### 1. A user's most recent notes (with pagination)

```sql
SELECT id, title, created_at
FROM notes
WHERE user_id = 1
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 0;
```

### 2. All of one user's notes with a given tag (uses JOINs)

This powers `GET /notes?tag=work`.

```sql
SELECT n.id, n.title, n.created_at
FROM notes n
JOIN note_tags nt ON nt.note_id = n.id
JOIN tags t       ON t.id = nt.tag_id
WHERE n.user_id = 1
  AND t.name = 'work'
ORDER BY n.created_at DESC;
```

### 3. How many notes each tag has (JOIN with GROUP BY)

```sql
SELECT t.name, COUNT(nt.note_id) AS number_of_notes
FROM tags t
LEFT JOIN note_tags nt ON nt.tag_id = t.id
WHERE t.user_id = 1
GROUP BY t.id, t.name
ORDER BY number_of_notes DESC;
```

The `LEFT JOIN` keeps tags that are not used yet and shows them with a count of 0.

### 4. Notes with no tags at all

```sql
SELECT n.id, n.title
FROM notes n
LEFT JOIN note_tags nt ON nt.note_id = n.id
WHERE n.user_id = 1
  AND nt.note_id IS NULL;
```

## Indexes

Primary keys and `UNIQUE` columns get an index automatically. These two are worth adding by hand:

```sql
CREATE INDEX idx_notes_user_created ON notes (user_id, created_at DESC);
CREATE INDEX idx_note_tags_tag_id   ON note_tags (tag_id);
```

- **`idx_notes_user_created`:** almost every request asks "show me *this user's* newest notes", which is query 1 above and the most common read in the system. With the index, the database jumps straight to one user's notes already sorted by date. Without it, it would scan the entire `notes` table, which will hold hundreds of millions of rows at scale.
- **`idx_note_tags_tag_id`:** the primary key (`note_id`, `tag_id`) already makes "tags of a note" fast, but "notes of a tag" (query 2) starts from the tag, and that needs its own index.

The trade-off is that every index makes writes slightly slower and takes extra disk space, so we only add indexes for queries we know we run all the time.

## SQL or NoSQL?

I choose **SQL** (for example PostgreSQL). QuickNotes data is naturally relational: users own notes, notes have tags, and tags are shared between notes, which is exactly what joins and foreign keys are good at. The database itself enforces the rules we care about (an email is unique, a note always has a real owner, a tag cannot be attached twice), and transactions keep a note and its tag links consistent when saved together. Our load is modest and read-heavy (about 10 reads for every write), which one primary database with a read replica handles easily, so we do not need the horizontal write scaling that NoSQL is best at. If notes later grew into huge rich documents or we needed full-text search over millions of notes, we could add a search engine next to the database without replacing it.
