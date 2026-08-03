# EduCore — Presentation script

A role-by-role walkthrough built around one real scenario, using the data `npm run seed:demo` creates.

**Runs in about 20 minutes.** Seven roles, in the order that tells the story best: from the student the school exists for, up to the person who administers it.

---

## The scenario

> It is a Monday at **EduCore Institute**.
>
> **Reyansh Verma** (Class 9-A, roll 01, admission `ADM/2026/0001`) has a physics book due back at the library in three days and an unpaid examination fee.
>
> His class teacher is marking the register. The librarian is chasing returns. His father, **Tanmay Verma**, wants to know how he is doing. The accounts office is following up the fee. The administration wants the numbers.
>
> Seven people. One system. Each sees only what their role permits.

Everyone below signs in with **`Demo@1234`** except the super admin.

---

## Before you present

Five minutes beforehand:

- [ ] PostgreSQL running
- [ ] `cd backend && npm run dev` — wait for *"EduCore API listening"*
- [ ] `cd frontend && npm run dev` — wait for *"Local: http://localhost:3000"*
- [ ] Open http://localhost:3000 and sign in once as super admin to confirm the password works
- [ ] **Sign out again** — start the demo from the login screen
- [ ] Browser at 90–100% zoom, light mode, bookmarks bar hidden
- [ ] Have this file open on a second screen or phone

One browser window throughout. Sign out from the avatar menu, top right, between each role.

---

## 1 · Student — 3 min

**Sign in:** `reyansh.verma.1@student.educore.local`

> "This is Reyansh, a Class 9 student. This is his entire view of the system."

**Show, in order:**

1. **The dashboard.** Attendance percentage, assignments due, fees outstanding, upcoming exams. Four tiles — the things a student actually cares about.
2. **The sidebar.** Point at it deliberately. No Students. No Teachers. No Reports. No Settings. *"He can't navigate to them because he was never granted them."*
3. **Attendance** → his own record only. Nine sessions, all present.
4. **Fees** → the tile reads **₹40,000 outstanding**, made up of two invoices: `INV/2026/0001` partly paid with ₹37,500 still owing, and `INV/2026/0041` **overdue** at ₹2,500.
5. **Library** → *Concepts of Physics — Volume 1*, due in three days. Remember this; the librarian will act on it shortly.

**The point:** *A student sees his own record and nothing else.*

**Optional, if the room is technical.** Paste `http://localhost:3000/settings` into the address bar. It refuses. Say: *"That check runs on the server on every request — hiding the menu item was never the security boundary."*

---

## 2 · Teacher — 3 min

**Sign in:** `sunita.deshpande@educore.local` — Sunita Deshpande, Head of Science

> "Same system, completely different job."

**Show:**

1. **The dashboard has changed shape entirely.** Today's classes, pending attendance, assignments to evaluate, upcoming exams. *"This isn't the student page with extra buttons — the server sends a different payload for a teacher."*
2. **Attendance** → pick **Class 10, Section A, today**. The register opens with 12 students already marked: present, late, absent, on leave. Mark someone late and save.
3. **Examinations** → open an exam → a paper → the marks-entry sheet.
4. **Assignments** → note the evaluation queue.

**The point:** *Teachers get classroom tools, scoped to the classes they actually teach.*

---

## 3 · Librarian — 3 min

**Sign in:** `librarian@demo.educore.local` — Fatima Qureshi

> "The librarian's whole world is circulation."

**Show:**

1. **Library → Circulation.** Every issued book: title, who has it, their admission number, when it was issued, when it's due. Overdue rows are highlighted. **Find Reyansh's physics book** — the same loan from step 1, now seen from the desk.
2. **Search** by title, accession number or member.
3. **Catalogue** tab → 8 titles, 38 copies, availability per title.
4. **The sidebar** → Library, Students, Teachers, Reports. No Fees. No Settings.

**The reminder feature** — this is the strongest single moment in the demo:

> "Books fall due. Nobody remembers. So the system reminds them — three days out, two days, and the day before."

Run it from a terminal:

```bash
curl -X POST http://localhost:4000/api/v1/library/reminders/due \
  -H "Authorization: Bearer <token>"
```

Or, more simply for an audience: **sign in as Reyansh in a second browser and show the notification bell**. The reminder for his physics book is sitting there.

Then say the part that matters:

> "Run it twice and it sends nothing the second time. Each borrower gets one reminder per book per day, no matter how often the job fires."

**The point:** *The library manages itself; the librarian only handles exceptions.*

---

## 4 · Parent — 3 min

**Sign in:** `parent1@demo.educore.local` — Tanmay Verma, Reyansh's father

> "Now the same child, seen by his father."

**Show:**

1. **The dashboard is organised per child.** Reyansh's name, class, admission number, then his attendance, homework due, fees outstanding and recent marks.
2. **The fee figure matches** what Reyansh saw in step 1. Same data, one source.
3. **Examinations** → only Class 9 exams. *"Two exams, both his son's class. There are six in the system."*
4. **Attendance** → his son's record. Not the class register.

**The point:** *A parent sees their own children, in full, and nobody else's.*

