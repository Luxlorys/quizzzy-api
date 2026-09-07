# ADR-0012 — The generation pipeline lives in the service; the generator port is one model turn plus a correction turn

## Status

Accepted. Applies [ADR-0009](0009-third-party-integrations.md) — a thin
transport port, "one attempt, vendor errors translated to named module errors",
with the policy in the service — to the generation module, and narrows what the
`*.<tech>.service.ts` adapter family introduced in
[ADR-0010](0010-ports-folder-and-service-adapters.md) may contain. Removes the
`lib/article-text` exemption from the Anthropic row of the `ADAPTERS` table.

## Context

`generation.anthropic.service.ts` had grown into the use case. Besides calling
the model it extracted the article's text and rejected articles with too little
of it, planned the question range, validated the candidate against the domain
rules, ran a one-shot repair loop, and mapped the vendor's errors. Six things
in one file, four of which any generator — a second vendor, a local model, the
stub in a test — would need identically.

Three consequences made this more than a size complaint.

**1. The most logic-dense file in the module had no tests and could not get
any.** ADR-0005 forbids mocks, and there is no local Anthropic to run an
integration test against, so an adapter is only ever exercised in production.
Because the four use-case steps lived there, the stub generators in the unit
lane received raw HTML and skipped extraction, planning, validation and repair
entirely. The service's tests proved the lock and the failure bookkeeping and
nothing about the quiz.

**2. Half the adapter's error handling was dead code.** Structured outputs do
not support string-length or array-size constraints; the SDK strips them from
the schema it sends, folds them into the property descriptions as a hint, and
validates them client-side. With `zodOutputFormat(schema)` passed to
`messages.stream()`, that client-side parse runs inside `finalMessage()` and
rejects with a base `AnthropicError` on any length violation or on truncated
JSON. The adapter caught only `APIError`, so the rejection bypassed its
stop-reason check, its own parse and the repair turn, and the service recorded a
generic `GENERATION_INVALID_OUTPUT` with no reasons. `GenerationOutputTruncatedError`
could never be thrown — a `max_tokens` response fails the parse first. Only
violations of the domain rules ever reached the repair loop, and since
`assertValidCandidate` threw on the first violation, the model was told one
reason per turn.

**3. The rules had legitimised the leak.** The Anthropic `ADAPTERS` row carried
`alsoDependsOn: ["^src/lib/article-text\\.ts$"]`, and the layer table in
ARCHITECTURE.md listed `lib/article-text` as something the adapter may import —
documenting an accident as a design. Meanwhile every `APIError`, a 400 from a
bad parameter and a 401 included, became `GENERATION_UNAVAILABLE` with the
vendor's message dropped, and nothing logged it.

Splitting the adapter into helper files was not available: an implementation may
not import a sibling implementation or a helper
(`implementations-composed-only-at-the-root`, `anthropic-implementation-stays-below`),
and a helper may not import the SDK (`anthropic-sdk-is-contained`). The only
rule-compatible way to shrink an adapter is to move non-technology work up.

## Decision

- **The service owns the pipeline.** `generation.service.ts` reads the source,
  extracts the text with `lib/article-text`, rejects it below
  `MIN_ARTICLE_TEXT_LENGTH`, plans the question range, calls the generator,
  validates the candidate, spends up to `GENERATION_MAX_CORRECTIONS` correction
  turns, reconciles the topic and creates the quiz. Token usage is summed
  across turns; previously only the last turn was recorded.
- **The generator port returns an attempt, not an answer.** `generate` takes
  the extracted text and the planned range and returns a `GenerationAttempt`:
  the parsed candidate, that turn's usage, and `correct(reasons)`, which yields
  the next attempt. The vendor's message content stays inside that closure, so
  the service runs the correction loop without seeing an SDK type and a stub
  can implement `correct` in three lines.
- **The entity owns the limits and reports every violation.** `CANDIDATE_LIMITS`
  and `MIN_ARTICLE_TEXT_LENGTH` are domain constants; `validateCandidate`
  returns all reasons at once, numbered by question, so one correction turn can
  fix them all. The five per-violation error classes are gone; the service
  throws `GenerationInvalidOutputError(reasons)` when the budget is spent.
- **The adapter is transport.** It keeps the system prompt (limits interpolated
  from the entity), the fence and cache-control layout, the effort and thinking
  configuration, the token pre-flight, the stream and stop-reason handling. It
  takes the JSON schema from `zodOutputFormat` but not its parser, so
  `stop_reason` is checked before anything is parsed and a shape problem is
  reported as reasons rather than thrown from inside the SDK. Its Zod schema is
  shape-only: the API honours nothing else, and the lengths are the entity's.
  Vendor errors are translated in a chain — connection, rate-limit and 5xx
  failures become `GenerationUnavailableError`, every other `APIError` becomes
  the new `GenerationRequestRejectedError` — and both carry the vendor's
  message, so a misconfigured request is recorded as
  `GENERATION_REQUEST_REJECTED` with its cause rather than as an outage.
  `model_context_window_exceeded` maps to `ArticleTooLargeError`.
- **The rules follow.** `SERVICE_ALLOWED` admits `lib/article-text`; the
  Anthropic `ADAPTERS` row no longer does. The article-text lib stays in `lib/`
  by ADR-0009's own table: no state, no policy, no other module's data, no
  inbound surface.

## Consequences

- **The pipeline is covered by the unit lane.** `test/unit/generation.service.test.ts`
  proves extraction, planning, validation, the correction turn, the correction
  budget and usage accounting with `test/helpers/stub-quiz-generator.ts`. The
  adapter is still untested, by design, but what remains in it is SDK-facing
  and small.
- **A new failure code and a new env var.** `GENERATION_REQUEST_REJECTED` is
  mirrored by hand in the web's `generation-status.ts`;
  `GENERATION_MAX_CORRECTIONS` (default 1, each correction is one more billable
  call) joins the `GENERATION_*` knobs.
- **A port that returns a closure.** `GenerationAttempt.correct` is a function on
  a value that crosses a port. This is the price of keeping the conversation
  transcript out of the service; a stub pays it in three lines.
- **Adapters have a stated ceiling.** CLAUDE.md rule 2c and the ARCHITECTURE.md
  layer table now say what a `*.<tech>.service.ts` may not contain, and why it
  cannot be split into helper files.

## Alternatives rejected

- **Split the adapter into helper files** (`generation.anthropic.prompt.ts`,
  `…schema.ts`, `…errors.ts`). The boundary rules forbid it without exemptions,
  and it would have moved nothing: the use-case steps would still be untestable
  and still be the adapter's.
- **Keep the SDK's auto-parse and catch `AnthropicError`.** Restores the repair
  turn for length violations, but loses the stop-reason ordering — a truncated
  response still fails the parse before `max_tokens` is seen — and yields an
  error string instead of a list of reasons.
- **Have the article module publish `readArticleText`.** Extraction is a pure
  function with one consumer; ADR-0009's table puts it in `lib/`, and the
  article module would inherit a dependency on `sanitize-html` for a
  transformation it never needs itself.
- **Keep the repair loop in the adapter as "how this vendor is coaxed".** Any
  generator can take a correction turn; whether to spend a second billable call
  is a budget, and budgets are policy. ADR-0009 already made this call for mail.
- **Keep the length constraints in the Zod schema.** They never reach the API,
  so they were validation in disguise, duplicated against the wire schema and
  the prompt; one gate in the entity, fed by one set of constants, replaces
  three copies.
