# QuickNotes Architecture

QuickNotes is moving from a browser-only app to an online service used by **1 million people**. This document says what the system must do, how much load to expect, and how the pieces fit together so that it stays fast and keeps working when things fail.

## 1. Requirements

### Functional requirements (what it does)

- Users can register and log in.
- Users can create, read, update and delete their own notes.
- Users can add tags to notes and filter their notes by tag.
- Users can list their notes, newest first, in pages.
- Users can only see their own notes.
- Background jobs send reminder emails and keep the search index up to date.

### Non-functional requirements (how well it does it)

- **Fast:** listing notes should answer in under 300 ms for most users.
- **Available:** the service should be up 99.9% of the time (about 9 hours of downtime a year at most), and a single broken machine must not take it down.
- **Durable:** a saved note must never be lost, even if a server dies.
- **Scalable:** it must cope with growth and with busy evening peaks without a redesign.
- **Secure:** passwords are hashed, all traffic is over HTTPS, and users cannot reach each other's data.
- **Consistent enough:** after you save a note, you should see it straight away.

## 2. Load estimate for 1 million users

### Assumptions

- 1,000,000 registered users, of whom **30% are active each day**, so there are 300,000 daily active users.
- Each active user loads their notes list **30 times a day** (a read).
- Each active user **creates 3 notes a day** (a write).
- A note takes about **2 KB** including its tags and row overhead.
- A day has 86,400 seconds, and peak traffic is **5×** the average.

### Results

| What | Per day | Average per second | Peak per second (5×) |
|------|---------|--------------------|----------------------|
| Reads (list and open notes) | 300,000 × 30 = 9,000,000 | ≈ 104 | ≈ 520 |
| Writes (new notes) | 300,000 × 3 = 900,000 | ≈ 10 | ≈ 52 |

**Storage per year:** 900,000 notes × 2 KB = 1.8 GB per day, and 1.8 GB × 365 ≈ **657 GB (about 0.66 TB) per year** of note data. With indexes and copies on a replica and in backups, plan for roughly 3× that, so around 2 TB.

**Conclusion:** the system is **read-heavy**, with about 10 reads for every write. These are small numbers that a few servers can handle, but the design should still protect the database from repeated reads and should remove any single point of failure.

## 3. Architecture diagram

```text
                          +---------------------------+
                          |   CLIENT                  |
                          |   (browser / mobile app)  |
                          +-------------+-------------+
                                        |
                  1. "Where is quicknotes.example?"
                                        v
                          +---------------------------+
                          |   DNS                     |
                          +-------------+-------------+
                                        |  returns address
                                        v
                          +---------------------------+
                          |   CDN                     |  serves HTML, CSS, JS,
                          |   (edge servers)          |  images from nearby
                          +-------------+-------------+
                                        |  API calls only (/api/v1/...)
                                        v
                          +---------------------------+
                          |   LOAD BALANCER           |  (two, so it is not
                          |   (health checks)         |   a single point)
                          +------+------------+-------+
                                 |            |
                    +------------+            +------------+
                    v                                      v
          +-------------------+                  +-------------------+
          |  APP SERVER 1     |                  |  APP SERVER 2     |   ... more
          |  (stateless)      |                  |  (stateless)      |   when needed
          +----+------+-------+                  +----+------+-------+
               |      |      |                        |      |      |
     +---------+      |      +----------+   +---------+      |      +----------+
     |                |                 |   |                |                 |
     v                v                 v   v                v                 v
+---------+   +---------------+   +-------------+
|  CACHE  |   | PRIMARY DB    |   |   QUEUE     |
| (Redis) |   | (all writes)  |   | (jobs)      |
+---------+   +-------+-------+   +------+------+
                      |                  |
        copies every  |                  v
        change        v           +-------------+
              +---------------+   |  WORKER(S)  |  send reminder emails,
              | READ REPLICA  |   |             |  update search index
              | (list notes)  |   +-------------+
              +---------------+
```

Reading the diagram: the client finds the service through DNS, gets the static files from the CDN, and sends API calls through the load balancer to one of the app servers. The app servers use the cache first, then the database (writes go to the primary, most reads to the replica), and hand slow jobs to the queue for the workers.

## 4. What each component does

- **Client:** it is the browser or phone app that people use, and it keeps the interface quick by only asking the server for data and not for whole pages.
- **DNS:** it turns the friendly name `quicknotes.example` into the address of our servers, so users never need to know where we are hosted and we can move things without telling them.
- **CDN:** it keeps copies of the unchanging files (HTML, CSS, JavaScript, images) on servers near the user, so the page loads quickly and our own servers are not busy sending the same files over and over.
- **Load balancer:** it spreads incoming requests evenly across the app servers and stops sending traffic to one that fails its health check, so no server is overwhelmed and one failure is invisible to users.
- **App servers:** they run the QuickNotes code (login, validation, creating and listing notes), and because they keep no data of their own, we can add or replace them freely when traffic grows.
- **Cache:** it keeps recent answers, such as a user's first page of notes and their login session, in fast memory, so the database is not asked the same question hundreds of times a second.
- **Primary database:** it is the single reliable home for users, notes and tags, and by taking all the writes in one place it keeps the data consistent.
- **Read replica:** it is a live copy of the primary that answers the read queries (listing and searching notes), so the heavy reading does not slow down the primary that takes the writes, and it can take over if the primary fails.
- **Queue:** it holds jobs such as "send this reminder" in order, so the app can answer the user immediately instead of waiting for slow work to finish.
- **Worker:** it takes jobs off the queue and does the slow work in the background (emails, search indexing), and if one fails the job is put back and tried again.

