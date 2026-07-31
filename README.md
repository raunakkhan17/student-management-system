# EduCore

A production-oriented Student Management System for schools and colleges — built as a single, coherent application covering admissions through to graduation, with role-based access for every person who touches the institution.

Seventeen functional modules, ~230 REST endpoints, 96 database tables, and seven user roles sharing one permission model.

**Author:** Raunak Khan

---

## Contents

- [Overview](#overview)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [API conventions](#api-conventions)
- [Security](#security)
- [Project status](#project-status)
- [Licence](#licence)

---

## Overview

EduCore replaces the spreadsheet-and-paper workflow most institutions still run on. An administrator admits a student, assigns them to a class, bills them, and issues them a library card. A teacher marks attendance, sets assignments, and enters exam marks. A parent watches their child's attendance and results. Each of those people sees a different application, driven by the same permission matrix.

The design goal throughout was correctness over cleverness: money is `Decimal` end to end and never a float, derived counters are updated inside the same transaction as the record that drives them, and every mutation writes an audit entry.

---

## Features

### People and access
- **Authentication** — JWT with httpOnly cookies, refresh-token rotation with reuse detection, forced password change on first sign-in, password reset by email
- **Role-based access control** — seven roles (Super Admin, Admin, Teacher, Student, Parent, Accountant, Librarian) across a `module × action` grant matrix, enforced on every route and re-checked per request
- **Students** — admission, profiles, guardians, promotion, transfer, ID cards, timeline
- **Teachers** — profiles, qualifications, subject assignments, salary history

### Academics
- **Academic setup** — academic years, departments, courses, classes, sections, subjects, subject offerings
- **Attendance** — per-period or daily marking, configurable rules, holidays, defaulter reporting
- **Timetable** — period-based scheduling with a conflict engine that catches teacher and room clashes across separate timetables
- **Assignments** — publishing, student submissions with attachments, evaluation
- **Examinations** — schedules, marks entry, grade scales, report cards, and competition-style rankings where ties share a rank

### Operations
- **Fees** — fee structures, invoicing (single and bulk), installments, payments, receipts, refunds, scholarships, discounts, late-fee rules, outstanding reports
- **Library** — catalogue with ISBN validation, copy tracking with generated accession numbers and QR labels, issue/return/renew, reservations queue, fines
- **Hostel** — blocks, rooms (single and bulk creation), bed allocation, room transfers with approval, visitor log, mess plans, complaints
- **Transport** — vehicles with statutory document expiry tracking, drivers with licence monitoring, routes with ordered stops, student allocation with capacity enforcement, maintenance log

### Workflow
- **Leave** — applications for students and staff, approval workflow, per-type balances, month calendar
- **Notice board** — categories, scheduling, pinning, attachments, expiry, and audience targeting by role, class or section
- **Communication** — direct and group messaging with attachments, archive and mute, plus a notification centre with per-type in-app and email preferences
- **Documents** — upload and verification for sixteen document types including transfer certificates and report cards, with expiry warnings

---

## Tech stack

### Frontend
| | |
|---|---|
| Framework | Next.js 16 (App Router) · React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 · shadcn/ui · Radix UI |
| Data | TanStack Query · TanStack Table |
| State | Zustand |
| Forms | React Hook Form · Zod |
| Other | Framer Motion · Recharts · date-fns · Sonner · next-themes · Lucide |

### Backend
| | |
|---|---|
| Runtime | Node.js · Express |
| Language | TypeScript (strict) |
| Database | PostgreSQL 18 · Prisma ORM 6 |
| Auth | JSON Web Tokens · bcrypt |
| Security | Helmet · CORS · express-rate-limit · Zod validation |
| Files | Multer (local storage) |
| Export | ExcelJS · PDFKit · QRCode |
| Email | Nodemailer |

No Docker, Redis, S3 or third-party auth — the application runs against a local Postgres instance and the local filesystem.

---

## Architecture

```
┌─────────────────┐        ┌──────────────────┐        ┌──────────────┐
│  Next.js client │ ──────▶│  Express REST API │ ──────▶│  PostgreSQL  │
│  (App Router)   │  JSON  │  (Prisma ORM)     │  SQL   │              │
└─────────────────┘        └──────────────────┘        └──────────────┘
        │                           │
        │                           ▼
        │                  ┌──────────────────┐
        └─ httpOnly JWT    │  Local uploads/  │
           cookies         └──────────────────┘
```

Requests flow through a fixed pipeline: **authenticate → authorize → validate → controller → service → Prisma**. Business rules live in the service layer, never in controllers; controllers only translate HTTP to service calls and write audit entries.

---

## Getting started

### Prerequisites

- Node.js 20 or newer
- PostgreSQL 14 or newer running locally
- npm

### 1. Clone and install

```bash
git clone <repository-url>
cd student-management-system

cd backend  && npm install
cd ../frontend && npm install
```

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
```

Edit `.env` and set your PostgreSQL password in `DATABASE_URL`:

```ini
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/educore?schema=public"
```

> If your password contains `@ : / # ? %`, percent-encode it — it sits inside a URL. For example `p@ss#1` becomes `p%40ss%231`.

Generate fresh JWT secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Create the database

The database is created for you; it does not need to exist beforehand.

```bash
cd backend
npx prisma generate
npx prisma migrate dev --name init
```

The migration also runs the seed, which creates the permission matrix for all roles, a super admin, the current academic year, a 10-point grade scale, timetable periods, fee categories and email templates.

### 4. Run

Two terminals:

```bash
# Terminal 1
cd backend && npm run dev     # http://localhost:4000/api/v1

# Terminal 2
cd frontend && npm run dev    # http://localhost:3000
```

### 5. Sign in

| | |
|---|---|
| URL | http://localhost:3000 |
| Email | `admin@educore.local` |
| Password | `ChangeMe@123` |

You will be required to change the password immediately.

### Suggested first steps

Academics → create a class and a section → Students → admit a student. Attendance, fees, library, hostel, transport and the rest then have data to work with.

---

## Configuration

Key `backend/.env` values:

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | API port | `4000` |
| `API_PREFIX` | Route prefix | `/api/v1` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `JWT_ACCESS_SECRET` | Access-token signing key | — |
| `JWT_REFRESH_SECRET` | Refresh-token signing key | — |
| `JWT_ACCESS_EXPIRES_IN` | Access-token lifetime | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh-token lifetime | `7d` |
| `FRONTEND_URL` | Origin allowed by CORS, used in emails | `http://localhost:3000` |
| `UPLOAD_DIR` | Root for stored files | `src/uploads` |
| `SMTP_*` | Mail delivery | optional |

Configuration is validated with Zod at startup — the server refuses to boot on an invalid or incomplete environment rather than failing later at runtime.

Email is optional. Without SMTP configured, messages are logged instead of sent and nothing blocks.

The frontend reads `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api/v1`).

---

## Project structure

```
educore/
├── backend/
│   └── src/
│       ├── config/        # env validation, logger, Prisma client
│       ├── controllers/   # HTTP ↔ service translation
│       ├── middleware/    # authenticate, authorize, validate, uploads, errors
│       ├── prisma/        # schema, migrations, seed
│       ├── routes/        # route definitions per module
│       ├── services/      # business logic
│       ├── types/         # shared contracts
│       ├── utils/         # API responses, pagination, exports, errors
│       └── validators/    # Zod request schemas
│
└── frontend/
    ├── app/               # App Router pages
    ├── components/        # feature folders + shared primitives + ui/
    ├── hooks/             # useAuth, useTableState, useCrudMutations, …
    ├── lib/               # api client, formatting, permissions, navigation
    ├── services/          # typed API clients
    ├── store/             # Zustand stores
    └── types/             # API-mirroring types
```

Both sides are organised by feature. Shared UI primitives — data table, form dialog, confirm dialog, status badge, pickers — live in `components/common` and `components/data-table`, and every module is built from them so behaviour stays consistent.

---

## API conventions

Every endpoint returns the same envelope.

**Success**
```json
{
  "success": true,
  "data": { },
  "message": "Students retrieved successfully"
}
```

**Failure**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Enter a valid email address" }
  ]
}
```

List endpoints accept `page`, `limit`, `search`, `sortBy` and `sortOrder`, and nest pagination inside `data` so the envelope never changes shape:

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "page": 1, "limit": 20, "totalItems": 0, "totalPages": 0,
      "hasNextPage": false, "hasPreviousPage": false
    }
  },
  "message": "…"
}
```

Sortable columns are whitelisted per endpoint, so a client can never sort by an arbitrary column.

---

## Security

- **Passwords** hashed with bcrypt; never returned by any endpoint
- **Tokens** in httpOnly cookies, with refresh rotation — a replayed refresh token revokes every session for that user
- **Authorization** re-reads the user record on each request, so deactivating an account takes effect immediately rather than at token expiry
- **Input validation** with Zod on body, query and route params; parsed values replace the raw request
- **SQL injection** prevented by Prisma's parameterised queries throughout
- **Rate limiting** on authentication endpoints
- **Headers** hardened with Helmet; CORS restricted to configured origins
- **File access** authorised per file — ownership is resolved through the owning record, and stored paths are checked against the upload root so traversal cannot escape it
- **CSV exports** guard against formula injection
- **Audit trail** records actor, action, module, entity, IP and before/after values for every mutation
- **Secrets** are never hardcoded; the app reads them from the environment and validates them at boot

---

## Project status

Seventeen of twenty planned modules are implemented, and the application boots, migrates, seeds and authenticates against a live PostgreSQL database.

**Not yet built**

| Area | Note |
|---|---|
| Role dashboards with widgets | A functional permission-filtered landing page exists in its place |
| Reports hub | Per-module CSV/XLSX export already works for students, fees, library, hostel and transport |
| Settings UI | Institution profile, grade scale and permission matrix are seeded; library circulation rules have a UI |
| Audit log viewer | Audit data **is** being recorded — only the screen is missing |
| Global search | — |
| User management | Students, teachers and parents are created through their own modules; other roles come from the seed |

**Known limitations**

- No automated test suite yet
- Beyond authentication, most endpoints are verified by type-checking rather than by execution
- Single-institution; multi-tenancy is out of scope

---

## Licence

Released under the MIT Licence.

---

<p align="center">Built by <strong>Raunak Khan</strong></p>
