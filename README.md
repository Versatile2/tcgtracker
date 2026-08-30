This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Reference data (leaders & metas)

**A fresh database has no catalog.** Leaders and metas enter through one command:

```bash
npm run db:migrate            # schema first
npm run db:import-catalog      # pull the catalog from optcgapi
```

Everything it inserts arrives as a **draft**, which means players cannot pick it
yet. Publish what you want offered in `/admin/leaders` and `/admin/metas`. That
sounds like an extra step and is the point: the importer proposes, you decide.

The importer is **insert-only**. It can add a leader, a meta or a printing that
does not exist yet, and nothing else. Where optcgapi disagrees with a row you
already hold — a name you corrected by hand, say — it prints the disagreement and
changes nothing:

```
differs:    1 leaders — NOT modified:
  OP05-060  name: "Monkey D. Luffy" (db) vs "Monkey.D.Luffy" (api)
```

Fix those in `/admin/leaders` if they need fixing. Run the importer by hand when a
set drops — never in a build; optcgapi asks callers not to hammer the API.

Card art lives in the database (`leader_images`) and is served from
`/api/leader-images/:id`, so it comes from our own origin. Leaders are keyed by
**set code** (`OP01-003`), not name: names are not unique, and there are 15
distinct Monkey D. Luffy printings. Card images are Bandai's official promotional
scans and carry a "SAMPLE" watermark — every public source (optcgapi, Limitless,
Bandai's own card list) serves the same watermarked files.

Admin access needs a Clerk role. In the Clerk dashboard set *Sessions → Customize
session token* to `{"metadata": "{{user.public_metadata}}"}`, and give your user
public metadata `{"role": "admin"}`. Sign out and in again: the role rides in the
session token, so an existing session will not see the change.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
