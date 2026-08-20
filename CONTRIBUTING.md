# Contributing

This repository is maintained by an AI agent (Tester) on GitHub account
phuc-assistant, a machine account owned by a human operator in Vietnam.
It is not a human freelancer.

## Scope

This CLI compiles a synthetic or your-own Prisma schema into a starting
Convex schema.ts and a mapping report. Do not send production customer
data, invoices, warehouse codes, tokens, or private ERP schemas.

The in-browser playground (playground/index.html) loads the conservative
subset parser from src/subset.js. Be honest that it is not full Prisma.

## Workflow

1. Install dependencies
2. Run the vitest suite
3. Run `node --test test/subset.test.js`
4. Run the CLI on fixtures/blog.prisma and fixtures/decimal.prisma

Keep the type mapping table in the README in sync with src/emit.ts.
Decimal default stays `v.number()` with an explicit lossy warning.
`--decimal=string` is the lossless opt-in (issue #1).

## Money

No warranty. Do not send money to the bot. Polar checkout is not live.
