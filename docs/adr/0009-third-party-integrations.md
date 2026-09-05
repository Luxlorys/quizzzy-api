# ADR-0009 — Third-party code: pure mechanics in `lib/`, integrations with behavior as capability modules

## Status

Accepted. Builds on [ADR-0006](0006-module-contracts.md) (a capability is
published from the provider side) and [ADR-0007](0007-one-ports-file.md)
(implementations named by technology); refines what
[ADR-0001](0001-vertical-modules.md) meant by "shared code still moves to
`lib/`".

## Context

Third-party SDK code that more than one module needs arrives in two shapes,
and the docs so far named only one home — "shared code moves to `lib/`" —
which reads as license to put any shared integration there.

**Shape one: stateless mechanics.** Generating a presigned S3 read URL is
five lines around the SDK. No state, no policy, nothing to get wrong twice;
what differs per module — bucket, key layout, expiry — is exactly what each
module should keep owning in its port vocabulary.

**Shape two: an integration that accumulates behavior.** Mail through
SendGrid is not "call the SDK": it is retry with backoff, deduplication
against a store, a queue between accept and deliver, suppression, and its own
failure vocabulary. Duplicating that per consuming module forks the policy N
ways, so it must exist once — and `lib/mail` is the intuitive address: mail
has no entities and no routes, one factory would seem to do.

The intuition fails on four consequences, none of them stylistic:

1. **The anatomy converges anyway.** Keeping the properties the template
   already relies on — services never see the vendor SDK, the vendor is
   swappable in one file, the retry/dedup policy unit-tests against a fake
   transport — forces the same split on the `lib/` side: a pure interface
   file, an SDK-owning implementation file, a composition point. That is
   `*.ports.ts`, `*.sendgrid.repository.ts` and `index.ts` under other names,
   rebuilt where no naming convention and no dependency-cruiser rule matches
   them. The only piece actually saved is the `*PublicApi` type and the
   decoration.
2. **Something must own the lifecycle.** Retry timers, queue consumers and
   subscriber connections need start and stop; a folder of functions cannot
   own either, so a plugin ends up composing the `lib/` code and the
   integration smears across three places — logic in `lib/`, lifecycle in
   `plugins/`, configuration in `config.ts` — where a module holds all of it
   in one folder with one composition root.
3. **`lib/` may never look up.** It sits below everything and imports nothing
   above itself (`lib-is-standalone`). The first time mail must consult
   another module — unsubscribe preferences, tenant sending policy —
   `lib → modules` is a forbidden edge, and rightly so; a mail _module_
   importing `UserPublicApi` is the already-supported move. A lib can never
   consume a capability; a module can. This one is structural, not amendable
   by an exemption.
4. **Vendor integrations grow inbound surface and state.** Bounce and spam
   webhooks are HTTP routes; a suppression list is a table; delivery tracking
   is an entity. Each is impossible-or-contorted in `lib/` and boring in a
   module — and converting later renames imports in every consumer, deferred
   to the worst possible week.

## Decision

Sort shared third-party code by three questions, not by "is it shared":

| Question                                                                    | All "no" | Any "yes"         |
| --------------------------------------------------------------------------- | -------- | ----------------- |
| Does it hold **state or policy** (retries, dedup, queues, suppression)?     | `lib/`   | capability module |
| Could it need **another module's data** (preferences, tenancy)?             | `lib/`   | capability module |
| Could it grow an **inbound surface** (webhook routes) or its own **table**? | `lib/`   | capability module |

- **All "no" → a `lib/` helper.** Pure functions over the SDK
  (`lib/s3-presign.ts`), imported **only** by `*.<technology>.repository.ts`
  files and the technology's plugin — never by a service. Each module's port
  still speaks its own words (`avatarDownloadUrl`, not `getSignedUrl`). The
  helper file is added by hand to the SDK's confinement rule and to the
  implementation allowlist in `.dependency-cruiser.cjs` (for S3:
  `aws-sdk-only-in-s3-implementations` and `S3_IMPLEMENTATION_ALLOWED`), so
  the exemption is explicit and enforced rather than eroded.
- **Any "yes" → a capability module**, built and published like any other
  (ADR-0006): a thin transport port in its `*.ports.ts` (`MailTransport` —
  one attempt, vendor errors translated to named module errors), the whole
  policy in its service — retry, dedup, queue-or-send, written once and
  unit-tested with an in-memory transport — the vendor SDK confined to
  `mail.sendgrid.repository.ts` with its dependency-cruiser rule pair, dedup
  keys behind its own `mail.cache.repository.ts`, and `MailPublicApi`
  published last and decorated. Consumers wire `fastify.mailService` in their
  `index.ts` and never see the vendor, the retries or the queue.
- **The published API stays delivery-shaped.** `send({ to, template, data,
dedupKey })` — plain inputs, consumer decides what to say, mail module
  decides how delivery happens reliably. A per-feature surface
  (`sendWelcomeEmail(userId)`) would grow a method per feature and teach the
  mail module every sibling's use cases: the dependency inverted.
- **A module with no routes is legitimate.** It is the mirror image of
  `onboarding`, which has routes and no infrastructure.

Choosing `lib/` for an integration believed to stay fire-and-forget remains
permitted — as the two-file form (pure types + SDK file), composed by a
plugin, with the rule exemptions written explicitly — but the tripwire is
part of the decision: the first webhook, table, or cross-module read converts
it into a module the same week, not eventually.

## Consequences

- **"Shared code moves to `lib/`" now has a boundary.** `lib/` stays the
  layer that everything may depend on precisely because it demands nothing:
  no lifecycle, no vendor account, no state. The most-depended-on code does
  not become the least reliable code.
- **Policy exists once per integration, in a service, under the unit lane.**
  The no-mocks rule (ADR-0005) keeps working because the vendor sits behind a
  port with an in-memory twin.
- **Two extra files on day one** for an integration that might have fit in
  `lib/`. Bought with them: webhooks, tables and cross-module reads land
  without a migration, and every enforcement rule matches by existing naming
  convention.
- **The rules file stays uniform.** SDK exemptions keep pointing at
  `<module>.<technology>.repository.ts` files plus, at most, a named `lib/`
  helper — never at ad-hoc `lib/` subtrees each with private conventions.

## Alternatives rejected

- **`lib/mail` for the full integration.** Its real advantages — fewer
  files, plain imports instead of a decoration, matches the "shared code"
  intuition — are outweighed: the anatomy converges to a module without rule
  coverage, a plugin must own the lifecycle anyway, and the decisive point is
  structural — `lib/` may never look up, so preference checks and tenancy
  are unreachable from there forever.
- **A generic technology port visible to services**
  (`generateSignedUrl(bucket, key, ttl)`, `publish(channel, payload)`).
  Leaks technology vocabulary into the application layer and quietly rebuilds
  a horizontal layer; "purpose in the port, technology in the implementation"
  is the whole point of ports.
- **A plugin holding the behavior.** Plugins are lifecycle-only by rule;
  logic there escapes both the unit lane and dependency-cruiser.
- **Duplicating the policy per module.** Correct for stateless mechanics —
  five duplicated lines beat a shared abstraction — and wrong for behavior:
  retry, dedup and queue semantics forked N ways drift apart silently.
