# AI Handover Control Center

A Next.js MVP foundation for task state, AI handoffs, approvals, action logs, a unified inbox, and a content calendar. Projects, tasks, task states, handoffs, AI runs, approvals, messages, content items, routes, schedules, publish logs, and logs are stored in Supabase for persistence across refreshes.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase schema and lazy client setup
- Supabase PostgreSQL persistence for projects, tasks, task states, handoffs, AI runs, approvals, inbox messages, content planning, and logs

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000/dashboard`.

## MVP Flow

1. Create a project.
2. Create a task under that project.
3. Click `AI-1` to create a partial draft and save `task_states`.
4. Pick a switch target in the AI switcher.
5. Click `Continue` to generate a handoff pack, continue the task, and create a pending approval.
6. Approve the pending review action.
7. Add a mock inbox message, create a task from it, draft a placeholder reply, and mark it read or archived.
8. Plan content for website, Instagram, and Facebook routes, run mock AI content actions, and mock publish through the rules engine.

No Gmail, Instagram, Facebook, Viber, or live website connector is enabled yet. The inbox and content calendar use manual/mock actions first.

## Important Files

- `src/components/ControlCenter.tsx` - interactive Supabase-backed dashboard
- `src/components/InboxPanel.tsx` - unified inbox foundation with manual message capture
- `src/components/ContentCalendarPanel.tsx` - content planning, routing, schedule, mock AI actions, and mock publish UI
- `src/lib/orchestrator/taskRunner.ts` - task start and AI switch continuation logic
- `src/lib/ai/handoffBuilder.ts` - handoff pack builder
- `src/lib/rules/rulesEngine.ts` - review/block rules
- `src/lib/supabase.ts` - lazy Supabase client
- `database/schema.sql` - Supabase PostgreSQL tables for the MVP persistence layer

## Supabase Setup

1. Open your Supabase project SQL editor.
2. Run `database/schema.sql`.
3. Keep `.env.local` filled with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Restart `npm run dev` after changing env variables.

First persistence milestone:

1. Create Project.
2. Create Task.
3. Refresh the browser.
4. The project and task should still be visible because they are loaded from Supabase.

## Next Milestones

- Add Supabase Auth login.
- Add calendar filters, approval queue handoff for publish review, and media storage.
- Add real Gmail/Instagram/Facebook/Viber/website connectors after approval workflows and inbox persistence are solid.


