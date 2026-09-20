# Introduction 
Moeen helps users manage their medications: tracking prescriptions, setting reminders, checking drug interactions and allergies, and getting AI-guided support. This repo contains the backend API that powers the mobile app. 

## Getting Started
1. Make sure you have [Node.js](https://nodejs.org/) and npm installed on your machine and [Docker](https://www.docker.com/products/docker-desktop/) (with Docker Compose) — used to run PostgreSQL locally
2. Clone the project
   ```bash
   git clone https://AI26s@dev.azure.com/AI26s/Project%20F/_git/MoeenCore
   ```
3. Navigate into the project folder
   ```bash
   cd MoeenCore
   ```

4. Install the dependencies from the moeen
   ```bash
   cd moeen
   npm install
   ```
5. copy the .env from .env.example 
   ```bash
   cp .env.example .env
   ```

6. Copy the root `.env` from `.env.example` and start PostgreSQL with Docker from the root
   ```bash
   cd ..
   cp .env.example .env
   docker compose up -d --build
   ```
   This starts a `postgres:17` container named `moeen_postgres` on port `5432`, with data persisted in a named Docker volume. Verify it's running with:
   ```bash
   docker ps
   ```

7. Push the database schema from moeen
   ```bash
   cd moeen
   npx drizzle-kit generate   # creates a migration SQL file under ./drizzle/
   npx drizzle-kit migrate    # applies it to the database
   ```
   This syncs your Drizzle schema (`src/database/schema/`) to the running Postgres database. Run this again any time you add or change schema files. (If the schema folder is still empty, this is a no-op — add your tables under `src/database/schema/` and re-export them from `src/database/schema/index.ts` first.)

8. Run the app in development mode from moeen 
   ```bash
   npm run start:dev
   ```
   The API will be available at `http://localhost:3000` by default (override with a `PORT` env var).

   Swagger and the Bull Board queue dashboard are disabled by default. Enable
   Swagger with `SWAGGER_ENABLED=true`. To enable `/queues`, set
   `QUEUE_DASHBOARD_ENABLED=true` plus a username and a password of at least 16
   characters, and expose it only through HTTPS. Browser clients must be
   listed explicitly in the comma-separated `CORS_ORIGINS` allowlist.

9. Run tests from moeen
    ```bash
    # unit tests
     npm run test

    # e2e tests
     npm run test:e2e

    # test coverage
     npm run test:cov
    ```

## Contributing

1. Create a new branch for your feature or fix
2. Make your changes and add tests where relevant
3. Open a pull request for review
4. after each change on the schema run the commands in step 6 in Getting Started
