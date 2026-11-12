# ClientDesk
A Next.js + TypeScript freelance client, project, task and payment tracker.

## Run
Use Node.js 22 or newer.

```sh
npm ci
npm run dev
npm test
npm run build
```

The hosted version is a Next.js static export. It saves data in localStorage on the current browser/device. There is no PostgreSQL connection, app-level authentication or cross-device sync. Site access is private to its owner. Sample clients are fictional. Workspace settings let you clear sample data and export/restore JSON backups. Clearing browser storage removes records; export backups regularly.

## Features
- Dashboard with calculated balances and upcoming deadlines
- Create/edit clients and projects; search and status filters
- Project checklist and status updates
- Record payments; prevent overpayments and future payment dates
- Exact integer-paise money calculations
- Responsive layout; accessible native dialogs
- Validated JSON backup and restore

## Source
`app/page.tsx` is the application UI. `app/globals.css` is responsive styling. `lib/domain.ts` contains domain types, calculations and demo records. `lib/backup.ts` validates imports. `prisma/schema.prisma` is a proposed PostgreSQL schema, not an active integration.

## Next implementation milestone
Connect PostgreSQL to a server-capable deployment; remove static export configuration. Install/configure Prisma for the chosen version and database. Add a maintained authentication provider; derive ownerId from verified server sessions, never browser input. Enforce ownership for every query and relation; validate every mutation on the server. Record payment/budget updates in serializable transactions so simultaneous requests cannot overpay. Add database constraints for positive amounts. Add auth/authorization and transaction tests before accepting real multi-user data. Never place DATABASE_URL in a NEXT_PUBLIC variable or commit secrets.
