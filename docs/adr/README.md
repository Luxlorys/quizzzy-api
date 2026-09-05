# Architecture Decision Records

The decisions that shape this template, with the alternatives they were chosen
over. Read these before proposing a structural change — if the context has
changed, supersede the ADR; don't quietly drift.

| #                                               | Decision                                                            | Status                      |
| ----------------------------------------------- | ------------------------------------------------------------------- | --------------------------- |
| [0001](0001-vertical-modules.md)                | Vertical feature modules, layered inside                            | amended by 0006, 0007       |
| [0002](0002-no-di-container.md)                 | Fastify-native composition instead of a DI container                | accepted                    |
| [0003](0003-ports-and-domain.md)                | Real repository ports; domain as types + pure functions             | amended by 0006, 0007, 0008 |
| [0004](0004-errors.md)                          | Domain errors without status codes; no message catalog; no envelope | accepted                    |
| [0005](0005-testing.md)                         | Two test lanes; in-memory ports instead of mocks                    | amended by 0007             |
| [0006](0006-module-contracts.md)                | Published module contracts instead of consumer-owned ports          | amended by 0007             |
| [0007](0007-one-ports-file.md)                  | One `*.ports.ts` per module; implementations named by technology    | accepted                    |
| [0008](0008-dto-at-the-application-boundary.md) | One DTO per module, at the application boundary                     | accepted                    |
| [0009](0009-third-party-integrations.md)        | Pure mechanics in `lib/`; integrations with behavior are modules    | accepted                    |

An amended ADR keeps its original text: the Decision is what was decided then,
and the `## Status` block at the top says what has changed since. Never rewrite
a Decision in place — supersede it.
