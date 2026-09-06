# ai-quiz-generation — AI layer: article → quiz generation

**Status:** implemented, then amended — see "Amendments after implementation" below
**Date:** 2026-09-06
**Repo:** quizzzy-api

**Inputs**

- Issue: none — plain description from the user (`/define-implementation`), plus a mid-task addition: _"when creating a tag for a quiz based on the article agent must get existing tags from other articles to check what already exist and whether it can take existing tag or create new one."_
- Figma: none
- Prototype: none
- Specs: `IDEA.md` (workspace root), `quizzzy-api/ARCHITECTURE.md`, `quizzzy-api/docs/adr/0009-third-party-integrations.md`, `quizzzy-api/docs/recipes.md` §2/§2b/§5, `quizzzy-api/CLAUDE.md`, the bundled `claude-api` skill (TypeScript SDK, prompt caching, agent design, token counting).
- Coordination: [`../../ai-quiz-generation-coordination.md`](../../ai-quiz-generation-coordination.md) — the shared wire contract and merge order with `quizzzy-web`.

---

## 0. Amendments after implementation

The spec below is the design as written before the code landed. Four things
changed once it shipped; where the two disagree, this section wins.

1. **`generation.anthropic.repository.ts` is now
   `generation.anthropic.service.ts`.** It adapts an external capability the
   module calls, not a store it reads and writes, and
   [ADR-0010](adr/0010-ports-folder-and-service-adapters.md) gave that family its
   own suffix. `IMPLEMENTATION_FILES` matches
   `\.[^./]+\.(repository|service)\.ts$`, and the SDK rule keys on
   `*.anthropic.service.ts` — so §4.8's filename and the two rule snippets in
   §4.9 are superseded.
2. **`generation.ports.ts` is now `generation/ports/`**, one `*.port.ts` per
   role: `repository`, `lock`, `generator`, `tokens`, `dto`, `service`,
   `public-api`. Every module follows the same shape, and
   `modules-are-islands` now admits only `ports/public-api.port.ts` across a
   border — §4.7's single-file layout is superseded by ADR-0010.
3. **The question count is dynamic, closing open question #1.** There is no
   `GENERATION_QUESTION_COUNT`. `planQuestionRange()` in `generation.entity.ts`
   derives a per-article range from the extracted text's word count — roughly one
   question per 150 words at the ceiling and per 400 at the floor — clamped to
   `GENERATION_MIN_QUESTIONS` (5) and `GENERATION_MAX_QUESTIONS` (30). The
   adapter puts that range in the instruction block, the model picks a number
   inside it, and `assertValidCandidate(candidate, range)` rejects a count
   outside it into the repair attempt. A 1,000-word article lands at 5–7
   questions, a 10,000-word one at 25–30. The system prompt carries the rule that
   makes the range safe: never pad to reach a number, cover the article's whole
   span, and skip anything a reader could answer without having read it.
4. **The default model is `claude-sonnet-5`, not `claude-opus-5`**, at
   unchanged `high` effort, and `GENERATION_MAX_OUTPUT_TOKENS` rose to 32,000 to
   cover a 30-question quiz plus adaptive thinking. One consequence is
   load-bearing: **Sonnet 5 does not support mid-conversation system messages**,
   so the repair turn appends the assistant's failed answer plus a `user`
   message rather than the `{role: "system"}` turn §4.8 described — that shape
   would return a 400 on this model. The `$0.75`-per-article figure in open
   question #4 is an Opus number; at Sonnet 5 rates it is roughly $0.30.

---

## 1. Summary

`POST /api/quizzes` currently takes a finished question set, so nothing in the product actually generates a quiz — `quizzzy-web` posts a hardcoded three-question placeholder. This spec adds the missing layer as a **new capability module, `src/modules/generation/`**, which owns a `quiz_generations` table, a global single-flight lock, and the only file in the codebase permitted to import `@anthropic-ai/sdk`.

The generation itself is a **bounded workflow, not an agent**: deterministic HTML→text extraction, one structured-output call to Claude with zero tools attached, deterministic validation, and at most one repair call. The model is given a fenced, attribute-stripped text region and a sorted list of the topics already in use, and can only emit JSON matching a schema whose bounds mirror `createQuizBodySchema`. Because it has no tools, no network access and no filesystem, a prompt injection buried in an uploaded article has nothing to actuate — the worst case is a bad quiz, not an action.

Kicking off a generation returns `202` immediately and the work continues in-process; the web polls a status endpoint. Exclusivity is a **Redis lock** — `SET NX PX` with a fencing token, released by a Lua compare-and-delete and kept alive by a task-scoped heartbeat — so the second concurrent request is a `409` and a killed process frees the lock within 90 seconds. Redis is promoted to a **hard boot dependency**: the app refuses to start without it, and two `docker-compose.yml` flags that would quietly break a lock (`allkeys-lru` eviction and no persistence) are corrected as part of this change. Quiz caching still degrades to database reads at runtime, unchanged — boot-required is not the same as request-required.

---

## 2. Task conflicts, gaps & proposed resolutions (required)

