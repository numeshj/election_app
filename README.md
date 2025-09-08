## Election App Monorepo

Folders
- `server` Node.js Express + Socket.IO backend (port 4000)
- `admin` React Vite admin UI (port 5174)
- `client` React Vite public/live dashboard (port 5175)

### 1. Install Dependencies
Run inside each folder:
```
cd server && npm install
cd ../admin && npm install
cd ../client && npm install
```

### 2. Start Services (separate terminals)
```
cd server && npm run dev
cd admin && npm run dev
cd client && npm run dev
```

### 3. Admin Data Entry
Open http://localhost:5174 and fill the form:
1. Enter metadata fields (timestamp etc.)
2. Fill summary numbers
3. Add parties row by row (party_code unique recommended)
4. Submit (POST /api/results). Broadcast events:
   - `result:new` single new record
   - `results:all` full array after insertion

### 4. Client Dashboard
Open http://localhost:5175 to see live dashboard updating via WebSocket.

Sections provided:
- Latest Result - Just Received (clickable for detail)
- Districts Wise Totals (latest per district with total votes & top party)
- Island Total (aggregate votes by party across districts)
- All Results in Received Order (chronological list)
- District Leaders table & interactive placeholder map (click for detail overlay)

### API
- `GET /api/results` array of all submitted results
- `POST /api/results` create a new result (payload matches structure in prompt)
- `GET /api/districts` district + division metadata

### Next Improvements (Suggestions)
- Persist data in a database (e.g., SQLite / PostgreSQL)
- Auth for admin (JWT)
- Validation & percentage auto-calculation
- Real SVG map of Sri Lanka with district shapes (color by leading party)
- Aggregation endpoints (per party totals, national summary)

### Notes
- Current storage is in-memory; restart clears data.
- CORS is open for development; tighten in production.
