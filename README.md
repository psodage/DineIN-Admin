# DineIN-Admin

Production monorepo for the DineIN mess-management admin app.

## Structure

```
DineIN-Admin/
├── frontend/     # React Native (Expo) admin app
├── backend/      # Node.js / Express API
├── README.md
└── .gitignore
```

## Prerequisites

- Node.js 20+
- Expo CLI and EAS CLI for mobile builds
- MongoDB (for backend)

## Frontend (Expo)

```bash
cd frontend
npm install
npx expo start
```

### Environment

Copy `frontend/.env.example` to `frontend/.env` and set:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:5000
```

For production builds, `EXPO_PUBLIC_API_BASE_URL` is also set in `frontend/eas.json` per profile.

### EAS Build and OTA (run from `frontend/`)

```bash
cd frontend
eas build --platform android --profile production
eas update --channel production --message "OTA update"
```

Or use npm scripts:

```bash
npm run eas:build:android:production
npm run eas:update:production
```

## Backend (Express)

```bash
cd backend
cp .env.example .env
npm install
npm start
```

Development with auto-reload:

```bash
npm run dev
```

## API URL

The mobile app reads `EXPO_PUBLIC_API_BASE_URL` (see `frontend/config.js`). Point it at your backend origin without a trailing `/api` — screens append `/api/...` themselves.

Local default: `http://localhost:5000` (backend `PORT` in `.env`, default 5000).

## Maintenance scripts

Database backup, restore, and billing jobs live in `backend/package.json` (e.g. `npm run backup:mongo:gdrive` from `backend/`).
