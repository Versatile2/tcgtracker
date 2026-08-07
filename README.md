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

The leader catalog (132 real printings) and the OP01–OP16 meta list are generated
from [optcgapi.com](https://optcgapi.com), not hand-maintained:

```bash
npm run data:leaders          # refresh seed-data.ts, leader-images.ts, public/leaders/
npm run db:reset-reference    # DESTRUCTIVE: wipe tournaments/rounds, reseed the catalog
```

`npm run data:leaders` is a manual authoring step — the app never calls optcgapi at
runtime. Everything it emits is committed, so card art is served from our own origin
and keeps working offline.

Leaders are keyed by **set code** (`OP01-003`), not name: names are not unique, and
there are 15 distinct Monkey D. Luffy printings. Card images are Bandai's official
promotional scans and carry a "SAMPLE" watermark — every public source (optcgapi,
Limitless, Bandai's own card list) serves the same watermarked files.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