| #   | Task/spec says                                                                                                        | Reality                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Proposed resolution                                                                                                                                                                                                                                                            | Rationale                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "define what would be the **agentic pattern** to use"                                                                 | The task is fully specifiable up front: one article in, one fixed-shape quiz out. Nothing needs model-driven exploration. The bundled `claude-api` skill's own gate ("Should I Build an Agent?") fails on Complexity.                                                                                                                                                                                                                                                                               | **Not an agent.** A three-stage workflow (extract → one structured call → validate, with ≤1 repair call). Recorded as decision D1.                                                                                                                                             | An agent loop here buys nothing and costs the one thing that matters most: an agent needs tools, and tools are exactly what turns an article-borne prompt injection from "bad quiz" into "action taken". See §4.5.                                                                                                                                              |
| 2   | "how much and what **skills** we will have"                                                                           | Anthropic **Agent Skills** (`container.skills`) are a specific product feature requiring the code-execution server tool; they exist to let Claude author `.pptx`/`.xlsx`/PDF artefacts in a sandbox. They have no bearing on generating a JSON quiz.                                                                                                                                                                                                                                                | **Zero Agent Skills, zero tools.** The capability surface is one model call, `generate-quiz`. Two further candidates were considered and one is deferred, not adopted — see §4.2.                                                                                              | Naming the surface honestly matters: "skills" here means model-facing capabilities, and adding either of the two candidates now would double cost for unmeasured quality. §4.2 states what would justify each.                                                                                                                                                  |
| 3   | Implied by "add anthropic AI library **to the project**" with "both api and web available"                            | `quizzzy-web` reaches the API through a single browser-side axios instance (`shared/lib/axios.ts`) with a `NEXT_PUBLIC_*` base URL. Anything installed there ships to the browser.                                                                                                                                                                                                                                                                                                                  | `@anthropic-ai/sdk` is installed in **`quizzzy-api` only**. `ANTHROPIC_API_KEY` is a server-only var in `src/config.ts` and must never appear in `quizzzy-web/src/env.ts`.                                                                                                     | An API key in a `NEXT_PUBLIC_*` var, or an SDK call from a client component, publishes the key to anyone who opens devtools. Called out because the phrasing invites it.                                                                                                                                                                                        |
| 4   | "**secure from prompt injection** when reading a file"                                                                | There is currently **no sanitisation at all**. `article.schema.ts:5` caps HTML at 2,000,000 characters and `article.entity.ts` checks only the file extension and non-emptiness; `article.file.repository.ts` writes the bytes verbatim and `readSource` hands them straight back. `<script>`, HTML comments, `display:none` blocks and `alt`/`title`/`aria-label` payloads all survive.                                                                                                            | Six layered defences (§4.5), the load-bearing one being **capability denial** — no tools of any kind on the request. Extraction (§4.4) strips scripts, comments and every attribute before the model sees a byte.                                                              | "Secure from prompt injection" is not achievable as a filter — you cannot reliably detect adversarial instructions in prose. It is achievable as containment: give the model nothing to do and a schema it can't escape.                                                                                                                                        |
| 5   | "implement a **lock system**…" — and, after review, **"do lock mechanism through redis, make redis required to run"** | Redis is wired but built to be absent: `lazyConnect`, a `.catch()` swallowing the initial `connect()`, `enableOfflineQueue: false`, errors logged not thrown. There is no queue, worker, cron or lock anywhere. Two container settings actively break a lock: `docker-compose.yml` runs Redis with **`--maxmemory-policy allkeys-lru`** (a lock key can be _evicted_ while its TTL is still live — eviction is not expiry) and **`--save "" --appendonly no`** (a restart silently drops the lock). | `SET NX PX` + a Lua compare-and-delete in Redis (§4.6), and Redis promoted to a hard boot dependency (§4.12) — which means changing the plugin, `/health`, and both Redis flags above.                                                                                         | The original objection was that Redis was _configured_ to be optional, so a lock there could not be trusted; making it genuinely required removes that objection at its root. The two container flags are not incidental — leaving `allkeys-lru` in place makes the lock silently wrong under memory pressure, which is the worst failure mode a lock can have. |
| 6   | Mid-task: "agent must get **existing tags from other articles**"                                                      | There is no tag table and no tag on `Article`. The only thing resembling one is `Quiz.topic`, a bare `String` (`prisma/schema.prisma`), capped at 60 chars by `createQuizBodySchema`. It hangs off the **quiz**, not the article, and `quiz.ports.ts` publishes **no `QuizPublicApi` at all**.                                                                                                                                                                                                      | Read the vocabulary as `SELECT DISTINCT topic FROM quizzes`, exposed through a **new** `QuizPublicApi.listTopics()`. No new table. Reuse is enforced deterministically after the call, not left to the model (§4.3).                                                           | Matches the data that exists, needs no migration on the topic side, and the deterministic snap makes reuse correct even when the model picks `"aws lambda"` for an existing `"AWS Lambda"`.                                                                                                                                                                     |
| 7   | Mid-task, implied: existing tags are safe reference data                                                              | Every existing topic is prior **model output derived from a prior, untrusted article**. Feeding them back in makes the vocabulary a second injection channel — a hostile article can plant a topic today that is read back as trusted context tomorrow.                                                                                                                                                                                                                                             | Topics are rendered as a **JSON array inside the fenced data region**, never as prose, and are rejected at write time if they contain newlines or angle brackets (§4.3). Length is already bounded at 60.                                                                      | This is a stored-injection path that nothing in the original ask accounts for; it is cheap to close now and awkward to close after the table has data.                                                                                                                                                                                                          |
| 8   | Gap — not mentioned in the task                                                                                       | `quiz.ports.ts` has no `QuizPublicApi` section, and `ArticlePublicApi` exposes only `getArticle(id) → {id, filename}` — **no way to read the article HTML across a module border**. `modules-are-islands` in `.dependency-cruiser.cjs` blocks any other route in.                                                                                                                                                                                                                                   | Both published APIs grow: `ArticlePublicApi.readArticleSource(id)` and a new `QuizPublicApi` with `createQuiz` + `listTopics` (§4.7). Both decorations typed in `src/types/fastify.d.ts`.                                                                                      | Without these the generation module cannot read its input or write its output. This is the single largest piece of work the task description doesn't mention.                                                                                                                                                                                                   |
| 9   | Gap — not mentioned in the task                                                                                       | The API is one Node process with no worker, no queue and no scheduler. `server.ts` uses `close-with-grace` with a 10s delay. Fastify runs with `requestTimeout: 0` and `connectionTimeout: 0` (defaults, never overridden in `app.ts`), so a synchronous endpoint _would_ work — it would just hold a connection open for minutes with nothing able to observe or dedupe it.                                                                                                                        | Generation runs as a detached in-process task after the `202`. A crash mid-run orphans a `running` row; the Redis lock's TTL frees exclusivity within 90s and a boot sweep reconciles the row (§4.6). The only `setInterval` is the lock heartbeat, scoped to one running job. | Proportionate to a single-user personal tool, and it is what makes the lock _observable_: a synchronous call has no id to poll and no row for the 409 to point at. A queue is the right answer only if this ever becomes multi-user; noted in §7.                                                                                                               |
| 10  | Gap — "token limits" stated, size not                                                                                 | The 2,000,000-character article cap is ~500K tokens. At `claude-opus-5` input pricing ($5/MTok) a single worst-case article costs ≈ $2.50 of input before any output.                                                                                                                                                                                                                                                                                                                               | Hard cap `GENERATION_MAX_INPUT_TOKENS` (default 150,000), measured with `client.messages.countTokens` against the assembled prompt before the billable call; over-cap throws `ArticleTooLargeError` → 422 (§4.8).                                                              | The existing 2M cap was sized for "a file we store on disk", not "a file we pay to read". Truncating silently would produce a quiz about the first third of an article with no signal to the user, so it rejects.                                                                                                                                               |
| 11  | Stale docs, no code impact                                                                                            | `ARCHITECTURE.md` §6 and `docs/recipes.md` still describe the template's `task` / `user` / `onboarding` modules and an S3 avatar upload. None exist; the modules are `article`, `quiz`, `health`, and article storage is local disk (`article.file.repository.ts`).                                                                                                                                                                                                                                 | Left alone — out of scope for this change. Flagged so nobody follows `recipes.md` §2 looking for `modules/user/user.s3.repository.ts`.                                                                                                                                         | The _patterns_ those docs describe are still authoritative and are what this spec follows; only the file names they cite are stale.                                                                                                                                                                                                                             |
| 12  | Convention collision                                                                                                  | `CLAUDE.md` hard rule 11 forbids all comments, but `src/config.ts`, `src/app.ts` and every plugin carry extensive JSDoc (they predate the rule).                                                                                                                                                                                                                                                                                                                                                    | New code in this change is **comment-free**, including the lines added to `config.ts` and `.dependency-cruiser.cjs`. Existing comments are not touched.                                                                                                                        | The hard rule is authoritative over local precedent; naming the collision stops an implementer "matching the surrounding style" and failing review.                                                                                                                                                                                                             |

Everything else in the task checked out. Verified directly against `prisma/schema.prisma`, `src/config.ts`, `src/app.ts`, `src/modules/{article,quiz}/**`, `.dependency-cruiser.cjs`, `package.json` and `test/**`.

---

## 3. Approach & key decisions

