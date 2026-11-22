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
- `PERPLEXITY_API_KEY` connects the AI analysis of a vendor or a part. Leave it empty to run without the AI analysis. The repository then shows the analysis as not connected.
- `PERPLEXITY_AGENT_MODEL` and `PERPLEXITY_AGENT_EFFORT` are optional. Leave both empty to use the low effort setting.
- `CRON_SECRET` protects the scheduled daily check. Use a random value of at least 16 characters. The scheduled check answers only when this value is set.

## Design and sourcing

Five screens follow the MDC design, sourcing, and power guide. They sit in the navigation group named Design and sourcing.

- **Program plan** records the design basis, the reference design, the design considerations, the six gates with the evidence each gate needs, the decisions, the 90-day actions, the risk register, the milestones, and the standard workflow for each role.
- **Sourcing workflow** takes each subsystem from design fit to a primary part and a named alternate. Each line shows the benchmark, the confirm-before-purchase checklist, the contract terms, and the stop signs. The recommended alternate comes from a different ultimate parent and fits the region.
- **Vendor and part repository** holds global vendors and their parts for MDC subsystems. Every field shows its value, its source, the tier of that source, the date of the source, and its state. Each field belongs to one role. That role confirms the value or changes it with a reason.
- **Regulatory watch** reads government sources and press leads, logs every check, screens every vendor name again, and flags the vendors, parts, and sourcing lines that a change touches. The role that owns the rule topic records whether an item is material.
- **Portfolio** compares the projects a role can open by design, current gate, next milestone, sourcing coverage, open items, and rechecks.

### Who does what

- NSTT prepares the plan, the gate evidence, and each sourcing line. NSTT adds vendors and parts and owns the engineering fields of a part.
- CPI owns the identity and ownership fields of a vendor and the standards and assembly fields of a part. CPI decides Gates 0, 2, and 3 and reviews sourcing lines that carry no trade flag.
- Trade owns the screening, list, and export control fields. Trade decides Gates 1, 4, and 5 and reviews sourcing lines that carry a trade flag.
- An administrator reads every screen and changes none of this work.

The person who prepared a line or a gate cannot approve it.

A role can differ by project. A designated administrator assigns a project role on the Start here screen. An administrator takes no working role, and the practice project keeps its practice roles.

- The plan, the gates, and the sourcing lines follow the role a person holds in that project.
- The repository and the watch are shared by every project. A change there is recorded under the role the person holds in the project that is open, and it applies to every project.

### Where the facts come from

A posture is an indication for the reviewing role to confirm, and legal conclusions stay with counsel. A missing fact lowers confidence and creates an information request. The posture follows only the facts on record.

The first check of a vendor or a part fills what these public sources state, in this order of trust:

1. The US Consolidated Screening List, read from the trade.gov download and kept in memory for up to six hours.
2. Dated copies of the FCC Covered List, the Section 1260H list, and the 22 CFR 126.1 country list. Each copy carries the date it was read.
3. The Global Legal Entity Identifier registry and the SEC company list.
4. The Perplexity Agent API, when a key is set. It may report only what a public page states, with the page address and a short quote. It prefers US government pages, then regulators and registries, then standards bodies, then the maker.

Every value from these sources starts as unconfirmed. The owning role confirms it or changes it with a reason. A value that a role recorded stays on the record until that role rechecks it.

### Daily check

`vercel.json` schedules `/api/watch/cron` once a day in the hour that starts at 11:00 UTC. The host runs scheduled checks on the production deployment only and sends `CRON_SECRET` as a bearer token. In every environment, opening a design and sourcing screen starts a catch-up check when no check ran in the last 20 hours, and any granted role can choose Check now.

Development and test get a scheduled check only when both of these are in place:

1. `CRON_SECRET` is set in the host for that environment.
2. An outside scheduler calls `GET /api/watch/cron` on that environment once a day with the header `Authorization: Bearer <CRON_SECRET>`.

The route answers 503 when the secret is not set and 401 when the token does not match. The watch reports the schedule as active while a scheduled check has arrived in the last 36 hours. Production also counts as active before its first scheduled check is on record. When the secret is set and no scheduled check has arrived in that time, the watch says so and asks an administrator to confirm that the scheduler is running.

A check keeps an item when it touches a rule topic or clearly names a vendor in the repository. On the general feeds for laws, bills, executive orders, and presidential actions, a one-word vendor name counts only when that vendor has a list entry or a 22 CFR 126.1 country link. This keeps out a bill that is named after a person who shares a name with a vendor.

Each check records the sources it read, the sources that were unavailable, the new items, and every screening result that changed. A source that answers that it is busy is asked once more after a short pause. A source that still does not answer is recorded as unavailable, and the next check reads it again. A changed screening result marks any earlier confirmation as out of date and flags the vendor for recheck. An approved decision changes only when a person changes it.

The server cannot read the Chinese ministry site, fcc.gov, ferc.gov, or nerc.com. The watch names these as not connected. Their changes arrive as Federal Register notices or as press leads, and a press lead must be confirmed on the official page before anyone relies on it.

The Federal Register numbers the bulk-power order 14421. The program refers to it as Executive Order 14420. The watch matches both numbers.

## Local run

```bash
npm install
npm start
```

The local server stores records in `data.db.json`. Hosted environments use Postgres. A hosted environment without `DATABASE_URL` keeps records in memory only, and those records disappear when the function restarts.
