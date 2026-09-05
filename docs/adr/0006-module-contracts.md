# ADR-0006 — Published module contracts instead of consumer-owned ports

## Status

Accepted, amended by [ADR-0007](0007-one-ports-file.md): the published contract
still exists and still types the decoration, but it now lives as the
`<Name>PublicApi` section of the module's `*.ports.ts` rather than in its own
`*.contract.ts`, and the `contract-is-types-only` rule is gone with it. Read the
decision below as being about the type, not the file.

Amends [ADR-0001](0001-vertical-modules.md) (which introduced
"modules are islands") and [ADR-0003](0003-ports-and-domain.md) (which defined
what a port is for).

## Context

The template originally forbade **all** imports between modules. A consumer
that needed a sibling's capability re-declared the slice it used as a
consumer-owned port in its own `*.ports.ts`, and picked the real
implementation off the Fastify instance at runtime:

```ts
// modules/onboarding/onboarding.ports.ts — hand-copied from the user service
export type UserOnboarder = {
    markOnboarded: (userId: number) => Promise<{ id: number; name: string }>;
};

// modules/onboarding/index.ts
createOnboardingService({ users: fastify.userService, ... });
```

TypeScript did check the fit at that wiring line — that part worked. Two things
did not.

**The rule could not be enforced.** With `src/types/fastify.d.ts` declaring
`userService: UserService`, every service was fully typed and reachable from
every file in the app. Adding this line to `modules/health` — a module with no
port, no import and no business touching users —

```ts
const u = await fastify.userService.getUser(1);
```

passed `tsc`, `eslint` **and** `depcruise src`. dependency-cruiser cannot see
it: there is no import edge, because the coupling travels through a runtime
property on a shared object. The same route also bypassed
`plugins-do-not-reach-into-modules`. So the port discipline was convention on
top of a global service locator, and the docs did not say so.

**The signature was copied per consumer, not per capability.** Three modules
needing `markOnboarded` meant three hand-written slices. Each was checked
against the real service; none against the others. The set of consumers was
discoverable only by grepping for `fastify.userService`.

Net: the design paid the duplication cost of interface segregation and got none
of the enforcement that made the "islands" rule worth having.

Two additional problems were structural rather than accidental. `*.ports.ts`
covered two different jobs — inverting an outbound infrastructure dependency
(`AvatarStorage`, since renamed `AvatarRepository`: three real implementations,
inversion mandatory) and naming a peer module's capability (`UserOnboarder`:
one implementation, forever). And
the mainstream modular-monolith practice this template drew on (Spring
Modulith's exposed API packages, NestJS `exports`/`imports`, Simon Brown's
package-by-component) all publish the contract from the **provider** side; the
consumer-owned form belongs to dependency _inversion_, which the peer case is
not.

## Decision

- A module that offers a capability publishes **`<name>.contract.ts`**: pure
  types over ids and plain inputs. It is the only file in the folder other
  modules may import, enforced by `modules-are-islands`.
- A contract may import **pure lib only** — deliberately narrower than a port,
  which may import the domain. An entity must not cross a module border, so a
  contract may not reference one (`contract-is-types-only`).
- **`src/types/fastify.d.ts` types each decoration as the contract, not the
  service.** `decorate()` still accepts the full service — it satisfies the
  narrower type structurally — but nothing in the app can reach past what the
  module published.
- `*.ports.ts` keeps its original job and only that: outbound infrastructure
  the module implements more than one way. Re-declaring a sibling's signature
  as a port is now a documented mistake, and `port-is-types-only` does not
  permit a port to import a contract.
- Wiring is unchanged: publishers decorate, `app.ts` registers publishers
  first, consumers read `fastify.<x>Service` in their `index.ts`.

## Consequences

- **The service-locator hole becomes a compile error.** The health-module probe
  above now fails with `Property 'getUser' does not exist on type
'UserPublicApi'`. The reachable surface of a decoration is exactly its
  contract.
- **One definition, N consumers.** No per-consumer copies to keep aligned, and
  `find all references` on a contract type lists every consumer.
- **Cross-module dependencies are import edges again**, so dependency-cruiser
  polices them. Verified at the time: importing `user.service.ts` from
  `onboarding` failed `modules-are-islands`; importing `user.contract.ts`
  passed; a contract importing its own entity or Fastify failed
  `contract-is-types-only`.
  **Since [ADR-0007](0007-one-ports-file.md):** the first still holds against
  `user.ports.ts`; `contract-is-types-only` no longer exists, so keeping
  entities out of the published section is a convention. This is the one
  enforcement this ADR bought that the later one gave back.
- **The interface is wider than one consumer needs.** A contract is a role
  interface for a capability, not for a caller — a consumer using one of three
  published methods sees all three. This is the deliberate trade: slightly less
  segregation, in exchange for a boundary a tool can check.
- **Contract changes are breaking changes.** That is the point, and it is why
  contracts stay narrow: publish the capability, not the service.
- **Extractability is unchanged.** A contract is the same shape a network
  client would take; nothing about it assumes an in-process call.

## Alternatives rejected

- **Keep consumer-owned ports.** Costs duplication that grows with consumers,
  and buys an unenforceable rule. Rejected on the enforcement point, not the
  typing effort.
- **Type the decoration as the full service and rely on review.** Keeps every
  service reachable from every file — the problem this ADR exists to fix.
- **An in-process event bus / mediator for all cross-module calls.** Buys
  extractability that is not needed yet, at the cost of losing compile-time
  handler checking and IDE navigation. Reconsider if modules ever need to be
  deployed separately; the contract types survive that move.
- **Move the shared type to `lib/`.** `lib/` is for code with no owner. A
  capability has an owner, and the contract should live beside the module that
  must keep the promise.