| #   | Decision                                                                                                              | Rationale                                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Workflow, not an agent. One `generate-quiz` call, zero tools.                                                         | Fails the agent gate on Complexity; and a tool-free request is the strongest available injection containment. See §4.2, §4.5.                                                                                                                                                                                                                                            |
| D2  | A **new module** `src/modules/generation/`, not code inside `modules/quiz/`.                                          | ADR-0009's decision table answers **yes** on all three questions — it holds state and policy (lock, retries, token budget), it needs another module's data (article source, quiz topics), and it grows both an inbound surface (status routes) and its own table. `quiz.ports.ts` is already 170 lines; the lock is not a quiz concern.                                  |
| D3  | Lock in Redis: `SET <key> <token> NX PX <ttl>`, released by a Lua compare-and-delete. Redis becomes required to boot. | The user's call, and it resolves the original objection at its root (conflict #5). Redis also gives TTL-based expiry for free, so a killed process self-heals with no scheduled cleanup — the thing a Postgres lock needed a lease column and a takeover transaction to emulate. Cost: two container flags must change, and `/health` must cover Redis (§4.12).          |
| D3a | The lock repository **fails closed**; the cache repository keeps degrading. Both talk to Redis.                       | ARCHITECTURE.md puts failure policy in the implementation, not the port, so two ports over one store may hold two policies. A cache error means "read the database" — a latency trade. A lock error means "I cannot prove nobody else is generating", and answering that with "go ahead" is the exact failure the lock exists to prevent. `503`, never a silent proceed. |
| D3b | Redis is required **at boot**, not on every request.                                                                  | Boot-required ≠ request-required. The app refuses to start without Redis, so the lock always has a store — but a mid-flight Redis blip still degrades quiz caching to database reads exactly as ARCHITECTURE.md describes. The caching contract is unchanged and `quiz.cache.repository.ts` is not touched.                                                              |
| D4  | The lock is **global** (one generation at a time app-wide), not per-article.                                          | Literally what was asked, and correct for `IDEA.md`'s stated constraint of a single user with no accounts. A per-article lock would let ten generations run at once and bill accordingly.                                                                                                                                                                                |
| D5  | Short lock TTL (90s) renewed by a **task-scoped** heartbeat, plus a boot sweep — not one long TTL.                    | A long TTL couples the lock to `ANTHROPIC_REQUEST_TIMEOUT_MS`: raise the timeout and you silently break the lock. Renewal removes that coupling. The timer is started and cleared in one job's `try`/`finally` — a task-scoped timer, not the scheduler the repo deliberately lacks. A `kill -9` frees the lock within 90s even if the process never returns.            |
| D6  | Topic vocabulary is **pre-fetched into the prompt**, not exposed as a `search_topics` tool.                           | Same information, one fewer round trip, and it keeps the tool surface at zero (D1). A personal app will hold dozens of topics, not thousands. Revisit past ~200 topics — §7.                                                                                                                                                                                             |
| D7  | Topic reuse is enforced **deterministically after** the model returns, not trusted from it.                           | Case- and whitespace-insensitive matching against the existing vocabulary, snapping to the stored casing. Makes reuse a property of the code, unit-testable without the API, and immune to the model simply not following the instruction.                                                                                                                               |
| D8  | Structured output via `output_config.format` with a **byte-stable** schema, rather than forced tool use.              | Forced `tool_choice` is being removed on newer models and adds a tool to a request whose whole security story is having none. A fixed schema also protects the prompt cache — see §4.9.                                                                                                                                                                                  |
| D9  | Stream the call and take `.finalMessage()`, rather than a plain non-streaming `create`.                               | The bundled skill's guidance: stream anything with long input. A 150K-token article at high effort can run for minutes, and streaming removes request-timeout risk at no cost. Nothing consumes the partial stream — the caller is a background task.                                                                                                                    |
| D10 | Extraction lives in `src/lib/article-text.ts`, imported **only** by the Anthropic implementation.                     | Exactly ADR-0009's "all three answers no → a `lib/` helper, imported only by `*.<technology>.repository.ts`". It holds no state and no policy. Requires one allowlist entry in `.dependency-cruiser.cjs` (§4.10) so the exemption is explicit rather than eroded.                                                                                                        |
| D11 | The token cap is enforced **in the implementation**, throwing a named module error.                                   | Mirrors `article.file.repository.ts` throwing `ArticleSourceMissingError`. The _limit value_ arrives from config at the composition root, exactly like `ARTICLE_STORAGE_DIR`. The service never learns what a token is.                                                                                                                                                  |
| D12 | A failed generation is **never auto-retried** at the job level.                                                       | Transport retries (429/5xx) belong to the SDK, and one validation-repair call is bounded. Auto-retrying a whole job while holding a global lock is how a personal tool wedges itself and runs up a bill unattended. The user re-triggers.                                                                                                                                |
| D13 | Per-call token usage is persisted on the job row.                                                                     | Cost visibility is the only guard a single-user app has, and `cache_read_input_tokens` is the one signal that tells you whether §4.9's caching actually works. Free to record.                                                                                                                                                                                           |
| D14 | Model `claude-opus-5`, adaptive thinking, effort left at the default (`high`), all three overridable by env.          | Question quality is the product. `medium` is the first cost lever to pull if the bill matters, but that is the user's call to make against real output, not a default to pre-emptively downgrade.                                                                                                                                                                        |

---

## 4. Implementation detail

### 4.1 Module placement

New module `src/modules/generation/`, following the file roles in `CLAUDE.md` hard rule 1:

```
src/modules/generation/
  generation.entity.ts            # GenerationStatus, the job entity, quiz-candidate validation
  generation.errors.ts            # named errors
  generation.ports.ts             # ports → DTOs/inputs/service → GenerationPublicApi (in that order)
  generation.prisma.repository.ts # the job table, and the lock
  generation.anthropic.repository.ts  # the ONLY file importing @anthropic-ai/sdk
  generation.dto.ts               # toGenerationDto / toStartGenerationInput / toGenerationResponse
  generation.service.ts           # the use cases and the workflow
  generation.schema.ts            # wire shapes
  generation.routes.ts            # thin handlers
  index.ts                        # composition root; mounts /api/generations
src/lib/article-text.ts           # HTML → plain text (D10)
```

Registered in `src/app.ts` **after** `articleModule` and `quizModule`, since it consumes both decorations:

```ts
await app.register(articleModule); // mounts /api/articles
await app.register(healthModule, { prefix: "/health" });
await app.register(quizModule); // mounts /api/quizzes and /api/attempts
await app.register(generationModule); // mounts /api/generations
```

`quizModule` must become `fp`-wrapped and decorate `quizService` (it currently does neither) — see §4.7.

### 4.2 The model-facing capability surface ("skills")

**One capability ships: `generate-quiz`.** No Anthropic Agent Skills, no server tools, no client tools.

Two further candidates were evaluated:

| Candidate                                                                           | Verdict                   | Why                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extract-article` — use the model to pull the article body out of navigation chrome | **Rejected**              | Deterministic extraction is cheaper, faster and strictly safer: it runs _before_ any model sees the bytes, which is what makes the tag/comment/attribute stripping a real boundary rather than something the model is asked to respect.                          |
| `review-quiz` — a second call grading the draft for groundedness and answerability  | **Deferred, not adopted** | The classic LLM-as-judge pass. It roughly doubles cost per generation for quality that has not been measured yet. Adopt it if, after using the thing, questions turn out to be unanswerable from the article or to have more than one defensible answer. See §7. |

The whole prompt surface is: a frozen `system` block (role, rules, the output contract, the fence protocol), plus a per-request user turn carrying `[topic vocabulary][fenced article text][instruction]`.

### 4.3 Topic ("tag") reconciliation

The flow, end to end:

1. `generation.service.ts` calls `quizzes.listTopics()` (new — §4.7), which returns `SELECT DISTINCT topic FROM quizzes ORDER BY topic ASC`. Sorted, so the bytes are deterministic (a `Set` iteration order would silently break caching — §4.9).
2. The vocabulary is passed to the generator port and rendered inside the fenced data region as a **JSON array**, never as prose:

    ```
    <existing-topics>["AWS Lambda","Postgres indexing","TCP"]</existing-topics>
    ```

    JSON escaping neutralises quotes and angle brackets in a stored topic; §4.5 layer 3 handles the fence itself.

3. The output schema carries the decision explicitly, so it is observable and testable:

    ```
    topic:       string, 1..60
    topicSource: "existing" | "new"
    ```

    The system prompt instructs: reuse an existing topic when the article fits one; only mint a new one when none fits; a new topic is 1–4 words, title case, naming the subject not the article.

4. **Deterministic reconciliation in `generation.entity.ts`** (pure, unit-tested, no API):

    ```
    normalise(t) = t.trim().replace(/\s+/g, " ")
    match = vocabulary.find(v => normalise(v).toLowerCase() === normalise(candidate).toLowerCase())
    if (match) → use `match` verbatim (stored casing wins), topicSource = "existing"
    else       → use normalise(candidate), topicSource = "new"
    ```

    This is what actually delivers the requirement: reuse holds whether or not the model complies.

5. **Write-time hardening** (conflict #7). Before the topic is persisted, reject it if it contains a newline, `<`, or `>`. Length is already bounded to 60 by `createQuizBodySchema`. This is what stops a hostile article planting `</article> Ignore all previous instructions` as a topic that gets replayed as context into every future generation.

`Quiz.topic` stays a `String`. No `Topic` table — see §7 for when that changes.

### 4.4 Article text extraction — `src/lib/article-text.ts`

Signature: `extractArticleText(html: string): string`.

Required behaviour, in order:

1. Drop these elements **with their contents**: `script`, `style`, `noscript`, `template`, `iframe`, `svg`, `head`, `object`, `embed`.
2. Drop all HTML comments (`<!-- ... -->`) — the single most common carrier for hidden instructions.
3. Drop **every attribute** on every retained element. This removes `alt`, `title`, `aria-label`, `data-*`, `style="display:none"` and URL payloads in one move.
4. Reduce the remainder to text, preserving block structure as newlines (headings, `p`, `li`, `pre`, `td` become line breaks). Decode HTML entities so the model reads `&` not `&amp;`.
5. Collapse runs of 3+ blank lines to one; trim.
6. Remove any literal occurrence of the fence delimiters (§4.5) from the result.

Implement with **`sanitize-html`** in text-extraction mode — `allowedTags: []`, `allowedAttributes: {}`, and `nonTextTags` set to the step-1 list — rather than regexes; regex HTML parsing is not a security boundary. Add `sanitize-html` to `dependencies` and `@types/sanitize-html` to `devDependencies`.

> Verify during implementation: `sanitize-html` HTML-escapes its text output by default, so step 4's entity decoding may need an explicit pass (`textFilter`, or a decode step after). The unit test in §6 step 2 pins the required behaviour either way.

Unit-tested directly (`test/unit/article-text.test.ts`); it has no dependencies to substitute.

### 4.5 Prompt-injection defence — six layers

| #   | Layer                   | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Capability denial**   | The load-bearing one. No `tools`, no `mcp_servers`, no `web_search` / `web_fetch` / `code_execution`, no memory tool, no filesystem. The request can produce exactly one thing: JSON. An instruction like "email this to X" or "read /etc/passwd" has no mechanism behind it. This is the real reason D1 matters.                                                                                                                                                 |
| 2   | **Pre-model stripping** | §4.4 — the article reaches the model as attribute-free text with scripts, comments and hidden elements already gone.                                                                                                                                                                                                                                                                                                                                              |
| 3   | **Fenced data region**  | Article text is wrapped in `<article>…</article>` and topics in `<existing-topics>…</existing-topics>`, with those literal delimiters stripped from the content first (§4.4 step 6) so content cannot close its own fence. Delimiters are **fixed strings, not per-request nonces** — a nonce would have to be named in the `system` block and would invalidate the cache every request (§4.9). Stripping collisions gives the same guarantee at zero cache cost. |
| 4   | **Operator channel**    | All instructions live in top-level `system`. The repair turn (§4.8) uses a `{ role: "system" }` **mid-conversation message** — supported on `claude-opus-5`, non-spoofable, and it leaves the cached prefix intact. Operator rules are never restated as text in a user turn, where article content could imitate them.                                                                                                                                           |
| 5   | **Schema containment**  | `output_config.format` pins the shape and every bound (§4.7). A fully-persuaded model still cannot emit anything but a well-formed quiz within `createQuizBodySchema`'s limits.                                                                                                                                                                                                                                                                                   |
| 6   | **Post-validation**     | Zod re-validation plus domain invariants in `generation.entity.ts`: `single` has exactly one correct option, `multi` has ≥1, option texts are unique within a question, prompts are unique within the quiz, `topic` passes §4.3 step 5. Failure → one repair call, then fail the job.                                                                                                                                                                             |

Two consequences worth stating outright:

- The API key is never in the model's context, so a successful injection cannot exfiltrate it.
- Quiz text is model output derived from an untrusted file. `quizzzy-web` must render it as **text**, never via `dangerouslySetInnerHTML` — carried in the coordination doc.

### 4.6 Schema change and the lock

Two stores, two jobs, and the split is the whole design: **Redis is authoritative for "may I start"; Postgres is authoritative for "what happened".** The job row still exists — the web polls it for status — it just no longer carries the mutual exclusion.

#### The job table — `prisma/schema.prisma`

> Per `CLAUDE.md` hard rule 6 and this skill's boundaries: **do not run a migration as part of implementing this section.** Edit `schema.prisma`, then `npm run prisma:migrate:create`, review the SQL, then `apply`.

```prisma
enum GenerationStatus {
  pending
  running
  succeeded
  failed
}

