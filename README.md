# IT Support Knowledge Base

Phase 2 replaces the PostgreSQL authentication foundation with Firebase Authentication, Cloud Firestore and a trusted Express backend. This phase implements authentication and user management only. Article, category, approval, feedback, view and attachment functionality is deferred; the listed roles are not yet permissions for those future APIs.

## Requirements

- Node.js 22.12 or newer and npm.
- A Firebase project on the free Spark plan, with Authentication and Cloud Firestore enabled.
- Credentials for a trusted backend identity with permission to administer Firebase Authentication and read/write Firestore. Never put these credentials in frontend code or source control.

## Firebase configuration

1. In the Firebase console, create or select a project and register a web app. Copy its web configuration values for the frontend.
2. Enable the Email/Password sign-in provider under Authentication. Configure authorized domains and the password-reset email template. Enable email enumeration protection; see [Firebase's documentation](https://cloud.google.com/identity-platform/docs/admin/email-enumeration-protection).
3. Create a Firestore database in your chosen location. Deploy the restrictive rules in [firestore.rules](./firestore.rules) before using the application. For example, with the Firebase CLI authenticated to the correct project, run `firebase deploy --only firestore:rules --project YOUR_PROJECT_ID` from the repository root. Alternatively paste the rules into the Firestore Rules console and publish them.
4. For local backend development, obtain a service-account JSON file using the Firebase console and store it outside the repository. Set `GOOGLE_APPLICATION_CREDENTIALS` to its absolute path. In deployed environments prefer an attached service account or workload identity using Application Default Credentials rather than distributing a key.
5. From the project root:

   ```powershell
   npm install
   Copy-Item backend\.env.example backend\.env
   Copy-Item frontend\.env.example frontend\.env
   ```

   Set `FIREBASE_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` in `backend\.env`. Set the four `VITE_FIREBASE_*` values in `frontend\.env` from the web app configuration, using the same project. These web values identify the project and are public; they are not service-account credentials. Do not copy private keys into any `VITE_` variable. `CORS_ORIGIN` must exactly match the frontend origin, without a trailing slash. `VITE_API_BASE_URL` can be empty for the local Vite proxy.

The backend uses Application Default Credentials and `FIREBASE_PROJECT_ID`. `PORT` defaults to 3001. `TRUST_PROXY=1` is appropriate only behind exactly one trusted reverse proxy. In production, `CORS_ORIGIN` must be HTTPS, and `VITE_API_BASE_URL` must be the HTTPS backend URL ending in `/api`; configure hosting to rewrite frontend routes to `index.html`. Keep environment files and service-account keys private.

## Create the initial administrator

Run this **only on a trusted machine** with backend credentials configured. Setup creates a Firebase Auth account and its Firestore profile and succeeds only when the application has no users and has not already been initialized. It does not take over an existing Firebase Auth account. Enter the password privately; it must contain at least 12 characters and at most 72 UTF-8 bytes.

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

An authenticated administrator can create subsequent accounts, including administrators, from User management. Share initial passwords through an approved secure channel. Users can request a password-reset email from the sign-in page. If creation fails and the server logs report an orphaned Firebase account, inspect and remove that account in the Firebase console before retrying.

## Run

Start these commands in separate terminals:

```powershell
npm run dev:backend
npm run dev:frontend
```

Open `http://localhost:5173`. Firebase persists sign-in locally in the browser; sign out on shared devices. The API verifies Firebase ID tokens, checks revocation, and reads the user's current Firestore profile and role on each protected request. Deactivation blocks API access immediately; after reactivation, sessions authenticated before deactivation remain invalid and the user must sign in again. Firebase sign-out removes the local session; it does not invalidate a stolen ID token by itself.

The existing system-status page checks the public API and Firestore readiness endpoint. User management searches all profiles and returns up to 200 matches; reads grow with the number of users. Firestore charges and free-tier quotas apply.

## Roles and security

- **ADMIN:** manage accounts and roles; cannot remove the last active administrator. Future phases will add category management and article approval.
- **EDITOR:** authenticated profile access now; article drafting, editing, submission and history are future work.
- **TECHNICIAN:** authenticated profile access now; published article search, reading, feedback and outdated reports are future work.

The browser never decides authorization. Only verified administrators can create users or change roles; Firestore transactions recheck the administrator and serialize changes to the active-administrator count. Do not edit `users` or `_internal/user_management` manually: their consistency is required for the last-admin safeguard. Protect backend service-account access and deployment credentials.

Firestore client rules deny all direct reads and writes, including `users`, `categories`, `articles`, `article_history`, `feedback`, `article_views`, and `attachments`. The Admin SDK bypasses those rules. Firestore creates collections when their first document is written, so deferred collections are not populated with placeholder documents. Add appropriately scoped rules and server-side authorization before implementing those features.

Firebase's Email/Password provider may permit someone to create an Auth account directly through Firebase's public endpoints. Such an account has no application profile or role and cannot use protected API routes or Firestore. There is no public application registration or administrator bootstrap endpoint. Restrict Firebase API keys to the intended APIs and monitor Auth account creation and quotas; blocking sign-ups at the identity provider may require features outside the free tier.

Firebase does not automatically migrate existing PostgreSQL users or passwords. Back up any existing database and plan a separate controlled migration before switching an existing installation. No PostgreSQL data is deleted by this application.

## Tests and verification

```powershell
npm test
npm run build
```

The tests cover all three roles, rejected tokens and role escalation, administrator changes, bootstrap, deactivation and the last-admin invariant using test doubles. They do **not** validate actual Firebase Authentication, Firestore transactions or deployed Security Rules. Before deployment, run live or Firebase Emulator Suite checks for registration, login, persistence, logout, reset email, all roles, unauthorized API and direct Firestore access, concurrent administrator changes, and deactivation/reactivation. Verify that rules are published to the intended project. No production readiness is implied until those checks pass.
