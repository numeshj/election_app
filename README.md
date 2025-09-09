## Election App (Frontend Only)

Backend code has been removed. This repository now contains only the public dashboard React app under `client`.

### 1. Install Dependencies
From repo root:
```
cd client
npm install
```

### 2. Run Dev Server
```
cd client
npm run dev
```

### 3. Data Source
The app now operates in static mode:
- District metadata loaded from `client/src/data/districts.json`.
- Results loaded from `client/src/data/results.sample.json` (currently empty array).
Add or replace that file with precomputed result objects to visualize aggregates.

### 4. Dashboard
Open http://localhost:5173 (default Vite port) to view the dashboard. Live socket updates & REST calls were removed.

Sections provided:
- Latest Result - Just Received (clickable for detail)
- Districts Wise Totals (latest per district with total votes & top party)
- Island Total (aggregate votes by party across districts)
- All Results in Received Order (chronological list)
- District Leaders table & interactive placeholder map (click for detail overlay)

### Removed API Layer
All references to Express / Socket.IO backend have been removed. To restore live mode, reintroduce a server providing the former endpoints and re-add axios + socket.io-client usage in `App.jsx`.

### Possible Next Steps
- Replace static `results.sample.json` with real-time feed service.
- Add a lightweight file uploader to load a JSON results dump at runtime (client-side only).
- Integrate a static-site build & deploy (Netlify / Vercel / GitHub Pages).

### Notes
- With backend removed, no data persistence or mutation occurs.
- Ensure any added sample results conform to original schema documented below.

---

## End-to-End Data Flow (Upload -> Server -> Live Client)

This section explains exactly what happens from the moment an admin user enters or imports data until the public client UI renders aggregated dashboards.

### 0. Actors & Components
- Admin UI (`/admin`): Creates & optionally bulk-imports result JSON.
- Server (`/server`): Express REST API + Socket.IO broadcaster, in-memory store.
- Client UI (`/client`): Live dashboard subscribing to socket events & performing aggregations.

### 1. Admin Data Capture
Two entry modes:
1. Manual form entry (metadata + parties)
2. Bulk JSON import (one or many files)

Each party row has: `party_code`, `party_name` (optional), `candidate` (optional), `votes`, `percentage` (auto-filled if auto-calc ON). Percentages are recalculated client-side before submit (see `maybeRecalculate` in `admin/src/App.jsx`).

Required metadata fields before enabling submit:
`timestamp, level, ed_code, ed_name, pd_code, pd_name, type, sequence_number, reference`

### 2. Result Payload Structure (Canonical)
```jsonc
{
   "timestamp": "2024-10-01T12:34:56Z",          // Original event or reporting time
   "level": "DIVISION",                          // Free-form classification (e.g. division / polling station)
   "ed_code": "19",                              // Electoral district code
   "ed_name": "Galle",                           // Electoral district name
   "pd_code": "19-07-05",                        // Polling division / station code (natural key #1)
   "pd_name": "Some Division",                   // Polling division name
   "type": "PRESIDENTIAL-FIRST",                 // Result type
   "sequence_number": 123,                        // Natural key #2 (fallback) if pd_code absent
   "reference": "FORM A/123",                    // Operator reference / document id
   "summary": {
      "valid": 12345,
      "rejected": 12,
      "polled": 13000,
      "electors": 15000,
      "percent_valid": 94.97,
      "percent_rejected": 0.09,
      "percent_polled": 86.67
   },
   "by_party": [
      { "party_code": "NPP", "party_name": "Jathika Jana Balawegaya", "candidate": "ANURA KUMARA DISSANAYAKE", "votes": 6000, "percentage": 48.62 },
      { "party_code": "SJB", "party_name": "Samagi Jana Balawegaya", "candidate": "SAJITH PREMADASA", "votes": 5000, "percentage": 40.52 },
      { "party_code": "IND16", "candidate": "RANIL WICKREMESINGHE", "votes": 900, "percentage": 7.29 }
   ]
}
```
Server adds fields:
`id` (UUID), `createdAt` (ISO), and on updates `updatedAt`.

### 3. Submit -> Server Request Lifecycle
1. Admin clicks "Submit Result" (single form) OR bulk loop calls `POST /api/results` for each staged file.
2. Browser sends JSON payload to `POST http://localhost:4000/api/results`.
3. Server validates minimal structure:
    - `payload.summary` exists
    - `payload.by_party` is an array
    (Additional validation can be added later.)
4. Upsert key resolution:
    - Try match existing record where `pd_code` equals (if present)
    - Else match where `sequence_number` equals (if present)
5. If match found => override path:
    - Merge existing + new (`id` + original `createdAt` preserved, add `updatedAt`)
    - Replace array element in `results` in-memory store
    - Emit socket events:
       - `result:updated` (single updated record)
       - `results:all` (entire updated array)
    - Respond `200` with `{ overridden: true }`
