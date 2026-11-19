# IT Support Knowledge Base

Phase 1 establishes the React/Vite frontend, Tailwind CSS, Express API, and PostgreSQL connection. Authentication, articles, migrations, seed data, themes, and other requested modules are not implemented yet.

## Requirements

- Node.js 22.12 or newer and npm.
- A Neon PostgreSQL database and its connection string. A local PostgreSQL database is also supported.
- `psql` is optional; the application connects using the Node PostgreSQL driver.

## Local setup

From the project root in PowerShell:

```powershell
npm install
Copy-Item backend\.env.example backend\.env
```

In `backend\.env`, replace `DATABASE_URL` with the connection string from the Neon dashboard. Keep the SSL parameters provided by Neon, typically `sslmode=require`. Do not commit or share the connection string. The API can start without it, but the database readiness check will return HTTP 503. If using a local PostgreSQL server, use its connection string and appropriate SSL settings instead.

Start the backend and frontend in separate terminals, both from the project root:

```powershell
npm run dev:backend
```

```powershell
npm run dev:frontend
```

Open `http://localhost:5173`. The Vite development server proxies `/api` to `http://127.0.0.1:3001`. If you change the backend port, update the Vite proxy as well.

The status card checks:

- `GET /api/health`: API process is responding.
- `GET /api/health/database`: executes `SELECT 1` against PostgreSQL; returns 503 when unavailable.

Restart the backend after changing `backend\.env`. The status endpoints do not expose credentials or detailed database errors; inspect the backend console for a sanitized error code.

## Verification

```powershell
npm test
npm run build
```

The automated tests use a stub for the successful database check. To verify a real database connection, configure `DATABASE_URL`, start the backend, and check that `http://localhost:3001/api/health/database` returns `{"status":"connected"}`. No schema or migrations are created in Phase 1.

## Deployment preparation

Deployment hardening and detailed Vercel/Render instructions are planned for Phase 8. For the eventual split deployment, set `VITE_API_BASE_URL` to the public backend URL ending in `/api` at frontend build time, and set `CORS_ORIGIN` to the exact frontend origin on the backend. Do not deploy the current unauthenticated foundation as a production knowledge base.
