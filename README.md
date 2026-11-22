# IT Support Knowledge Base

Phase 2 adds authentication and administrator-managed users to the Phase 1 React/Vite, Express and PostgreSQL foundation. Articles, categories, approval, feedback and analytics are not implemented yet; their permissions must be enforced when those APIs are introduced.

## Requirements

- Node.js 22.12 or newer and npm.
- PostgreSQL 13 or later, such as a Neon database. `psql` is optional.
- A long, randomly generated JWT secret.

## Local setup

From the project root in PowerShell:

```powershell
npm install
Copy-Item backend\.env.example backend\.env
```

In `backend\.env`, set `DATABASE_URL` to your Neon connection string, retaining its SSL settings (normally `sslmode=require`). Set `JWT_SECRET` to a random secret of at least 32 bytes; generate one locally with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"
```

Paste the result into `backend\.env` and keep it private. `CORS_ORIGIN` must exactly match the frontend origin, including protocol and port. Use `http://localhost:5173` locally. Never commit the `.env` file or share its contents.

## Migrations

```powershell
npm run migrate --workspace backend
```

The migration runner tracks applied files in `schema_migrations`, serializes concurrent runs and applies each file transactionally. `001_users.sql` creates `users` and revocable `auth_sessions`, with UUID keys, a case-insensitive unique email index, role constraints and timestamps. It deliberately fails if a `users` table already exists rather than altering or dropping unknown data. Phase 1 had no user schema; if your database already contains one, inspect it and prepare a compatible data-preserving migration before running this command. Back up existing data first. The database user needs permission to create tables and indexes.

## Create the first administrator

After migration, run the following in a PowerShell terminal. Enter the password privately when prompted; it must contain at least 12 characters and no more than 72 UTF-8 bytes.

```powershell
$env:ADMIN_NAME = Read-Host "Administrator name"
$env:ADMIN_EMAIL = Read-Host "Administrator email"
$secure = Read-Host "Administrator password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  npm run setup-admin --workspace backend
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Item Env:ADMIN_NAME, Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
```

The setup command only succeeds when the users table is empty, hashes the password with bcrypt, and creates no public registration endpoint. Use user management to add subsequent accounts. Share initial passwords through an approved secure channel; password resets and self-service password changes are not yet implemented.

## Run and sign in

Start these commands in separate terminals from the project root:

```powershell
npm run dev:backend
npm run dev:frontend
```

Open `http://localhost:5173` and sign in with the administrator email and password supplied above. Administrators can create users, filter/search accounts, change roles and activate or deactivate accounts. The last active administrator cannot be deactivated or demoted. Editors and technicians can sign in and view their profile, but article functionality is deferred. Access is checked on the server for every protected API request; roles are read from the database, not the JWT.

Vite proxies `/api` to port 3001. Update `frontend\vite.config.js` if changing the backend port. The protected system-status page retains the Phase 1 API and database checks. `GET /api/health` is public and `GET /api/health/database` runs `SELECT 1`; database errors are not sent to clients.

## Security and deployment

- The eight-hour JWT is in an HTTP-only cookie; server-side sessions are revoked on logout or account deactivation. Role and account status are rechecked on each request. Cookies use `SameSite=Lax` locally and `SameSite=None; Secure` in production.
- State-changing API calls require the exact configured `Origin` and an `X-Requested-With: KnowledgeBase` header. CORS allows credentials only for the configured origin. Cross-site deployments additionally depend on the browser permitting third-party cookies; a same-site frontend/API deployment is preferable.
- Login is limited to 10 attempts per IP per 15 minutes. The default limiter is process-local and resets on restart; use a shared rate-limit store and edge protections before multi-instance production deployment. Set `TRUST_PROXY=1` only behind exactly one trusted reverse proxy; incorrect proxy settings can undermine IP-based limits.
- `NODE_ENV=production` requires an HTTPS `CORS_ORIGIN`. HTTPS is required for secure cookies. Set frontend `VITE_API_BASE_URL` to the backend URL ending in `/api` at build time. Configure the hosting provider to rewrite frontend routes to `index.html`.
- This foundation is not yet a production-ready knowledge base. Complete Phase 8 security, operations, password recovery, deployment configuration and testing before production.

## Tests

```powershell
npm test
npm run build
```

The default tests exercise authentication, roles, user management, session expiry/revocation, CSRF checks and rate limiting using a database test double. They do not prove PostgreSQL integration. For a real database test, use a **disposable** PostgreSQL database and a role allowed to create and drop schemas:

```powershell
$env:TEST_DATABASE_URL = Read-Host "Disposable PostgreSQL connection string"
npm run test:integration --workspace backend
Remove-Item Env:TEST_DATABASE_URL
```

The integration test creates a uniquely named schema, runs migrations and setup inside it, exercises all three roles, then drops that schema. It does not modify existing tables. Until this test and a live sign-in are run against your configured database, the database-dependent workflow remains unverified.