model QuizGeneration {
  id             Int              @id @default(autoincrement())
  articleId      Int              @map("article_id")
  status         GenerationStatus @default(pending)
  lockToken      String           @map("lock_token")
  quizId         Int?             @map("quiz_id")
  failureCode    String?          @map("failure_code")
  failureMessage String?          @map("failure_message")
  inputTokens     Int?            @map("input_tokens")
  outputTokens    Int?            @map("output_tokens")
  cacheReadTokens Int?            @map("cache_read_tokens")
  createdAt      DateTime         @default(now()) @map("created_at")
  updatedAt      DateTime         @updatedAt      @map("updated_at")
  finishedAt     DateTime?        @map("finished_at")

  article Article @relation(fields: [articleId], references: [id], onDelete: Cascade)
  quiz    Quiz?   @relation(fields: [quizId], references: [id], onDelete: SetNull)

  @@index([status])
  @@index([createdAt(sort: Desc), id(sort: Desc)])
  @@map("quiz_generations")
}
```

Back-relations to add: `generations QuizGeneration[]` on both `Article` and `Quiz`.

Versus the earlier Postgres-lock draft: `lockKey String @unique` and `leaseExpiresAt` are **gone**, replaced by a plain `lockToken` — the same random token held in the Redis key, stored so the boot sweep and the release path can tell "my job" from "somebody else's". `@@index([status])` is new; the boot sweep queries by status.

#### The lock — `generation.cache.repository.ts`

The filename follows the convention exactly: it implements a port using Redis, so it is `<module>.cache.repository.ts`, and it is automatically covered by the existing `cache-implementation-stays-below` and `redis-only-in-cache-implementations` rules — **no new dependency-cruiser rule is needed for the lock** (only for the Anthropic SDK, §4.10).

| Concern | Value                                                                           |
| ------- | ------------------------------------------------------------------------------- |
| Key     | `generation:v1:lock` — a fixed single key; versioned prefix matching `quiz:v1:` |
| Value   | a `randomUUID()` fencing token, also written to `quiz_generations.lock_token`   |
| TTL     | `GENERATION_LOCK_TTL_SECONDS`, default **90**                                   |
| Renewal | every `GENERATION_LOCK_RENEW_SECONDS`, default **30**                           |

**Acquire** — one atomic command, no read-then-write:

```
SET generation:v1:lock <token> NX PX <ttlMs>
```

`"OK"` → acquired. `null` → someone holds it → `GenerationInProgressError` (**409**). A thrown error → `GenerationLockUnavailableError` (**503**), never treated as "free".

**Release** — a Lua compare-and-delete, because a plain `DEL` can delete a _different_ job's lock if this one's TTL expired first:

```lua
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
```

**Renew** — the same guard, extending rather than deleting:

```lua
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
```

A renew returning `0` means the lock was lost (evicted, expired, or force-cleared). The running task must **abort** at that point and mark the job `failed` with `LOCK_LOST` rather than finish and write a quiz it no longer holds the right to write.

**Port** — purpose in the port, technology in the implementation:

```ts
export type GenerationLock = {
    acquire: (token: string) => Promise<boolean>;
    renew: (token: string) => Promise<boolean>;
    release: (token: string) => Promise<void>;
    holder: () => Promise<string | null>;
};
```

No `SET`, `NX`, `PX` or TTL vocabulary crosses into the service. `holder()` backs the boot sweep and lets `GET /api/generations/active` distinguish "a job row says running" from "the lock is actually held".

**Failure policy — the opposite of the cache repository, deliberately (D3a).** `quiz.cache.repository.ts` catches everything and returns a miss. `generation.cache.repository.ts` catches nothing: every method lets the ioredis error escape, and the service translates it to `GenerationLockUnavailableError`. This is the same architectural rule ("two failure policies are decided in the implementation, not the port") producing the opposite answer for a different port, and the unit tests pin both directions (§6 step 3).

#### Heartbeat and crash recovery (D5)

The background task renews every 30s inside a `try`/`finally`, so the timer cannot outlive the job:

```
const timer = setInterval(renew, GENERATION_LOCK_RENEW_SECONDS * 1000);
try { ...generate... } finally { clearInterval(timer); await lock.release(token); }
```

This is the one `setInterval` in `src/`, and it is scoped to a single in-flight job rather than being a scheduler. Recovery paths, in order of how often they fire:

1. **Normal completion / failure** — `finally` releases the lock immediately.
2. **Process killed, does not restart** — renewal stops, the key expires within 90s, the next request acquires cleanly. The stale `running` row is reconciled to `failed` (`LOCK_LOST`) the first time anything reads it.
3. **Process killed, restarts** — a **boot sweep** in `modules/generation/index.ts` marks every `pending`/`running` row `failed` with `LOCK_LOST` and, if the Redis key still holds one of those rows' tokens, releases it by token. Recovery is immediate rather than waiting out the TTL.

> The boot sweep assumes **exactly one API instance** — which is true here (`docker-compose.yml` runs a single `api` service, and `IDEA.md` scopes this to one user). With two instances it would clear a peer's live job; the token check makes it release only locks it can prove are orphaned, but the row transition would still be wrong. If this ever scales out, drop the sweep and rely on path 2.

#### Where this is weaker than a database lock, stated plainly

Redis persistence is the honest gap: if Redis restarts mid-generation, the key is gone and a second generation can start beside the first. Three things bound it, and §4.12 makes the first two real:

- `--appendonly yes` so a restart reloads the key rather than starting empty.
- `--maxmemory-policy noeviction` so the key cannot be evicted while its TTL is live.
- The `quiz_generations` row still exists either way, so a double-run is visible and recoverable rather than silent — two rows, one lock token, and the loser's renew returns `0` and aborts.

### 4.7 Ports, published APIs and the wire contract

**`generation.ports.ts`** — in the order `CLAUDE.md` rule 1 requires (outbound ports, then DTO/inputs/service, then the published API last):

```ts
export type GenerationRepository = {
    create: (data: NewGeneration) => Promise<Generation>;
    findById: (id: number) => Promise<Generation | null>;
    findActive: () => Promise<Generation | null>;
    save: (generation: Generation) => Promise<Generation>;
    failUnfinished: (now: Date) => Promise<Generation[]>;
};

