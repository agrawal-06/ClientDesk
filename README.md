# ClientDesk
A freelancer workspace built with **React, JavaScript, plain CSS, and Motion**, using Vite.

## Run locally
Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open the URL printed in the terminal. To check and build:

```sh
npm test
npm run build
npm run preview
```

## Understand the project
| File | What it does |
| --- | --- |
| `index.html` | The page that loads the app |
| `src/main.jsx` | Starts React, loads CSS and sets animation preferences |
| `src/App.jsx` | Dashboard, clients, projects and payments screens |
| `src/components/` | Payment correction and recovery screens |
| `src/lib/domain.js` | Money calculations, dates and payment rules |
| `src/lib/backup.js` | Checks imported and saved data |
| `src/lib/storage.js` | Saves to the browser without overwriting newer changes |
| `src/lib/use-workspace.js` | Connects React state to storage |
| `src/styles/` | Layout and skeuomorphic desk theme |

A component is a function that describes part of the screen. State holds values React displays. An event, such as submitting a form, validates input, saves changes and updates the screen. Start by reading `main.jsx`, then `App.jsx`, then the shared rules in `domain.js`.

Motion adds subtle screen transitions and respects reduced-motion preferences. All styling is plain CSS; no Tailwind.

## What works
- Create/edit clients and projects
- Budgets, deadlines, checklists, search and status filters
- Record payments and calculate outstanding balances
- Correct or void a payment while preserving originals and reasons
- JSON backup/restore, validation and unreadable-data recovery
- Protection against stale tabs overwriting newer changes

Money is stored in integer paise to avoid rounding errors. The conversion keeps the original `clientdesk.v1` storage key and data format. Existing records on the same site and browser remain readable. Refresh older open tabs after upgrading.

## Browser and cloud workspaces
Signed out, ClientDesk keeps using `clientdesk.v1` in this browser. Sign in through **Sign in / Cloud** to open a separate private workspace stored in Neon PostgreSQL. Accounts start empty.

To move existing records: export a backup, sign in, open **Workspace settings**, then choose **Import browser workspace**. This replaces the cloud workspace after confirmation and leaves the browser copy untouched. A later cloud save retains one previous version, available to download in settings.

Cloud saves happen when you submit changes. Other devices see the latest records after reload; this is not live collaborative editing. Each save includes a version number, so an outdated tab cannot overwrite a newer save. A failed or uncertain save requires reload before retrying. Workspaces are limited to 1 MB.

## How the backend works
1. Neon Auth handles signup, signin, signout and password reset.
2. React sends a short-lived JWT with each API request.
3. The server verifies the signature and expiry, then uses the verified user ID to select their records.
4. PostgreSQL saves the workspace and version atomically.

`X-Workspace-Owner` also checks that the screen belongs to the currently authenticated account. It is never trusted as authorization. This prevents a different account signing in in another tab from receiving the old account's workspace.

| File | Purpose |
| --- | --- |
| `src/WorkspaceApp.jsx` | Chooses browser or signed-in cloud workspace |
| `src/components/AccountPanel.jsx` | Account and password reset forms |
| `src/lib/auth.js` | Public service URLs, auth client, authenticated requests |
| `src/lib/use-cloud-workspace.js` | Load/save React state with conflict handling |
| `server/app.js` | Express HTTP routes and CORS |
| `server/workspace.js` | Shared validation and parameterized SQL |
| `server/runtime.js` | JWT verification and database pool |
| `server/function.js` | Fetch adapter for Neon Functions hosting |
| `server/schema.sql` | Database table definition |

The local backend uses Node.js + Express. The deployed backend uses the same service code through a small Fetch adapter on Neon Functions. React is a static Vite build. Database passwords stay on the server; public auth/API URLs are safe in frontend code.

### Run your own backend
Copy `.env.example` to `.env`. Set your branch's `DATABASE_URL`, `NEON_AUTH_BASE_URL`, and `NEON_AUTH_JWKS_URL`, and run `server/schema.sql` on that branch. Start `npm run server` and `npm run dev` in separate terminals. Set `VITE_API_URL` and `VITE_NEON_AUTH_URL` to your endpoints, then restart Vite. Add your frontend origin to Neon Auth's trusted domains and the API's `ALLOWED_ORIGINS`.

Without overrides, the frontend uses this project's deployed services. Set `VITE_LOCAL_ONLY=true` to work entirely in browser storage. Never prefix database passwords with `VITE_`.

### Hosting details
- Neon project: `empty-cake-39612096`
- Application branch: `br-autumn-shape-azzp8wry` (`clientdesk-app`)
- Database: `clientdesk`
- Function: `clientdesk`; bundle with `npm run build:api`
- Existing Site stays owner-private; app accounts are separate from the Site access gate.

For a separate deployment, use your own Neon project and replace the public URLs. Signup is currently enabled, with email verification disabled. Password reset uses Neon's shared email provider; end-to-end email delivery is not verified here. Configure and test email delivery before inviting clients. Already issued JWTs remain valid until expiry after signout.

### Checks
`npm test` covers validation, local recovery, payment corrections, ownership, version conflicts and account switching. `server/cloud-check.js` is an **optional live smoke test** that creates a synthetic QA account and sample empty workspace on the configured service; it is not part of the normal test command. No real client records are used.

Payment corrections are bookkeeping records, not bank transfers or a tamper-proof audit log. Keep exporting backups; cloud recovery retains only one previous save.
