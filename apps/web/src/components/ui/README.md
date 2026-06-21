/**
 * @flow-desk/web — UI components
 *
 * Each file under this directory mirrors the canonical shadcn/ui API so that
 * `pnpm dlx shadcn@latest add <name>` can replace any of them in place without
 * code changes elsewhere.
 *
 * Components installed this way (run once after `pnpm install`):
 *
 *   pnpm dlx shadcn@latest add avatar badge table select skeleton \
 *                            dropdown-menu tabs sheet dialog command tooltip \
 *                            separator input label textarea
 *
 * ReUI (kanban + friends) — already configured in `components.json`:
 *
 *   pnpm dlx shadcn@latest add @reui/kanban
 *
 * TanStack Query + Table are direct dependencies (no shadcn wrapper needed).
 *
 * The local files are intentional fallbacks so the build stays green before
 * the registry has been fetched. They use the same prop names, exports, and
 * className composition patterns as their shadcn counterparts.
 */
