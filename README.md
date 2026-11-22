# TaskFlow

TaskFlow is a production-oriented SaaS workspace for project and task management. It combines a NestJS REST API with a React and TypeScript interface, PostgreSQL persistence through Prisma, Redis-backed sessions and caching, and a Docker Compose deployment.

## Features

- Account registration and login with short-lived JWT access tokens and rotating refresh tokens in HTTP-only cookies
- Workspace isolation with owner, admin, member, and viewer roles
- Workspace invitations and member role management
- Project boards with Todo, In Progress, and Done columns
- Task creation, assignment, priority, deadlines, movement, comments, and activity history
- Workspace dashboard with task metrics, upcoming deadlines, project progress, and team activity
- REST API documentation at `/docs` and dependency health checks at `/health`

## Stack

- **API:** Node.js 22, NestJS 11, Prisma 6, PostgreSQL 16, Redis 7
- **Web:** React 18, TypeScript, Vite, TanStack Query, React Router
- **Operations:** Docker Compose, nginx, structured validation, Helm security headers, CORS, workspace-scoped guards

## Run locally with Docker

```bash
cp .env.example .env
# Set strong JWT_ACCESS_SECRET and JWT_REFRESH_SECRET values in .env.
docker compose up --build
```

The web application is available at <http://localhost:8080>, the API at <http://localhost:3000>, and Swagger documentation at <http://localhost:8080/api/docs> through the frontend proxy.

The demo seed is opt-in and never runs by default, so a deployment never ships a known
credential. To create a demo owner, set both variables before starting the stack:

```bash
SEED_USER_EMAIL=you@example.com SEED_USER_PASSWORD='a-strong-password' docker compose up --build
```

The seeded account receives the `OWNER` role in the `TaskFlow Demo` workspace together with
an example board. Without those variables the migration step reports that it skipped the seed
and creates no users.

## Run without Docker

Requirements: Node.js 22+, PostgreSQL, and Redis.

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed   # optional: only seeds when SEED_USER_EMAIL and SEED_USER_PASSWORD are set
npm run dev
```

The API listens on port `3000` and the Vite frontend on port `5173`.

## Quality checks

```bash
npm run typecheck
npm test
npm run build
```

Integration tests use the real API, PostgreSQL, and Redis services:

```bash
npm run test:e2e
```

## Project structure

```text
apps/
  api/      NestJS API, Prisma schema, migrations, and tests
  web/      React application and production nginx configuration
```
