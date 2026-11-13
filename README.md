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

## Current storage
This milestone still saves on the current browser/device. It has **no backend, app accounts, Neon connection, or cross-device sync yet**. The hosted preview remains owner-private. Export backups regularly: clearing browser storage deletes records and local recovery copies.

Saves use Web Locks and snapshot comparisons. Outdated tabs must reload before saving. Use a current browser over HTTPS or localhost. Restore/clear operations keep the previous raw data under a separate localStorage recovery key before replacement. Payment corrections are local bookkeeping records, not real bank transfers or a tamper-proof audit log.

## Next milestone
Add a **Node.js + Express REST API** and **Neon PostgreSQL**. Node keeps both frontend and backend in JavaScript. Add authenticated ownership checks and a deliberate import step before connecting real records. Database credentials belong on the server, never in React or a `VITE_` variable.

Next.js, TypeScript and the unused proposed Prisma schema have been removed. The deployed app is a Vite static build.
