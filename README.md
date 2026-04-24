# Escape Room Control

A real-time control platform for running a competitive escape-room style event called **The Survival Room**.

This project is built with **Next.js (App Router)** and **Supabase** to support live team operations, role-based views, countdown sessions, document assignment, key submissions, and leaderboard tracking.

---

## Project Overview

Escape Room Control provides two connected experiences:

1. **Participant Experience**
	 - Identity login by team email.
	 - Live session dashboard with countdown, attempts, assigned document access, and final-key submission.
	 - Fullscreen real-time command popups from the controller.
	 - Session outcome states: standby, active, survived, deactivated, terminated.

2. **Controller Experience (Admin)**
	 - Register/remove teams.
	 - Start/stop sessions with configurable duration and max attempts.
	 - Activate, deactivate (pause), or terminate teams.
	 - Assign team-specific documents through Supabase Storage.
	 - Assign per-team final keys.
	 - Broadcast live commands to all participant dashboards.
	 - Monitor submissions and view ranked leaderboard performance.

---

## What This Project Provides

- **Operational control room** for running a multi-team timed challenge.
- **Real-time synchronization** between admin and participant screens.
- **Data-driven gameplay states** persisted in Supabase tables.
- **Team-level document workflow** with upload + distribution.
- **Attempt-limited answer submission** with automatic lockout logic.
- **Live leaderboard ranking** based on completion performance.

---

## Highlights: My Next.js Work

This project showcases advanced frontend and application-flow work in Next.js:

- Built with **Next.js 16 + React 19** using the **App Router** structure.
- Implemented route-level UX for:
	- `/` landing page
	- `/login` identity verification
	- `/dashboard` participant control panel
	- `/admin` controller control room
	- `/leaderboard` live rankings
- Created rich, themed UI with custom animation system and reusable utility classes in `app/globals.css`.
- Used `next/font` and custom typography pipeline for distinct visual identity.
- Implemented role-based navigation and local session persistence (`localStorage`) to route users to participant/admin views.
- Built defensive client-side flows for missing config, invalid identity, expired session, lock states, and terminated teams.
- Added device haptic feedback support (`lib/haptics.ts`) for interaction quality on mobile hardware.

---

## Highlights: My Supabase Work

This project strongly demonstrates backend integration and real-time orchestration using Supabase:

- Integrated Supabase client with environment-driven configuration.
- Designed core tables for game orchestration:
	- `teams`
	- `submissions`
	- `broadcast`
	- `settings`
- Added migration support for gameplay evolution:
	- `terminated`, `deactivated`, `max_attempts`, `is_admin`
	- pause/resume fields (`paused_remaining_seconds`, `paused_at`)
	- per-team key and document support
- Enabled **Supabase Realtime** on key tables to keep all clients synchronized instantly.
- Implemented **Supabase Storage** pipeline with public bucket `team-documents` for team file distribution.
- Implemented live broadcast command delivery to all participants via realtime inserts.
- Added submission audit logging and administrative clearing tools.

---

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **UI:** React 19, Tailwind CSS v4, custom CSS animations
- **Backend-as-a-Service:** Supabase (Database, Realtime, Storage)
- **Language:** TypeScript
- **Linting:** ESLint

---

## Route Map

| Route | Purpose |
|---|---|
| `/` | Public landing page and event overview |
| `/login` | Team/admin identity verification |
| `/dashboard` | Participant live session view and key submission |
| `/admin` | Controller panel for full event operations |
| `/leaderboard` | Public/live ranking view |

---

## Supabase Data Model

### `teams`
Tracks team identity and all runtime session state.

Key fields include:
- `team_id`, `email`
- `active`, `terminated`, `deactivated`
- `session_start`, `session_end`
- `paused_remaining_seconds`, `paused_at`
- `attempts`, `max_attempts`
- `completed`, `completion_time`
- `final_key`, `document_url`
- `is_admin`

### `submissions`
Stores every final-key attempt for audit and admin review.

### `broadcast`
Stores live controller messages distributed to participants through realtime subscriptions.

### `settings`
Singleton settings row used for centralized config expansion.

### Storage Bucket
- `team-documents` (public): stores files assigned by admin to teams.

---

## Real-Time Behavior

The platform depends on Supabase Realtime for multi-client consistency:

- Team updates in admin are reflected in participant dashboards immediately.
- Broadcast inserts trigger fullscreen command overlays for active participants.
- Leaderboard refreshes automatically when team states change.
- Submission logs stream into admin view without manual refresh.

---

## Local Development

### 1. Prerequisites

- Node.js 18+
- npm
- Supabase project (database + storage)

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Create `.env.local` in project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_ADMIN_EMAILS=admin1@example.com,admin2@example.com
```

### 4. Initialize database

Run SQL in Supabase SQL Editor in this order:

1. `supabase/schema.sql`
2. `supabase/migration.sql`

Also ensure the `team-documents` bucket and policies are created (included in migration SQL).

### 5. Start app

```bash
npm run dev
```

Open `http://localhost:3000`.

---

## Scripts

- `npm run dev` - Start local development server
- `npm run build` - Production build
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

---

## Project Structure

```text
escape-room-control/
	app/
		admin/page.tsx         # Controller control room
		dashboard/page.tsx     # Participant live dashboard
		leaderboard/page.tsx   # Live ranking view
		login/page.tsx         # Identity verification
		globals.css            # Global styles + animations
		layout.tsx             # Root layout + metadata/fonts
		page.tsx               # Landing page
	lib/
		haptics.ts             # Device vibration feedback helper
	supabase/
		schema.sql             # Base schema
		migration.sql          # Incremental updates + policies
	types/
		styles.d.ts
```

---

## Security Note

Current SQL policies are configured for rapid event operations and testing with broad anon access. Before production hardening, tighten RLS policies around admin actions, storage writes, and team mutation paths.

---

## Why This Project Matters

This project demonstrates end-to-end full-stack execution:

- Strong **Next.js frontend architecture** for multi-role application flows.
- Practical **Supabase backend design** for real-time event control.
- Production-style features such as state orchestration, live operations, and operational tooling.

Built and themed as a complete, event-ready control platform for immersive gameplay operations.

