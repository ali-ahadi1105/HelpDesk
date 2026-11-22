# TaskFlow repository guidance

- This is an npm workspace monorepo: `apps/api` is NestJS and `apps/web` is React/Vite.
- Use `npm run typecheck`, `npm test`, and `npm run build` before delivery.
- API routes are workspace-scoped. New workspace resources must enforce membership and role checks with `WorkspaceRoles`.
- Refresh tokens are stored hashed in PostgreSQL and delivered only through the HTTP-only `taskflow_refresh` cookie.
- Prisma schema changes require a matching migration under `apps/api/prisma/migrations`.
- Do not commit credentials, local environment files, generated Prisma clients, or build output.
