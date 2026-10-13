# SecureCloud (Supabase edition)
Plain HTML/CSS/JS frontend · Node.js + Express API · Supabase **Auth**, **PostgreSQL** (file metadata) and private **Storage** (file objects).

## Architecture
Browser → Express API → verify Supabase access token → ownership + validation → PostgreSQL / private Storage bucket.
The service-role key exists only on the backend. The browser uses only the public URL and publishable/anon key.

## Supabase setup (about 5 minutes)
1. supabase.com → New project (note the database password; pick a nearby region).
2. **SQL Editor → New query**, paste all of `database/schema.sql`, Run. This creates the private bucket `securecloud-files`, the `files` table, RLS policies and a stats function.
3. **Authentication → Providers → Email:** for development turn **Confirm email OFF** (the built-in mail service sends only a few emails per hour, which is the usual cause of "sign-up/login not working"). Turn it on later if you configure your own SMTP.
4. **Authentication → URL Configuration:** Site URL `http://localhost:5500`; add Redirect URLs `http://localhost:5500/**` (and your deployed frontend URL later).
5. **Project Settings → API** (or API Keys): copy the Project URL, the publishable/anon key, and the service-role (secret) key.
6. Verify: Storage shows bucket `securecloud-files` marked **Private**; Table Editor shows table `files`.

## Run locally (Node 20+)
```
cd backend
copy .env.example .env      (Mac/Linux: cp .env.example .env)   # fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm install
npm start                   # http://localhost:3000/api/health
```
Edit `frontend/config.js` (URL + publishable/anon key; API_BASE stays `http://localhost:3000/api`), then in another terminal:
```
cd frontend
npx serve -l 5500 .         # open http://localhost:5500
```
Never open the HTML files by double-click (file://).

## Backend environment variables
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secret), `PORT`, `FRONTEND_ORIGIN` (comma-separate several), `MAX_FILE_SIZE_MB`.

## API (all but health need `Authorization: Bearer <access token>`)
`GET /api/health` · `GET /api/files?search&type&sort=name|date|size&order=asc|desc&page&limit` · `GET /api/files/stats` · `POST /api/files` (multipart `file`) · `GET /api/files/:id/download` (60 s signed URL) · `DELETE /api/files/:id`

## Deploy
Backend on Render (root `backend`, `npm install`, `npm start`) or AWS App Runner/Beanstalk with the env vars above (`FRONTEND_ORIGIN` = frontend URL). Frontend on Vercel (root `frontend`, no build) or S3 + CloudFront; set `API_BASE` to `https://YOUR_BACKEND/api`. Add the frontend URL to Supabase Redirect URLs.

## Troubleshooting
- **"Email not confirmed" / no email arrives:** disable Confirm email (step 3) or confirm via the link; Supabase → Authentication → Users lets you confirm a user manually.
- **"Invalid API key":** wrong key in `frontend/config.js`.
- **CORS error:** `FRONTEND_ORIGIN` must exactly equal the browser address (no trailing slash); restart the backend.
- **Upload error "Bucket not found":** run step 2 again.
- **Leftover Firebase/old files after unzipping over an old copy:** delete `firebase/`, `backend/firebase.js`, `frontend/js/firebase.js`, `backend/node_modules`, then `npm install`.

## Manual security test (not yet run)
With two accounts: A gets 404 on B's file id for download and delete; no/invalid token gives 401; a download link stops working after 60 s.

## Known limits
Whole uploads are buffered in memory (10 MB cap); the 1 GB meter is display-only; no virus scanning, sharing or folders.
