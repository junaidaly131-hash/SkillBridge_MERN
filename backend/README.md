# SkillBridge Backend API

Backend API server for SkillBridge MERN application built with Node.js, Express, and MongoDB.

## Features

- RESTful API architecture
- MongoDB database integration
- JWT authentication ready
- CORS enabled
- Environment-based configuration
- Error handling middleware

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the backend directory (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Update the `.env` file with your MongoDB connection string and other configuration.

4. Start the development server:
```bash
npm run dev
```

5. Start the production server:
```bash
npm start
```

## Environment Variables

- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment (development/production)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `JWT_EXPIRE` - JWT token expiration time
- `FRONTEND_URL` - Frontend URL for CORS

### Email Configuration (for 2FA verification codes)

To send verification emails, add these variables to your `.env` file:

- `SMTP_HOST` - SMTP server host (e.g., `smtp.gmail.com` for Gmail)
- `SMTP_PORT` - SMTP server port (default: 587, use 465 for SSL)
- `SMTP_USER` - SMTP username/email
- `SMTP_PASS` - SMTP password or app password
- `SMTP_FROM` - From email address (optional, defaults to SMTP_USER)
- `SMTP_SECURE` - Use secure connection (true/false, default: false for port 587)

**Example for Gmail:**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
SMTP_SECURE=false
```

**Note:** For Gmail, you need to:
1. Enable 2-Step Verification
2. Generate an App Password (not your regular password)
3. Use the App Password as `SMTP_PASS`

**If SMTP is not configured**, verification codes will be logged to the console instead of being sent via email.

## Project Structure

```
backend/
├── config/          # Configuration files
│   └── database.js  # MongoDB connection
├── controllers/     # Route controllers
├── models/          # MongoDB models
├── routes/          # API routes
├── middleware/      # Custom middleware
├── utils/           # Utility functions
├── .env.example     # Environment variables template
├── .gitignore      # Git ignore file
├── package.json     # Dependencies
└── server.js        # Main server file
```

## API Endpoints

- `GET /` - API welcome message
- `GET /api/health` - Health check endpoint

## Database

Make sure MongoDB is running locally or provide a MongoDB Atlas connection string in your `.env` file.

## SkillBridge AI Tutor

Phase 2 private PDF/TXT document chat is feature-flagged and documented in [`../docs/ai-tutor-document-rag.md`](../docs/ai-tutor-document-rag.md). Keep it disabled in production until the preview checklist passes.

AI Tutor is disabled by default and requires Node.js 20 or newer. Its Gemini key is backend-only and
must never be placed in a `VITE_*` variable. See the root `.env.example` for the bounded settings.

Authenticated routes are mounted at `/api/ai-tutor`:

- `GET /status` - availability, consent, limits, remaining daily usage, and UTC reset time
- `POST /consent` - record the current Google-processing acknowledgement
- `GET|POST /conversations` - paginate or create the caller's conversations
- `GET /conversations/:id/messages` - cursor-paginate the caller's messages
- `POST /conversations/:id/messages` - admit one non-streaming generation
- `DELETE /conversations/:id` - remove the caller's app-stored conversation and messages

Quota accounting is deliberate: validation failures, disabled/missing configuration, lock conflicts,
and quota rejections consume nothing. Once the atomic MongoDB daily reservation succeeds, the slot is
consumed even if Gemini times out, rejects the content, or returns an error. There are no automatic
provider retries. Retrying a failed turn is an explicit new request with a new client request ID.

One expiring MongoDB lock permits at most one active generation per account. Client request IDs are
stored with a unique per-owner index, so duplicate submissions cannot create a second provider call.
Only a bounded window of completed AI Tutor messages is sent as context; failed turns and all other
SkillBridge data are excluded.

## Creating the first admin

There's no public signup path to the `admin` role. To promote an existing registered user to admin, run `node scripts/createAdmin.js --email=you@example.com` (or run it with no args and it will prompt for the email). This is a local CLI script only - it is never exposed as an HTTP route. Once you have one admin, further admins can be promoted from the in-app User Management page.