## 5. Request flows

### GET /notes (list my notes)

1. The client sends `GET /api/v1/notes?page=1` with its login token.
2. DNS has already told the client where to go, and the request reaches the **load balancer**.
3. The load balancer picks a healthy **app server**.
4. The app server checks the token and works out which user is asking (the session is itself found in the cache).
5. The app server looks in the **cache** for that user's page 1 of notes (for example the key `notes:user42:page1`).
6. **Cache hit:** the cached list is returned straight away, and steps 7 and 8 are skipped.
7. **Cache miss:** the app server runs the "newest notes for this user" query on the **read replica**.
8. The app server stores the result in the cache with a short lifetime (for example 60 seconds).
9. The app server returns `200 OK` with the JSON list, which travels back through the load balancer to the client.
10. The client draws the notes on screen.

### POST /notes (create a note)

1. The client sends `POST /api/v1/notes` with the note's JSON and its login token.
2. The request reaches the **load balancer**, which passes it to a healthy **app server**.
3. The app server checks the token and **validates** the input (title required, 100 characters at most). If it is invalid it stops and returns `400`.
4. The app server writes the note, and any new tag links, to the **primary database** inside one transaction, so it is saved completely or not at all.
5. The app server **deletes that user's cached note lists**, so the next read sees the new note and not a stale copy.
6. The app server puts a job on the **queue** (for example "update the search index for note 57"). If the user has set a reminder, a "send reminder" job goes there too.
7. The app server returns `201 Created` with the new note and a `Location` header, and the client shows it immediately.
8. Later, a **worker** takes the job from the queue and does the slow work in the background. If it fails, the job is retried.
9. The primary database copies the change to the **read replica** a moment later.

## 6. Trade-offs

### Trade-off 1: Fast reads vs fresh data (cache)

Caching makes listing notes much faster and protects the database, but a cached list can be out of date. We reduce the problem by clearing a user's cached lists whenever they write (step 5 of the POST flow) and by using a short lifetime. In return for the small risk of showing old data for a moment, the database only has to answer a fraction of the reads.

### Trade-off 2: Read replica speed vs up-to-date reads

The read replica copies changes from the primary with a small delay (replication lag). A user who saves a note and immediately lists their notes could, for a split second, read from a replica that has not caught up and not see their own note. We accept this because replicas take most of the read load off the primary. To protect the "I just saved it" experience, the app reads from the **primary** for a few seconds after that user writes, or simply adds the new note to the screen straight from the `201` response, as the client in this repository does.

### Trade-off 3: Quick answers vs finished work (queue)

Sending slow jobs to a queue lets us answer the user instantly, but the work is finished a little later, and the system has more parts to run and monitor. Reminder emails and search indexing do not need to be instant, so a short delay is fine, and the queue also protects us during busy spells by letting work wait its turn.

### Trade-off 4: Simple SQL database vs unlimited write scaling

One primary database is simple, consistent and easy to reason about, but all writes go to a single machine, so it cannot grow without limit. At 52 writes per second at peak, one primary has plenty of room. If we ever outgrew it, the next step would be to split users across several databases (sharding), which is more complex, so we only do it when the numbers demand it.

## 7. Avoiding single points of failure

A single point of failure is any one component whose breaking would stop the whole service. We avoid them by having at least two of everything that matters:

| Component | What if it fails? | How we avoid the problem |
|-----------|-------------------|--------------------------|
| Client | Only that one user is affected. | Nothing to do. |
| DNS | Nobody can find the service. | Use a managed DNS provider with several servers around the world. |
| CDN | Static files load slowly or fail. | The CDN is itself spread over many edge servers, and the origin can serve files directly as a backup. |
| Load balancer | All traffic stops. | Run **two** load balancers (active and standby, or both active) behind one address. |
| App servers | Requests to that server fail. | Run **two or more** stateless app servers. The load balancer's health checks stop sending traffic to a dead one, and the others carry on. |
| Cache | Reads suddenly all hit the database. | Run the cache as a small cluster with a standby. If it still fails, the app falls back to the database, which is slower but correct. |
| Primary database | No writes can be saved. | Keep a **read replica** that can be promoted to primary automatically, and take regular backups. |
| Read replica | Read load falls on the primary. | Run more than one replica, and fall back to the primary if they are all down. |
| Queue | Background jobs cannot be added. | Use a replicated queue that keeps jobs on disk. The main flow (saving a note) still works without it. |
| Worker | Jobs pile up in the queue. | Run **several** workers. Jobs wait safely in the queue and a failed job is retried. |
| Whole data centre | Everything in one location is down. | Spread servers over at least two availability zones, and keep backups in a different region. |

The main idea is **redundancy** (more than one of everything), **statelessness** (app servers hold no data, so any server can handle any request) and **graceful degradation** (when a helper such as the cache or queue fails, the core features still work, only more slowly).
