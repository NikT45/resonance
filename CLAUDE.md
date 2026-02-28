# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
npm run start    # Start production server
```

No test framework is configured.

## Architecture

Next.js 16 App Router project using React 19, TypeScript (strict mode), and Tailwind CSS v4.

- `app/layout.tsx` — Root layout with Geist font loaded via `next/font/google`
- `app/page.tsx` — Home page (currently the default create-next-app template)
- `app/globals.css` — Global styles; uses Tailwind v4's `@import "tailwindcss"` syntax with `@theme inline` for CSS custom properties

**Path alias:** `@/*` resolves to the project root (e.g., `@/app/...`, `@/components/...`).

**Tailwind v4 note:** Configuration is done via CSS (`@theme inline`) rather than a `tailwind.config.js` file. Custom design tokens go in `globals.css`.