export type GenerationLock = {
    acquire: (token: string) => Promise<boolean>;
    renew: (token: string) => Promise<boolean>;
    release: (token: string) => Promise<void>;
    holder: () => Promise<string | null>;
};

export type QuizCandidate = {
    title: string;
    topic: string;
    topicSource: "existing" | "new";
    questions: {
        kind: QuestionKind;
        prompt: string;
        explanation: string;
        options: { text: string; isCorrect: boolean }[];
    }[];
};

export type GenerationUsage = {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
};

export type GenerateQuizInput = {
    articleHtml: string;
    filename: string;
    knownTopics: string[];
    questionCount: number;
};

export type QuizGenerator = {
    generate: (
        input: GenerateQuizInput,
    ) => Promise<{ candidate: QuizCandidate; usage: GenerationUsage }>;
};
```

`GenerationRepository` no longer owns exclusivity — `create` just inserts, and `failUnfinished` backs the boot sweep. Mutual exclusion is entirely `GenerationLock` (§4.6).

`GenerationServiceDeps` therefore carries both, plus the two published APIs and the clock:

```ts
export type GenerationServiceDeps = {
    repository: GenerationRepository;
    lock: GenerationLock;
    generator: QuizGenerator;
    articles: ArticlePublicApi;
    quizzes: QuizPublicApi;
    clock: Clock;
};
```

…followed by `GenerationDto`, `StartGenerationInput`, `GenerationService`, and last:

```ts
export type GenerationPublicApi = {
    getActiveGeneration: () => Promise<GenerationRef | null>;
};
```

**`ArticlePublicApi` grows one method** (conflict #8) — `article.ports.ts`:

```ts
export type ArticleSourceRef = { id: number; filename: string; html: string };

export type ArticlePublicApi = {
    getArticle: (articleId: number) => Promise<ArticleRef>;
    readArticleSource: (articleId: number) => Promise<ArticleSourceRef>;
};
```

`ArticleService.getArticleSource` already returns exactly this shape, so the implementation is a rename at the composition root, not new logic.

**`QuizPublicApi` is new** — appended last in `quiz.ports.ts`:

```ts
export type CreatedQuizRef = { id: number; title: string; topic: string };

export type QuizPublicApi = {
    createQuiz: (input: CreateQuizInput) => Promise<CreatedQuizRef>;
    listTopics: () => Promise<string[]>;
};
```

`QuizService.createQuiz` already exists and returns a `QuizDto`, which satisfies `CreatedQuizRef` structurally. `listTopics` is new on `QuizRepository` and `QuizService`. `modules/quiz/index.ts` must become `fp`-wrapped (like `modules/article/index.ts`) and `fastify.decorate("quizService", service)`.

**`src/types/fastify.d.ts`** gains — typed as the _published API_, never the service:

```ts
quizService: QuizPublicApi;
generationService: GenerationPublicApi;
anthropic: Anthropic;
```

**Routes** — `generation.routes.ts`, prefix `/api/generations`:

| Method | Path      | Body / Params   | Success                            | Errors                                                                                                                                             |
| ------ | --------- | --------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/`       | `{ articleId }` | `202` `GenerationResponse`         | `404` article not found · `409` `GenerationInProgressError` · `422` `ArticleTooLargeError`, empty article · `503` `GenerationLockUnavailableError` |
| GET    | `/active` | —               | `200` `GenerationResponse \| null` | —                                                                                                                                                  |
| GET    | `/:id`    | `id` path param | `200` `GenerationResponse`         | `404`                                                                                                                                              |

`generation.schema.ts`:

```ts
export const startGenerationBodySchema = z.object({
    articleId: z.number().int().positive(),
});

export const generationStatusSchema = z.enum([
    "pending",
    "running",
    "succeeded",
    "failed",
]);

export const generationResponseSchema = z.object({
    id: z.number().int(),
    articleId: z.number().int(),
    status: generationStatusSchema,
    quizId: z.number().int().nullable(),
    failureCode: z.string().nullable(),
    failureMessage: z.string().nullable(),
    createdAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
});
```

**One addition to the shared error vocabulary.** `lib/errors.ts` has no 503 category — `AppErrorCode` is `NOT_FOUND | CONFLICT | UNPROCESSABLE | UNAUTHORIZED | FORBIDDEN`. A lock whose store is unreachable is genuinely none of those: it is not a conflict (nobody is provably holding it) and it is retryable, which 409 and 422 both deny. Add:

```ts
export type AppErrorCode =
    | "NOT_FOUND"
    | "CONFLICT"
    | "UNPROCESSABLE"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "SERVICE_UNAVAILABLE";

export class ServiceUnavailableError extends AppError {
    readonly code = "SERVICE_UNAVAILABLE";
}
```

plus `SERVICE_UNAVAILABLE: 503` in `STATUS_BY_CODE` in `plugins/error-handler.ts`. `GenerationLockUnavailableError` subclasses it. This is a two-line change to two shared files, and it is what keeps D3a honest — without a 503 the only options are lying with a 409 or swallowing the error and proceeding.

No list endpoint, so hard rule 7 (every list is paginated) does not apply. `failureMessage` carries a **safe, enumerated** string — never a raw SDK error, never anything derived from article content.

**Generator output schema** — mirrors `createQuizBodySchema` bound for bound, so the model cannot produce something `POST /api/quizzes` would reject:

| Field                     | Bound                          |
| ------------------------- | ------------------------------ |
| `title`                   | string, 1–200                  |
| `topic`                   | string, 1–60                   |
| `topicSource`             | `"existing" \| "new"`          |
| `questions`               | array, 1–30 (config default 8) |
| `questions[].kind`        | `"single" \| "multi"`          |
| `questions[].prompt`      | string, 1–1000                 |
| `questions[].explanation` | string, **1**–2000             |
| `questions[].options`     | array, 2–8                     |
| `options[].text`          | string, 1–500                  |
| `options[].isCorrect`     | boolean                        |

Two notes on this table:

- `createQuizBodySchema` declares `explanation` as `z.string().trim().max(2000)` with **no `.min()`**, so an empty explanation is legal on the wire. The generator schema deliberately requires ≥1 — `IDEA.md` promises "a short 'why' explanation" for every wrong answer, and a quiz with blank explanations is a silent product failure, not a validation one. Stricter here is safe: everything the generator emits still satisfies the wire schema.
- The wire schema renames on the way out: `createQuizBodySchema` uses `type` / `question` where the domain uses `kind` / `prompt`. The generation module calls `QuizPublicApi.createQuiz` with a `CreateQuizInput` (domain naming) and never touches the wire shape.

**`draftQuiz` is a second validation funnel, and it throws.** `quiz.entity.ts` independently enforces ≥1 question, ≥2 options, and `single` ⇒ exactly one correct / `multi` ⇒ ≥1 correct, raising `EmptyQuizError` / `NotEnoughOptionsError` / `InvalidAnswerKeyError` (all `UnprocessableError`). The generation service must **catch those from `QuizPublicApi.createQuiz` and route them into the repair path** (§4.8) rather than letting them escape as a 500 on a background task. §4.5 layer 6 duplicates these invariants on purpose so the common case never reaches `draftQuiz` in a failing state.

