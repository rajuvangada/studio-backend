# GK Digital Studios — API Server

Standalone **Node + Express + MongoDB Atlas + AWS S3** backend, exactly as specced:
JWT auth with bcrypt password hashing, no OAuth, no Firebase, all media in S3.

This folder is self-contained — deploy it to Render, Railway, Fly.io, EC2, or any
Node host.

## Quick start

```bash
cd server
cp .env.example .env      # fill in Mongo URI, JWT secret, AWS keys
npm install
npm run seed:admin        # creates the first admin from ADMIN_EMAIL/ADMIN_PASSWORD
npm run dev               # http://localhost:4000
```

## Architecture

```text
src/
  server.js            bootstrap: connect Mongo, listen
  app.js               express app, middleware chain, /api/dashboard
  config/env.js        validated environment
  config/db.js         mongoose connection
  middleware/auth.js   JWT sign/verify, httpOnly cookie, requireAuth/requireAdmin
  middleware/error.js  async wrapper + central error handler
  lib/s3.js            S3 client, pre-signed upload/download URLs
  models/              User, Client, Media/Selection/Submission/ActivityEvent, Content
  routes/              auth, clients, gallery, portfolio, inquiries, profile+services
  scripts/createAdmin.js
```

## API

### Auth (`/api/auth`)
| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/login` | public | email + password, returns JWT (body + httpOnly cookie) |
| POST | `/logout` | public | clears cookie |
| GET | `/me` | auth | current user |
| POST | `/change-password` | auth | rotate password |

### Clients (`/api/clients`, admin only)
`GET /` · `POST /` · `GET /:id` (client + signed media + submissions + timeline) ·
`PATCH /:id` · `DELETE /:id` (also purges S3 objects) ·
`POST /:id/media/sign` → pre-signed S3 PUT · `POST /:id/media` → record uploaded object ·
`DELETE /:id/media/:mediaId` · `POST /:id/publish` → share link + passcode ·
`POST /:id/rotate-passcode` · `GET /:id/submissions/:submissionId` · `POST .../review`

### Client gallery (`/api/gallery/:token`, passcode-gated, no account)
`POST /open` · `POST /select` · `POST /comment` · `POST /submit`

### Portfolio (`/api/portfolio`)
`GET /` public published · `GET /all` admin · `POST /sign` · `POST /` · `PATCH /:id` · `DELETE /:id`

### Inquiries (`/api/inquiries`)
`POST /` public (rate-limited) · `GET /` `PATCH /:id` `DELETE /:id` admin

### Studio (`/api/profile`, `/api/services`)
`GET` public · `PUT /` and service CRUD admin · `POST /profile/logo/sign`

### Dashboard
`GET /api/dashboard` — counts + recent activity timeline.

## Upload flow (S3 direct, no file ever touches the API)

1. `POST /api/clients/:id/media/sign` with `{ fileName, contentType }` → `{ key, uploadUrl }`
2. Browser `PUT`s the file straight to `uploadUrl`
3. `POST /api/clients/:id/media` with `{ key, fileName, sizeBytes }` to record it

Reads always go through short-lived pre-signed GET URLs (`S3_SIGNED_URL_TTL`, default
15 min) — the bucket stays **fully private**.

### Required S3 bucket CORS

```json
[{
  "AllowedOrigins": ["https://your-site.com", "http://localhost:8080"],
  "AllowedMethods": ["GET", "PUT"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag"]
}]
```

## Security

- bcrypt (12 rounds), passwords never selected by default
- JWT in an httpOnly / SameSite cookie, Bearer header also accepted
- helmet, CORS allow-list, rate limits on login (20/15 min), contact (10/hr), gallery unlock (30/10 min)
- every body validated with zod
- gallery passcode checked server-side on **every** call, not just unlock

## Pointing the frontend at this API

Set `VITE_API_URL=https://your-api-host` and connect the frontend data layer to
these endpoints with `credentials: "include"`.