> This was a real bug, found in testing and fixed: parents could originally see every class's exams. Worth saying out loud if the audience is technical — it demonstrates that access control was tested rather than assumed.

---

## 5 · Accountant — 2 min

**Sign in:** `accountant@demo.educore.local` — Suresh Kamath

**Show:**

1. **Dashboard** → institution-wide money: collected, pending, collection rate, outstanding invoice count.
2. **Fees → Invoices** → filter by **Overdue**. Reyansh's `INV/2026/0041` is in the list. Open it; record a payment against it.
3. **Reports** → only the reports he's permitted: fee collection, outstanding fees.
4. **The sidebar** → Fees, Reports, Notices. No Library. No Academics.

**Worth pointing out:** the accountant gets the institution-wide dashboard, but **no Recent Activity panel**. That is deliberate — the audit trail names who did what, and that isn't an accountant's business. Compare it against the admin in the next step.

**The point:** *Finance staff get the whole institution's money and none of its other business.*

---

## 6 · Admin — 3 min

**Sign in:** `admin@demo.educore.local` — Priya Raghunathan

> "Now the person who runs the school day to day."

**Show:**

1. **The full dashboard.** Eight tiles — students, teachers, new admissions, today's attendance, fees collected, fees pending, upcoming exams, recent activity.
2. **The five charts.** Attendance trend, fee collection, twelve months of student growth, gender split, department statistics. Scroll slowly; this is the screenshot slide.
3. **Recent Activity is present now** — the panel the accountant didn't get.
4. **Students** → 40 records, searchable and filterable. Open Reyansh: eight tabs — personal, guardians, academic, attendance, fees, library, documents, timeline. *"Everything the four previous people saw, in one place."*
5. **Reports** → nine exports. Download one; open the CSV in Excel to prove it's real.

**The point:** *Administrators see the institution whole.*

---

## 7 · Super Admin — 3 min

**Sign in:** `admin@educore.local` *(your own password)*

**Show:**

1. **Settings → Roles & permissions.** The full grid: 7 roles × 20 modules, 980 grants. *"Everything you've watched for the last twenty minutes comes from this one table."*
2. Trace a row aloud — find `FEES` and show that Accountant has it while Librarian doesn't. *"That's why his sidebar looked different. Not a hidden menu item — a missing grant."*
3. **Settings → Institution** → change the principal's name, save. Point out it prints on report cards, receipts and ID cards.
4. **Audit log** → the change you just made is at the top: who, when, from which IP, with a **before-and-after diff of the exact field**.

**Close on this:**

> "Every change in the system is recorded this way — actor, timestamp, IP address, and the old and new value of every field that changed. Twenty modules, one permission model, one audit trail."

---

## If something goes wrong

| Problem | Do this |
|---|---|
| A page won't load | Check the backend terminal is still running. `curl http://localhost:4000/api/v1/health` |
| Login rejected | 5 failed attempts locks an account for 15 minutes. Use a different role and come back. |
| A screen looks empty | The demo seed probably wasn't run. `cd backend && npm run seed:demo` |
| Charts don't render | Reload once. They fetch separately from the tiles so the numbers appear first. |
| You lose your place | Every step above is independent. Skip to the next role. |

**Don't demo live what you haven't rehearsed.** Run the whole script once end to end beforehand — particularly the librarian reminder, which is the only step needing a terminal.

---

## Questions you should expect

**"Is this real or mock data?"**
Real. PostgreSQL, 96 tables, generated by a seed script. Every number on screen came out of a database query. Names are invented; nothing else is.

**"What happens if a student edits the URL?"**
Refused. Permissions are checked server-side on every request. The interface hides what you can't use, but hiding was never the protection.

**"How do you know parents only see their own child?"**
It's enforced in one shared scoping helper the services call, rather than repeated per module — and it was verified by signing in as a parent and confirming the count dropped from six exams to two.

**"What's not built?"**
Two things ship deliberately read-only. Email templates can't be edited in the UI because safe editing needs variable validation and a preview — a typo in a placeholder would send broken mail to every recipient. The permission matrix can't be edited because an administrator could revoke their own access and lock everyone out with no route back. Both are changed in the seed, where the change is reviewable. There's also no automated test suite yet.

**"How long did it take?"**
Answer honestly.

---

## One-page cheat sheet

| # | Role | Email | Show |
|---|---|---|---|
| 1 | Student | `reyansh.verma.1@student.educore.local` | Own record only; empty sidebar |
| 2 | Teacher | `sunita.deshpande@educore.local` | Register marking; different dashboard |
| 3 | Librarian | `librarian@demo.educore.local` | Circulation; automated due reminders |
| 4 | Parent | `parent1@demo.educore.local` | Own child only; Class 9 exams only |
| 5 | Accountant | `accountant@demo.educore.local` | Money only; no audit panel |
| 6 | Admin | `admin@demo.educore.local` | 8 tiles, 5 charts, 9 reports |
| 7 | Super Admin | `admin@educore.local` | Permission matrix; audit diff |

Password for 1–6: **`Demo@1234`**
