# Module layout reference

## API module checklist

1. Register routes in the app router module list.
2. Zod parse body/query/params at the route edge.
3. Service throws typed errors; centralized error handler maps status codes.
4. Repository never imports HTTP types.
5. Indexes on FKs and common filters; explicit `@relation` names.

## Web feature checklist

1. `api.ts` is the only place that talks HTTP for that feature.
2. Hooks wrap useQuery/useMutation with stable query keys.
3. Optimistic updates only when UX needs them; invalidate on settle.
4. Pages compose features; no raw fetch in pages.

## Cross-boundary contracts

When API response shape changes:

1. Update shared Zod or feature types.
2. Update web hooks that consume the field.
3. Add/adjust integration test on API and unit test on mapper if any.
4. Note shape in `_workspace/02_implementer_notes.md` for fd-qa.

## Socket.IO

- Namespaces by domain: `/tasks`, `/notifications`, `/collab`.
- Rooms: `workspace:{id}`, `task:{id}`.
- Auth on connection; `socket.leave` on disconnect.

---
