# MDC Program Assurance

Public sign-in and backend for the MDC Program Assurance Workbench.

This repository does not contain the client register. That record stays in the private repository. A matching email domain does not grant a role. An administrator grants a role for one environment at a time.

## Environments

The three environments are development, test, and production. Each environment has its own database. Do not point more than one environment at the same `DATABASE_URL`.

Development work stays on the `development` branch. That branch does not deploy to production. Production stays on `main`.

The development workspace is at `/workbench.html`. It keeps the review queue, separation of duties, review cards, metrics, and the generated register. Team input updates those outputs. The client register is not in this repository. A granted role is required before a record is stored.

Set these values in the host for that environment, not in this repository:

- `APP_ENV` is `development`, `test`, or `production`.
- `APP_ORIGIN` is the public origin for that environment.
- `DATABASE_URL` is the Postgres connection for that environment only.
- `ADMIN_EMAILS` lists the designated administrators.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` connect Google sign-in. Leave them empty until the origin is registered.

## Local run

```bash
npm install
npm start
```

The local server stores records in `data.db.json`. Hosted environments use Postgres. A hosted environment without `DATABASE_URL` keeps records in memory only, and those records disappear when the function restarts.
