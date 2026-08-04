# Setting up EduCore

A complete walkthrough from a fresh `git clone` to a running, populated application.

Roughly 15 minutes, most of it `npm install`.

---

## Contents

- [What you need first](#what-you-need-first)
- [1. Clone and install](#1-clone-and-install)
- [2. Create the database](#2-create-the-database)
- [3. Configure the backend](#3-configure-the-backend)
- [4. Configure the frontend](#4-configure-the-frontend)
- [5. Run the migrations](#5-run-the-migrations)
- [6. Seed the data](#6-seed-the-data)
- [7. Start both apps](#7-start-both-apps)
- [8. Sign in](#8-sign-in)
- [Demo accounts](#demo-accounts)
- [Resetting](#resetting)
- [Troubleshooting](#troubleshooting)

---

## What you need first

| Tool | Version used | Notes |
|---|---|---|
| **Node.js** | 24.x | 20 or newer works. `node -v` |
| **npm** | 11.x | Ships with Node |
| **PostgreSQL** | 18.3 | 14 or newer works. Must be **running** before you start |
| **Git** | any | |

There is no Docker, Redis, or S3 in this project. Uploads are written to the local filesystem, so nothing else needs to be installed.

Check PostgreSQL is actually running before you go further — on Windows, look for the `postgresql-x64-18` service; on macOS, `brew services list`; on Linux, `systemctl status postgresql`.

---

## 1. Clone and install

```bash
git clone https://github.com/raunakkhan17/student-management-system.git
cd student-management-system

cd backend
npm install
npx prisma generate          # builds the typed database client

cd ../frontend
npm install
cd ..
```

Both installs together take a few minutes.

`prisma generate` reads `backend/src/prisma/schema.prisma` and writes the typed client the backend imports. Prisma usually runs it for you during `npm install`, but running it explicitly costs seconds and removes the most common "it won't start" failure. If you ever see `Cannot find module '@prisma/client'`, this is the command to re-run.

---

## 2. Create the database

Create an empty database named `educore`. Any of these works:

**psql**
```bash
psql -U postgres -c "CREATE DATABASE educore;"
```

**pgAdmin** — right-click *Databases* → *Create* → *Database…* → name it `educore`.

**createdb**
```bash
createdb -U postgres educore
```

Leave it empty. The migrations in step 5 build every table.

---

## 3. Configure the backend

```bash
cd backend
cp .env.example .env
```

Open `.env` and set three things.

**a. The database URL** — replace `CHANGE_ME` with your PostgreSQL password:

```ini
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/educore?schema=public"
```

**b. The two JWT secrets** — these are blank in the example and the server will refuse to boot without them. Generate each one separately:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run it twice and paste a different value into each:

```ini
JWT_ACCESS_SECRET=<first value>
JWT_REFRESH_SECRET=<second value>
```

**c. Everything else can stay as it is.** The defaults are development-appropriate: port 4000, CORS open to `localhost:3000`, 10 MB uploads, and email disabled.

> **Email is off by default.** `SMTP_HOST` is empty, so outbound mail is skipped and messages are recorded in the database instead. Nothing breaks; you simply don't need a mail server to run the app.

---

## 4. Configure the frontend

```bash
cd ../frontend
cp .env.example .env.local
```

The defaults are correct for local development — no edits needed:

```ini
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_APP_NAME=EduCore
```

Note the `/api/v1` suffix. Leaving it off is the most common setup mistake; every request 404s.

---

## 5. Run the migrations

```bash
cd ../backend
npx prisma migrate deploy
```

Expected:

```
All migrations have been successfully applied.
```

This creates all 96 tables. `migrate deploy` is the right command here — it applies existing migrations without prompting and never drops anything.

---

## 6. Seed the data

There are **two** seeds, and they do different jobs.

### 6a. The base seed — required

```bash
npm run seed
```

Creates the minimum a real deployment needs:

- the 980-row role/module/action permission matrix
- one super admin account
- the institution profile
- the current academic year and its attendance rules
- a default grade scale
- timetable periods
- email templates
- fee categories

```
Seeding EduCore…
  • Permission matrix: 980 new grant(s)
  • Super admin created — admin@educore.local / ChangeMe@123
Seed complete.
```

**Write down that password.** You will be forced to change it on first sign-in.

This seed is safe to re-run — each step checks whether its data already exists.

### 6b. The demo seed — optional but recommended

```bash
npm run seed:demo
```

Populates the whole application so every screen has something in it:

| | |
|---|---|
| Departments / courses / subjects | 3 / 2 / 10 |
| Teachers | 8 |
| Classes / sections | 3 / 5 |
| Students | 40, each with a guardian and address |
| Attendance | 45 sessions, 360 records |
| Exams | 6 exams, 24 papers, 104 marks |
| Fees | 3 structures, 48 invoices, 28 payments |
| Library | 8 titles, 38 copies, 12 loans (3 overdue) |
| Hostel | 2 blocks, 20 rooms, 21 boarders |
| Transport | 3 vehicles, 3 drivers, 3 routes, 18 riders |
| Extra logins | admin, accountant, librarian, 3 parents |

Every name in it is invented.

Without this seed the app works perfectly but every list is empty, and there are **no accounts except the super admin** — no teacher, student, parent, accountant or librarian to sign in as.

The demo seed refuses to run twice. If it prints `Demo data already present — nothing to do`, see [Resetting](#resetting).

---

## 7. Start both apps

Two terminals, both left running.

**Terminal 1 — backend**
```bash
cd backend
npm run dev
```
```
INFO  Database connection established
INFO  EduCore API listening on http://localhost:4000/api/v1
```

**Terminal 2 — frontend**
```bash
cd frontend
npm run dev
```
```
▲ Next.js — Local: http://localhost:3000
```

Sanity check, in a third terminal or your browser:

```bash
curl http://localhost:4000/api/v1/health
```

A healthy response reports `"status":"ok"` and `"database":{"reachable":true}`.

---

## 8. Sign in

Open **http://localhost:3000**.

**If you ran the demo seed** (step 6b), every account including the super admin uses `Demo@1234`:

```
admin@educore.local
Demo@1234
```

**If you ran only the base seed**, the super admin is provisioned with a password it will force you to replace on first sign-in:

```
admin@educore.local
ChangeMe@123
```

That prompt is `mustChangePassword` doing its job, not an error. Choose something you'll remember; there is no email server configured to recover it.

---

## Demo accounts

Available only if you ran `npm run seed:demo`. **All seven roles use `Demo@1234`.**

| Role | Email |
|---|---|
| Super Admin | `admin@educore.local` |
| Admin | `admin@demo.educore.local` |
| Teacher | `sunita.deshpande@educore.local` |
| Student | `reyansh.verma.1@student.educore.local` |
| Parent | `parent1@demo.educore.local` |
| Accountant | `accountant@demo.educore.local` |
| Librarian | `librarian@demo.educore.local` |

Any of the 8 teachers and 40 students can sign in with `Demo@1234`. Their addresses follow a pattern — teachers `firstname.lastname@educore.local`, students `firstname.lastname.N@student.educore.local`. The students list shows every address.

`parent2@` and `parent3@` also exist, linked to different children.

> The demo seed resets the super admin onto that shared password and clears the forced-password-change flag, so a walkthrough can move between all seven roles without stopping to change credentials. That flag is a real protection — it stops a deployment keeping its provisioning password — which is why the base seed sets it and only `seed-demo.ts` undoes it. Never run the demo seed against an instance holding real data.

---

## Resetting

To wipe everything and rebuild from scratch:

```bash
cd backend
npm run prisma:reset     # drops and recreates every table, then runs the base seed
npm run seed:demo        # repopulate the demo data
```

`prisma:reset` **destroys all data in the `educore` database**. It is meant for development only and will refuse to run non-interactively in some tools. Never point it at anything you care about.

After a reset the super admin password is `ChangeMe@123` again — unless you re-run `seed:demo`, which puts it back to `Demo@1234` along with every other role.

---

## Troubleshooting

**"Incorrect email or password" and you're sure it's right**

The most likely cause is that `npm run seed` was never run, so no account exists. The API deliberately returns the same message whether the account is missing or the password is wrong, so an attacker cannot discover which addresses are registered. Run the seed.

If the account does exist, note that 5 failed attempts locks it for 15 minutes (`MAX_FAILED_LOGIN_ATTEMPTS` / `ACCOUNT_LOCK_MINUTES`). A lockout returns a *different* message telling you how long to wait.

**"Environment validation failed" on backend start**

A required variable is missing — almost always one of the two JWT secrets. Re-read step 3b.

**Every API request 404s**

`NEXT_PUBLIC_API_URL` is missing the `/api/v1` suffix. Fix `frontend/.env.local` and restart the frontend; Next.js only reads env files at startup.

**"Can't reach database server at localhost:5432"**

PostgreSQL isn't running, or the password in `DATABASE_URL` is wrong.

**`Cannot find module '@prisma/client'`**

```bash
cd backend && npx prisma generate
```

**"Demo data already present — nothing to do"**

Working as intended — the demo seed won't duplicate itself. Use the [reset](#resetting) sequence.

**Port 3000 or 4000 already in use**

Change `PORT` in `backend/.env` (and match it in `frontend/.env.local`), or run the frontend on another port with `npm run dev -- -p 3001`.

---

## Useful commands

Run from `backend/`:

| Command | Does |
|---|---|
| `npm run dev` | Start the API with hot reload |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled build |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | ESLint |
| `npm run seed` | Base seed (idempotent) |
| `npm run seed:demo` | Demo data |
| `npm run prisma:studio` | Browse the database in a GUI |
| `npm run prisma:migrate` | Create a new migration after a schema change |

From `frontend/`: `npm run dev`, `npm run build`, `npm start`, `npm run lint`.