### 4.8 The Anthropic implementation — `generation.anthropic.repository.ts`

The only file importing `@anthropic-ai/sdk`. Factory: `createAnthropicQuizGenerator(client, options)`, where `options` carries the model, effort, `maxInputTokens`, `maxOutputTokens` and `maxRetries` from config, wired in `index.ts`.

Client lifecycle in a new `src/plugins/anthropic.ts` (per ADR-0009 / ARCHITECTURE.md §1: the plugin owns the client and nothing else):

```ts
const client = new Anthropic({
    apiKey: fastify.config.ANTHROPIC_API_KEY,
    maxRetries: fastify.config.ANTHROPIC_MAX_RETRIES,
    timeout: fastify.config.ANTHROPIC_REQUEST_TIMEOUT_MS,
});
fastify.decorate("anthropic", client);
```

**Request shape:**

- `model`: `config.ANTHROPIC_MODEL` (default `claude-opus-5`)
- `max_tokens`: `config.GENERATION_MAX_OUTPUT_TOKENS` (default 16000)
- `thinking: { type: "adaptive" }` — no `budget_tokens`; it is rejected with a 400 on this model
- `output_config: { effort: config.GENERATION_EFFORT, format: <the §4.7 schema> }`
- `system`: `[{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }]`
- `messages`: one user turn — `[{ type: "text", text: topicsBlock + articleBlock, cache_control: { type: "ephemeral" } }, { type: "text", text: instruction }]`
- **no `tools`, no `mcp_servers`, no `container`**

Called with `client.messages.stream(...)` then `await stream.finalMessage()` (D9). Parse the text block, then validate with the same schema.