6. If no match => insert path:
    - Create new object `{ id, createdAt, ...payload }`
    - Push to `results`
    - Emit socket events:
       - `result:new` (new record only)
       - `results:all` (entire array)
    - Respond `201` with `{ overridden: false }`

### 4. Socket Layer
- Client connection (`io.on('connection')`) immediately receives a snapshot via `results:all`.
- Subsequent changes are incremental:
   - `result:new` (append)
   - `result:updated` (replace by id)
   - Periodic full snapshots also arrive via `results:all` for redundancy.

### 5. Client Initialisation (`client/src/App.jsx`)
1. Perform REST bootstrapping:
    - `GET /api/districts` (static metadata: districts + divisions)
    - `GET /api/results` (initial list, before socket handshake completes)
2. Open Socket.IO connection and register handlers:
    - On `results:all`: set entire `results` state
    - On `result:new`: append
    - On `result:updated`: map/replace by `id`
3. All further UI derives from the `results` state only (pure transforms below).

### 6. Client-Side Derived Data Pipelines
| Derivation | Purpose | Key Steps |
|------------|---------|-----------|
| `resultsSorted` | Timeline / latest result card | Sort descending by `createdAt` |
| `latestPerDivision` | Deduplicate multiple submissions per polling division | Keep newest per `pd_code` |
| `districtData` | Core district aggregation | For each district: gather latest divisions, sum party votes, compute coverage & winner |
| `districtWinners` | Map coloring | Filter districts with a top party + completion/ratio metadata |
| `districtTotalsRaw` -> `districtTotals` | Sortable district table | Compute total votes, top party, coverage, apply user sort state |
| `divisionRows` | Division-level table (sortable) | Compute margins, margin % from `latestPerDivision` |
| `islandTotals` | National total block | Aggregate party votes across all districts |

All transforms are memoized with `useMemo` to avoid recomputation overhead.

### 7. Party Colors & Metadata
- Fixed authoritative mapping stored in `client/src/data/parties.json` (added).
- Utility `getPartyColor(code)` in `client/src/utils/colors.js`:
   - Returns defined color if code exists in JSON
   - Falls back to a deterministic hash -> palette if unknown
- Additional helpers: `getPartyMeta(code)` & `allParties` for legends or tooltips.

### 8. Bulk Import Flow (Admin)
1. User selects multiple `.json` files.
2. Each file parsed & normalized (`empty` template merged).
3. Staged list displays status: `pending | uploading | success | error | invalid`.
4. User may submit individually or "Submit All" (sequential loop to avoid server overload).
5. Success triggers same server socket events consumed by both admin (history view) and client dashboard.

### 9. Update vs Insert Semantics
| Scenario | Condition | Outcome |
|----------|-----------|---------|
| Resubmission of same polling division | Existing `results[i].pd_code === payload.pd_code` | Record overridden, `updatedAt` added, broadcast `result:updated` |
| Same seq no, different/missing `pd_code` | Match on `sequence_number` | Same override path |
| Neither key matches | No match | New record inserted |
| Missing both keys | No natural key; always treated as new | Potential duplicates (recommend enforcing at source) |

### 10. Failure & Edge Cases
- Invalid payload (`summary` missing or `by_party` not array) => `400` + no socket broadcast.
- Server restart => in-memory data lost; clients fetch empty baseline then refill as new submissions arrive.
- Race: Two fast submissions with same `pd_code`: last one wins; client sees intermediate + final via events.
- Clock skew: Ordering relies on `createdAt` (server side). If temporal ordering matters across nodes, replace with monotonic sequence.

### 11. Extending / Production Hardening (Roadmap)
- Persistence: SQLite/Postgres layer (append + upsert by natural key) + migration script.
- Schema validation: e.g. Zod / Joi with detailed error messages.
- Authentication & authorization for admin endpoints.
- Idempotency keys to guard against double POST on network retries.
- Pagination / streaming if results list grows large.
- Server-side computed aggregates (cache + invalidation) to reduce client CPU.
- Versioned parties list & dynamic loading (if election context changes mid-run).

### 12. Sequence Overview (Textual Diagram)
1. Admin fills form -> clicks submit
2. Browser -> POST /api/results
3. Server validates & (insert|override) in memory
4. Server emits socket events (result:new|result:updated + results:all)
5. Client (already subscribed) receives events & updates `results` state
6. Memoized selectors recompute derived datasets
7. React components re-render: maps, tables, charts show new values with correct colors

### 13. Quick Troubleshooting
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Client shows no updates | Socket blocked / CORS / server down | Check server log, ensure port 4000 reachable |
| Duplicated rows | Missing `pd_code` & reused `sequence_number` or both missing | Enforce keys in admin UI before submit |
| Wrong percentages | Auto-calc disabled or summary fields manually edited | Toggle auto-calc & press Recalculate |
| Colors inconsistent | Party code not in `parties.json` | Add entry or accept hash fallback |

---

This documentation now captures the full pipeline from data entry to live visualization. Update it alongside any schema or event changes.
