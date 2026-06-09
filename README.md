# FRUIT

This repository was **reset to an empty application shell** so you can rebuild **start to finish** using the **GOLD** playbooks.

## Where to start

1. Open **[GOLD — README](https://github.com/gjudki/GOLD/blob/main/README.md)** (especially **How GOLD is used** and **Playbooks**).
2. Follow **[App starter](https://github.com/gjudki/GOLD/blob/main/docs/AppStarter.md)** for **Next.js + Supabase + Vercel** (this GOLD revision’s supported app path) unless you intentionally use a deferred stack documented in GOLD.
3. Use **`GOLD.md`** in this repo as your conformance stamp; update it as you make stack choices.

There is **no** `src/`, no production `package.json` scripts, and no database migrations yet—add them as you implement the guide.

## Kept on purpose

- **`GOLD.md`** — links to the mold, playbooks, and versioning docs.
- **`.cursor/rules/feature-delivery.mdc`** — economical agent defaults for feature work.
- **`FRUIT.code-workspace`** — optional Cursor/VS Code workspace file.

## CI

GitHub Actions runs a **no-op check** until you introduce a real install/build (then replace `.github/workflows/ci.yml` with something that matches your new stack).