**Token limit (D11).** Before the billable call, `await client.messages.countTokens({ model, system, messages })`. If `input_tokens > maxInputTokens`, throw `ArticleTooLargeError` — no truncation (conflict #10). Never estimate with `tiktoken`; it is OpenAI's tokenizer and undercounts Claude by 15–20%.

**Retries — three distinct layers, deliberately:**

| Layer                        | Mechanism                                                                                                                  | Bound                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Transport (429/5xx/timeouts) | SDK `maxRetries` on the client                                                                                             | `ANTHROPIC_MAX_RETRIES`, default 3 |
| Output validation            | One repair call appending a `{ role: "system" }` message listing the validation errors, reusing the cached prefix verbatim | exactly 1                          |
| Whole job                    | none (D12)                                                                                                                 | 0 — the user re-triggers           |

**`stop_reason` handling — check it before reading `content`:**

| `stop_reason` | Action                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| `end_turn`    | parse and validate                                                                                         |
| `max_tokens`  | fail `GENERATION_OUTPUT_TRUNCATED` — do not retry unchanged; the fix is a higher cap or fewer questions    |
| `refusal`     | fail `GENERATION_REFUSED`, log `stop_details.category`, **do not retry** — a retry will refuse identically |

Errors are caught as the SDK's typed classes most-specific-first (`Anthropic.BadRequestError` → `Anthropic.AuthenticationError` → `Anthropic.RateLimitError` → `Anthropic.APIError`), translated into named errors from `generation.errors.ts`. The service never sees an SDK type.

> Two things to confirm against the installed SDK version at implementation time, both with a stated fallback:
>
> - `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod` against **Zod 4** (`package.json` pins `zod: ^4.4.3`; the helper historically targeted Zod 3). If it does not accept a v4 schema, hand-write the JSON Schema literal for `output_config.format` and keep the Zod schema alongside it for post-validation. Either way the §4.7 bounds are the contract.
> - Whether `output_config.format` composes with `thinking: { type: "adaptive" }` on `claude-opus-5`. If not, drop `thinking` for this call before dropping the structured output — schema containment is layer 5 of the security model, adaptive thinking is a quality nicety.

### 4.9 Prompt caching

Render order is `tools` → `system` → `messages`, and caching is a prefix match: one changed byte invalidates everything after it.

| Block                               | Breakpoint | TTL   | What it buys                                        |
| ----------------------------------- | ---------- | ----- | --------------------------------------------------- |
| `system` (frozen prompt + contract) | yes        | `1h`  | Read by **every** generation. This is the real win. |
| topics + fenced article text        | yes        | 5 min | Read only by the repair call within the same run.   |
| instruction tail                    | no         | —     | Varies; must sit after the last breakpoint.         |

Rules the implementation has to hold:

- **The system prompt is frozen.** No date, no filename, no job id, no article length, no question count interpolated into it. The requested question count goes in the instruction tail.
- **The output schema must be byte-stable** — build it once as a module constant. Do **not** vary `maxItems` with the requested question count; `output_config` renders ahead of `system`, so a per-request schema invalidates the entire cache on every call.
- **Topics must be sorted** (§4.3 step 1). Iterating a `Set` gives insertion order and would break the prefix non-deterministically.
- The `system` block must exceed **512 tokens** (the `claude-opus-5` minimum) or it silently will not cache — no error, just `cache_creation_input_tokens: 0`.
- The article breakpoint pays for itself only because of the repair call. **If the repair path is ever removed, remove this breakpoint too** — otherwise every generation pays the 1.25× write premium on bytes nothing ever reads back.
- Persist `usage.cache_read_input_tokens` (D13). Zero across repeated generations means a silent invalidator crept in.

### 4.10 Boundaries — `.dependency-cruiser.cjs`

Add one allowlist constant beside the existing trio:

```js
const ANTHROPIC_IMPLEMENTATION_ALLOWED = `${IMPLEMENTATION_ALLOWED}|^node_modules/@anthropic-ai|^node_modules/zod|^src/lib/article-text\\.ts$`;
```

and two rules mirroring the Redis/Prisma pairs exactly:

```js
{
    name: "anthropic-implementation-stays-below",
    severity: "error",
    comment:
        "An Anthropic repository implements a generator port from *.ports.ts; it may not reach up " +
        "into services, routes or schemas, and it may not import Fastify or Prisma.",
    from: { path: "^src/modules/[^/]+/[^/]+\\.anthropic\\.repository\\.ts$" },
    to: { pathNot: ANTHROPIC_IMPLEMENTATION_ALLOWED, dependencyTypesNot: ["core"] },
},
{
    name: "anthropic-only-in-anthropic-implementations",
    severity: "error",
    comment:
        "@anthropic-ai/sdk may be imported only by *.anthropic.repository.ts files, the anthropic " +
        "plugin (client lifecycle), the fastify type augmentation, and tests.",
    from: {
        pathNot:
            "\\.anthropic\\.repository\\.ts$|^src/plugins/anthropic\\.ts$|^src/types/fastify\\.d\\.ts$|^test/",
    },
    to: { path: "^node_modules/@anthropic-ai" },
},
```

Three notes on the allowlist:

- `zod` is admitted **only** to this implementation, so the schema sent to the model and the schema used to validate its reply are one object and cannot drift. `dto-stays-pure` and `service-sees-no-infrastructure` are untouched.
- `article-text.ts` is admitted only here — ADR-0009's rule for a `lib/` helper (implementations may import it, services may not). It is deliberately **not** added to `IMPLEMENTATION_ALLOWED`, so the Prisma, cache and file repositories still cannot reach it.
- `options.tsPreCompilationDeps: true` is already set, so even `import type Anthropic from "@anthropic-ai/sdk"` in a service trips the rule. The boundary is real, not just a runtime-import convention.

`implementations-composed-only-at-the-root` matches `\.[^./]+\.repository\.ts$`, so it picks up `generation.anthropic.repository.ts` automatically — no edit needed for that one.

### 4.11 Config — `src/config.ts` and `.env.example`

New entries in the Zod schema (type is inferred; add matching lines to `.env.example`; **no comments**, per conflict #12):

| Variable                        | Zod                                             | Default         |
| ------------------------------- | ----------------------------------------------- | --------------- |
| `ANTHROPIC_API_KEY`             | `z.string().min(1)`                             | — (required)    |
| `ANTHROPIC_MODEL`               | `z.string().min(1)`                             | `claude-opus-5` |
| `ANTHROPIC_MAX_RETRIES`         | `z.coerce.number().int().min(0)`                | `3`             |
| `ANTHROPIC_REQUEST_TIMEOUT_MS`  | `z.coerce.number().int().positive()`            | `600000`        |
| `GENERATION_EFFORT`             | `z.enum(["low","medium","high","xhigh","max"])` | `high`          |
| `GENERATION_MAX_INPUT_TOKENS`   | `z.coerce.number().int().positive()`            | `150000`        |
| `GENERATION_MAX_OUTPUT_TOKENS`  | `z.coerce.number().int().positive()`            | `16000`         |
| `GENERATION_QUESTION_COUNT`     | `z.coerce.number().int().min(1).max(30)`        | `8`             |
| `GENERATION_LOCK_TTL_SECONDS`   | `z.coerce.number().int().positive()`            | `90`            |
| `GENERATION_LOCK_RENEW_SECONDS` | `z.coerce.number().int().positive()`            | `30`            |

`ANTHROPIC_API_KEY` is required so production fails fast at boot. Tests pass config as a plain value into `buildApp`, so a dummy string is enough and no test ever needs a real key.

`REDIS_URL` is already `z.string().min(1)` with no default, so nothing changes in the schema — what changes is that the _connection_ now has to succeed (§4.12).

Add one cross-field guard to the schema, since renewing less often than the TTL is a lock that expires under its own running job:

```ts
.refine(
    (config) => config.GENERATION_LOCK_RENEW_SECONDS * 2 <= config.GENERATION_LOCK_TTL_SECONDS,
    { message: "GENERATION_LOCK_RENEW_SECONDS must be at most half of GENERATION_LOCK_TTL_SECONDS" },
)
```

`loadConfig` already surfaces `safeParse` issues as a startup throw, so a bad pair refuses to boot with a readable message. Note `AppConfig` is `z.infer<typeof envSchema>` — `.refine` returns a `ZodEffects`, so the inferred type still resolves and the "never hand-write a config type" rule (hard rule 9) holds.

### 4.12 Making Redis required to run

Four changes, none of which touch `quiz.cache.repository.ts` — the caching contract is unchanged (D3b).

**1. `src/plugins/redis.ts` — fail boot instead of warning.** The `.catch()` on the initial connect is what currently makes Redis optional:

```ts
client.connect().catch((error: unknown) => {
    fastify.log.warn({ err: error }, "redis initial connection failed");
});
```

becomes an awaited connect, so the plugin rejects, autoload fails, `buildApp` rejects, and `server.ts` exits non-zero:

```ts
await client.connect();
```

Three things must **not** change while doing this:

- The `client.on("error", …)` listener stays, and stays registered _before_ `connect()`. An unhandled `error` event is a fatal exception in Node, and a connect failure emits one — remove the listener and a Redis outage crashes the process instead of failing the boot cleanly.
- `lazyConnect: true` stays. It is what makes an explicit awaited `connect()` possible at all.
- `enableOfflineQueue: false` and `maxRetriesPerRequest: 1` stay. For a lock, failing fast is the point: a queued or retried `SET NX` is a lock decision made against stale state.

Fastify's default `pluginTimeout` is 10s, so a Redis that is reachable but very slow fails the boot with a plugin-timeout error rather than hanging. That is the desired behaviour; it is worth knowing when reading the error.

**2. `docker-compose.yml` — stop configuring Redis as a disposable cache.** Both flags on the `redis` service are wrong for a lock:

| Now                              | Change to                       | Why                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--maxmemory-policy allkeys-lru` | `--maxmemory-policy noeviction` | `allkeys-lru` can evict the lock key while its TTL is still live. Eviction is not expiry: the lock silently disappears and two generations run. `volatile-*` policies do not help — the lock key _has_ a TTL, so it is a candidate. Under `noeviction` a full instance fails writes instead, which the lock reads as `GenerationLockUnavailableError` → 503. Failing loudly beats losing exclusivity silently. |
| `--save "" --appendonly no`      | `--appendonly yes`              | Without persistence a Redis restart starts empty and the lock is gone while a generation is still running. AOF reloads it.                                                                                                                                                                                                                                                                                     |

`maxmemory 256mb` can stay: cached quizzes are small and expire in 60s, so `noeviction` should never actually bite.

The `api` service already has `depends_on: redis: condition: service_healthy`, so the container path is correct as-is — only the flags change.

**3. `/health` must cover Redis.** `modules/health/index.ts` currently only pings Postgres, so a dead Redis would report `ok` on an app that can no longer generate anything:

```ts
const healthResponseSchema = z.object({
    status: z.enum(["ok", "degraded"]),
    database: z.enum(["up", "down"]),
    cache: z.enum(["up", "down"]),
});
```

with a `await fastify.redis.ping()` beside the existing `SELECT 1`, and `503` when either is down.

> **This breaks a passing test.** `test/int/app.test.ts:20` asserts `toEqual({ status: "ok", database: "up" })` — an exact match. It must become `{ status: "ok", database: "up", cache: "up" }`. Expect that failure; it is the change landing, not a regression.

**4. `.env.example` — the comment on `REDIS_URL` is now false.** It reads "A Redis outage degrades to database reads; it does not fail requests." Replace it with the accurate split: Redis is required to boot, quiz caching still degrades to database reads, and generation refuses to start without the lock. (`.env.example` is documentation, not code, so `CLAUDE.md` rule 11 does not apply to it — but the `config.ts` entries added in §4.11 still get no comments.)

**Not changed on purpose:** `test/int/quiz.cache.repository.test.ts`'s "degrades to a miss when Redis is unreachable" case builds its own dead client rather than going through the plugin, so it still passes and still pins the cache's degrade behaviour. That is the D3b split holding in the test suite.

---

## 5. Edge cases

| Case                                                                  | Handling                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Second generation requested while one is active                       | `SET NX` returns `null` → `GenerationInProgressError` → **409**. The web also disables the control from `GET /api/generations/active`.                                                                                                      |
| Process crashes mid-generation, does not restart                      | Renewal stops; the key expires within `GENERATION_LOCK_TTL_SECONDS` (90s). The next request acquires cleanly. The stale `running` row reconciles to `failed` / `LOCK_LOST` when next read.                                                  |
| Process crashes mid-generation, then restarts                         | The boot sweep in `index.ts` fails every `pending`/`running` row with `LOCK_LOST` and releases the Redis key if it still holds one of their tokens. Recovery is immediate, not TTL-bound (D5).                                              |
| Redis goes down _during_ a generation                                 | The next renew throws → the task aborts and marks the job `failed` / `GENERATION_UNAVAILABLE`. Quiz caching independently degrades to database reads, unchanged (D3b).                                                                      |
| Redis restarts mid-generation (key lost)                              | With `--appendonly yes` the key reloads. Without it, a second generation can start; both rows exist, and the original's renew returns `0`, so it aborts with `LOCK_LOST` rather than writing a quiz it no longer holds the lock for (§4.6). |
| Lock key evicted under memory pressure                                | Cannot happen once `--maxmemory-policy noeviction` lands (§4.12). Until then it is the one silent way two generations run at once — which is why that flag is part of this change, not a follow-up.                                         |
| Redis unreachable at the moment of acquire                            | `GenerationLockUnavailableError` → **503**. Never treated as "lock is free" (D3a).                                                                                                                                                          |
| Article file missing on disk                                          | `ArticleSourceMissingError` from `article.file.repository.ts` propagates through `readArticleSource` → job `failed`, code `ARTICLE_SOURCE_MISSING`.                                                                                         |
| Article over the token cap                                            | `ArticleTooLargeError` → **422**, before any billable call. No truncation (conflict #10). The lock is released; nothing is charged.                                                                                                         |
| Article is all markup / extraction yields (almost) no text            | Extraction result under a floor (e.g. 200 chars) → `EmptyArticleTextError` → 422, before the call.                                                                                                                                          |
| Article contains `</article>` or `<existing-topics>` literally        | Stripped by §4.4 step 6 before fencing. Content cannot close its own fence.                                                                                                                                                                 |
| Article carries injected instructions                                 | Layers 1–6 (§4.5). Worst realistic outcome is a low-quality or off-topic quiz, which the user sees and can regenerate. No action is reachable.                                                                                              |
| Model returns invalid JSON, or valid JSON failing an invariant        | One repair call with the errors listed in a `{ role: "system" }` message; still failing → job `failed`, code `GENERATION_INVALID_OUTPUT`.                                                                                                   |
| `stop_reason: "max_tokens"`                                           | Fail `GENERATION_OUTPUT_TRUNCATED`. Not retried unchanged.                                                                                                                                                                                  |
| `stop_reason: "refusal"`                                              | Fail `GENERATION_REFUSED`; log `stop_details.category`. Not retried.                                                                                                                                                                        |
| Anthropic 401 / bad key                                               | `Anthropic.AuthenticationError` → job `failed`, code `GENERATION_UNAVAILABLE`. Message is generic — never echo the SDK error to the client.                                                                                                 |
| Rate limited                                                          | SDK retries per `ANTHROPIC_MAX_RETRIES`; exhausted → `GENERATION_UNAVAILABLE`.                                                                                                                                                              |
| Model picks a topic differing only in case/whitespace from one in use | §4.3 step 4 snaps it to the stored casing and records `topicSource: "existing"`. No duplicate topic is created.                                                                                                                             |
| Model invents a topic containing markup                               | §4.3 step 5 rejects it before persistence; falls into the repair path.                                                                                                                                                                      |
| Vocabulary is empty (first ever quiz)                                 | `<existing-topics>[]</existing-topics>`. The prompt handles the empty case; `topicSource` is necessarily `"new"`.                                                                                                                           |
| Article deleted while its generation is running                       | `onDelete: Cascade` removes the job row. The background task's final `save` finds nothing; treat "row gone" as a no-op, not an error.                                                                                                       |
| Redis down at boot                                                    | The app **refuses to start** (§4.12). This is the point of the change: no Redis, no lock, no generation.                                                                                                                                    |
| `GET /api/generations/active` with nothing running                    | `200` with a `null` body. Simpler for the web to consume than a 404.                                                                                                                                                                        |

---

## 6. Implementation plan

Each step is a reviewable PR on its own.

1. **Publish what the new module needs.** Add `readArticleSource` to `ArticlePublicApi` + `article.service.ts`; add `QuizPublicApi` (`createQuiz`, `listTopics`) to `quiz.ports.ts`, `listTopics` to `QuizRepository`/`QuizService`/`quiz.prisma.repository.ts`; `fp`-wrap `modules/quiz/index.ts` and decorate `quizService`; type both in `src/types/fastify.d.ts`. Tests: extend `quiz.service.test.ts` and `quiz.prisma.repository.test.ts`. No new behaviour is user-visible yet. **`npm run check && npm run test:int`.**
2. **`src/lib/article-text.ts` + `sanitize-html`.** Pure function, no wiring. `test/unit/article-text.test.ts` covers: script/style/comment removal, attribute stripping (including `alt` and `title` payloads), entity decoding, block structure preserved as newlines, fence-delimiter collisions neutralised.
3. **Make Redis required** (§4.12) — do this **before** anything depends on the lock, so a misconfigured environment fails at boot rather than at the first generation. `plugins/redis.ts` awaited connect; `/health` pings Redis and its response schema grows `cache`; `docker-compose.yml` flags flipped to `noeviction` + `appendonly yes`; `.env.example` comment corrected. **Update `test/int/app.test.ts:20`** — its exact-match health assertion breaks by design. Then verify by hand: stop the Redis container, `npm run dev`, confirm a non-zero exit with a readable error. **`npm run check && npm run test:int`.**
4. **Job table + the lock.** `schema.prisma` per §4.6, `prisma:migrate:create`, **review the SQL**, `apply`. Then `generation.entity.ts`, `generation.errors.ts` (including `GenerationLockUnavailableError`, plus `ServiceUnavailableError`/`SERVICE_UNAVAILABLE` in `lib/errors.ts` and `plugins/error-handler.ts` — §4.7), the port half of `generation.ports.ts`, `generation.prisma.repository.ts`, and `generation.cache.repository.ts` with the two Lua scripts. `test/int/generation.cache.repository.test.ts` is the load-bearing one and proves, against the real Testcontainers Redis: a second `acquire` returns `false`; `release` with the **wrong** token does not free the lock; `renew` with the wrong token returns `false`; a key past its TTL is acquirable again; and — mirroring `quiz.cache.repository.test.ts`'s dead-client case in the opposite direction — an unreachable Redis makes every method **throw** rather than degrade.
5. **Service + workflow, generator stubbed.** `generation.service.ts` and the rest of `generation.ports.ts`. Unit-tested with `test/helpers/in-memory-generation-lock.ts` (a real implementation of the port over a `Map`, plus a `createBrokenGenerationLock()` twin that rejects — mirroring `createBrokenQuizCache`), an in-memory `GenerationRepository`, an in-memory `QuizGenerator` (canned candidate / throws on demand), stub `ArticlePublicApi` + `QuizPublicApi`, and `fixed-clock.ts`. Covers: 409 on a held lock, **503 rather than a silent proceed when the lock throws** (D3a), the boot sweep, abort-on-lost-renew, topic snapping (D7), failure recording, and the lock always released in `finally`.
6. **The Anthropic implementation.** `plugins/anthropic.ts`, `generation.anthropic.repository.ts`, config entries, `.env.example`, both `.dependency-cruiser.cjs` rules, and `@anthropic-ai/sdk` in `dependencies`. **Verify `npm run boundaries` fails if the SDK is imported anywhere else** — that assertion is the point of the rule. No test calls the live API.
7. **Routes, composition, docs.** `generation.schema.ts`, `generation.dto.ts`, `generation.routes.ts`, `index.ts`, registration in `app.ts`, `GenerationPublicApi` decorated. `test/int/generation.routes.test.ts` drives 202 → 409 → status transitions with a stub generator injected through `test/int/helpers/build-test-app.ts` (which needs a generator override — a real change to that helper). Confirm the new endpoints appear at `/docs`.
8. **One manual end-to-end run** against a real key: upload an article, generate, read the quiz. Check `usage.cache_read_input_tokens` on a _second_ generation is non-zero (§4.9), and `kill -9` the process mid-generation to confirm the boot sweep frees the lock on restart. Unblocks the `quizzzy-web` work — see the coordination doc.

---

## 7. Out of scope

- **The `review-quiz` second pass** (§4.2). Adopt only if questions prove unanswerable from the article in practice.
- **A `Topic` table.** `Quiz.topic` stays a string. Introduce one when topics need renaming, merging, or a colour/icon — at which point `listTopics` is the only thing that changes shape.
- **A `search_topics` tool.** Only worth it past ~200 topics (D6), and it reintroduces a tool surface that §4.5 layer 1 deliberately removes.
- **A job queue or worker process.** In-process is correct for one user (conflict #9). Revisit if this ever becomes multi-user, at which point the global lock (D4) is wrong anyway.
- **Streaming generation progress to the browser** (SSE/websockets). Polling is enough; there is no existing SSE surface.
- **Regenerating a quiz for an article that already has one.** Nothing blocks it — you get a second quiz. Deduplication is a product decision, not made here.
- **Lowering the 2,000,000-character article cap** in `article.schema.ts`. The generation cap (§4.11) is the effective limit; changing the upload cap is a separate call.
- **Retiring `POST /api/quizzes`.** It stays: the generation module calls the same use case through `QuizPublicApi`, and the endpoint is still the way to create a quiz by hand.
- **Batch API / 50% discount.** Only sensible for bulk backfills; this is one interactive generation at a time.

---

## 8. Open questions / follow-ups

1. **Question count.** `IDEA.md` says "a short quiz" and does not give a number. `GENERATION_QUESTION_COUNT` defaults to **8** (the wire cap is 30). Should the count be per-request instead — the web sending a value the user picks?
2. **Single vs multi mix.** The system prompt currently asks the model to choose per question based on the material. Would you rather pin a ratio (e.g. "at most a third multi-select")?
3. **Effort default (D14).** Shipping at `high`. `medium` is the first cost lever and is likely fine for this; worth a side-by-side on two real articles before deciding.
4. **`GENERATION_MAX_INPUT_TOKENS` = 150,000.** Roughly a 400–600KB article, ~$0.75 of input at Opus 5 rates. Comfortable, or should the ceiling be lower?
5. **What the user sees on failure.** Currently an enumerated `failureCode` plus a safe message. Is a "retry" button on the web enough, or should a failed job be visible in the library list at all?
6. **Regeneration.** Should generating a second quiz for an article that already has one be blocked, offered as "replace", or left as-is (§7)?
