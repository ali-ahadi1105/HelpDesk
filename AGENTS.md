# TaskFlow repository guidance

- This is an npm workspace monorepo: `apps/api` is NestJS and `apps/web` is React/Vite.
- Use `npm run typecheck`, `npm test`, and `npm run build` before delivery.
- API routes are workspace-scoped. New workspace resources must enforce membership and role checks with `WorkspaceRoles`.
- `WorkspaceRoles` only guards routes that carry the decorator, and the global `JwtAuthGuard` protects everything not marked `@Public()`. A route that resolves its tenant from a request body rather than a `:workspaceId` param needs its own authorization check.
- Every query that accepts a client-supplied project, column, or task id must bind it to the tenant in the same lookup (for example `where: { id, workspaceId }`). Scoping only by `projectId` allows cross-workspace writes.
- Refresh tokens are stored hashed in PostgreSQL and delivered only through the HTTP-only `taskflow_refresh` cookie.
- Refresh-token rotation is atomic: claim the presented token with a conditional `updateMany` (`revokedAt: null`, not expired) inside a transaction and persist the replacement only when exactly one row is claimed. A read-then-update leaves a reuse race.
- Single-use resources (invitations, tokens) are consumed with a conditional `updateMany` and their side effect in the same transaction, so a replay cannot create a second effect.
- Prisma schema changes require a matching migration under `apps/api/prisma/migrations`.
- The demo seed is opt-in and needs both `SEED_USER_EMAIL` and `SEED_USER_PASSWORD`. Do not reintroduce a default email or password.
- Do not commit credentials, local environment files, generated Prisma clients, or build output.
