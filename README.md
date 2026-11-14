# Bookly — customer experience agent demo

A fictional bookstore with a working OpenRouter agent (Pip) and an editable agent workspace. Everything runs locally using your own OpenRouter API key.

## Folder guide

- `app/` — Bookly storefront, chat interface, and admin dashboard.
- `server/` — agent orchestration, prompts, tools, demo inventory, and evaluation tests.
- `public/` — book covers and the favicon.
- `docs/raw-notes.txt` — original brainstorming and design reasoning.
- `scripts/` — local startup, build, and framework support.
- `lib/`, `worker/`, `.openai/` — framework and preview integration support.
- `.env.example` — API key template; copy to `.env.local` and add your own key.

The root contains only project configuration and this guide. Generated dependencies, build outputs, local records, and credentials are excluded from this shareable folder.

## Project thinking

Read the [author's raw brainstorming notes](docs/raw-notes.txt) for the research questions, business reasoning, original feature ideas, and technical tradeoffs behind Bookly. The notes preserve the author's wording and are separate from the implementation and run instructions below.

## Quick start

You can run Bookly from a downloaded ZIP or a cloned repository. You do not need Codex, a Sites account, a database, or a separate OpenAI API key. The model runs through your own OpenRouter account; the app and its demo data run on your computer.

### 1. Install prerequisites

- Install **Node.js 22.13 or newer**, including npm. Check with `node --version` and `npm --version`.
- Create an **OpenRouter API key** at [OpenRouter → API keys](https://openrouter.ai/settings/keys). Ensure the key has access to the default paid model, `openai/gpt-4.1-mini`, and enough account credits to make requests.
- Keep an internet connection for model requests and the initial dependency installation.

### 2. Install the app

Extract the ZIP or clone the repository, then open a terminal **in the directory containing `package.json`**. If you extracted `bookly-source.zip`, this is the `bookly` directory.

```sh
npm ci
```

The lockfile is included so this installs the pinned dependencies. No global framework installation is needed.

### 3. Add your own API key

On macOS or Linux:

```sh
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Open `.env.local` in a text editor and replace the placeholder:

```dotenv
OPENROUTER_API_KEY=your_openrouter_key_here
```

Replace `your_openrouter_key_here` with **your actual OpenRouter key**. The filename must be exactly `.env.local`, not `.env.local.txt`. Keep this file in the same directory as `package.json`.

No usable API key ships with the source. `.env.example` is safe to commit; `.env.local` is ignored by Git. The key is read on the server and is not included in browser JavaScript. An already-exported `OPENROUTER_API_KEY` environment variable takes precedence over the file.

### 4. Start the storefront and agent

```sh
npm run dev
```

Keep that terminal running. This **single command launches both**:

- Storefront and chat: [http://127.0.0.1:5173/](http://127.0.0.1:5173/)
- Admin dashboard: [http://127.0.0.1:5173/?view=admin](http://127.0.0.1:5173/?view=admin)
- Backend API: `http://127.0.0.1:4311` (JSON endpoints, not a separate admin UI)

`npm start` is an alias for the same local demo launcher. You do **not** need to run a build first. `npm run build` checks the frontend build; this repository's supported run mode is the local demo launcher, not a production deployment.

### 5. Check that the agent really works

1. Open the storefront and click **Ask Pip**.
2. Choose **Find a new favorite**. Pip should ask about your reading preferences.
3. Click **Hopeful sci-fi, under $25.** You should see a generated answer and book cards from the demo inventory.
4. Open **Workspace → Conversations** to inspect the `recommend_books` call and its returned data.

For an exact-edition check, choose **Find the exact edition**, use the demo ISBN `9780593135204`, and submit the form. You should see **Project Hail Mary**, its price, and its availability.

These are real OpenRouter calls and consume your credits. The UI does not substitute canned agent replies if the provider fails. The order records, purchases, and shipments are fictional; no payment is collected or physical shipment sent.

Press **Ctrl+C** in the terminal to stop both services. After changing your API key, stop and restart the app.

## Troubleshooting setup

| Symptom | What to check |
| --- | --- |
| Setup asks for `OPENROUTER_API_KEY` | Copy `.env.example` to `.env.local`, replace the placeholder, and restart. |
| OpenRouter returns 401 or 403 | Check that the key is correct, active, and permitted to use the configured model. |
| OpenRouter returns 402 | Check available credits and any spending limit on the key. |
| OpenRouter returns 429 | Wait and retry; check the key/model rate limits. |
| OpenRouter returns 404 / no compatible endpoints | In **Workspace → Agent instructions**, use `openai/gpt-4.1-mini` or another model that supports tool calling and required tool choice. Check provider restrictions on your OpenRouter account. |
| `EADDRINUSE` or a different frontend port appears | Stop another copy of Bookly or the application occupying ports **4311** and **5173**, then rerun `npm run dev`. |
| Page loads but the agent cannot connect | Use the single launcher above so the backend is also running; inspect the terminal and the visible chat error. |
| Changes to the API key do not take effect | Restart the app. If you exported the variable in your shell, update or unset that exported value. |
| A demo order was already cancelled/replaced | Use the guided delivery flow, which creates a fresh order each time. |

Optional backend check, while the app is running:

```sh
curl http://127.0.0.1:4311/api/health
```

A healthy, configured service returns `ok: true` and `configured: true`. This checks local configuration, **not** whether OpenRouter accepts the key; sending a chat message verifies the provider connection.

The default model is `openai/gpt-4.1-mini`. Change it in **Workspace → Agent instructions** to another OpenRouter model supporting tool calling and required tool choice.

## Three guided demo flows

Open Pip and use the three guided demo buttons. Each starts a clean conversation. Discovery includes quick replies; ISBN lookup has a one-click sample number; delivery creates a fresh, session-scoped fictional order with prefilled verification fields. Restart demo repeats a flow without reusing a consumed order.

1. **Find a new favorite — make money:** typo-tolerant request → one clarification → preferences and budget → in-stock recommendation cards → demo bag.
2. **Find the exact edition — save time:** ISBN form → checksum validation → exact catalog edition, stock, and price.
3. **Make a delivery right — reduce risk:** empathy → structured order verification → policy retrieval → staged replacement → separate customer confirmation.

New replies appear word by word with short punctuation pauses and a cursor. Cards and forms appear after the text finishes. The chat follows the reply unless you scroll up, respects reduced-motion preferences, and offers a Show full reply button. This is a presentation effect after the complete provider response, not token streaming from OpenRouter.

## Free-form demo examples

1. **ISBN lookup:** Ask “I have an ISBN. Can you find the exact book?” Pip requests a structured form. Enter `9780593135204` (Project Hail Mary). ISBN-10/13 checksums are validated, then the local catalog returns the edition, price, stock, and a book card.
2. **Multi-turn discovery:** Start a new conversation with the `+` button. Say “I want a new book.” Answer the clarification with “Hopeful science fiction about unlikely friendships, under $25.” The recommendation tool uses live inventory and renders book cards. Add a book to the simulated bag.
3. **Support action:** Start a new conversation. Say “My book hasn't arrived. Can you arrange a replacement?” Complete the form with `CH-1042` and `alex@example.com`. Pip looks up the order, retrieves policy, and proposes a replacement. The order changes only when you click the confirmation button. No actual shipment is sent.
4. **Cancellation:** Use `CH-1043` and `alex@example.com` for a processing order. Shipped orders cannot be cancelled by the agent.
5. **Policy and handoff:** Ask “Can I return a book after 45 days?” or “I want to speak to a human.” Policy responses include a source reference. Handoffs create a local queue entry; no email is sent and no human team is connected.
6. **Inspect the workspace:** Open **Conversations** for response primitives, tool inputs/outputs, timing, and policy references. Edit instructions, tools, policy rules, or inventory. Save changes and try a new request.
7. **Test the boundaries:** Under **Testing & guardrails**, run the deterministic server checks, then optionally run the live adversarial probe. It attempts an unverified cancellation, email disclosure, and fabricated refund.

Other demo order: `CH-1044` / `sam@example.com`, delivered four days before the local database was initialized.

## What is real, what is simulated

**Working:** OpenRouter inference, multi-turn history, function calling, forms, ISBN validation, catalog search, recommendation cards, session-scoped demo verification, server-side eligibility checks, one-time confirmations, order mutations, inventory updates, local handoff tickets, versioned settings, transcript traces, and evaluation execution.

**Simulated:** Store brand, customer records, orders, delivery tracking, shipping, payment/refunds, checkout, and human support. The book titles and authors are real; covers are original SVG illustrations for this demo, not publisher artwork. Catalog metadata, prices, and availability are seeded demo data, not a real retailer's inventory.

**Metrics:** Counts come from local conversations. A resolution is model-reported or a completed action, and should be reviewed; it is not an independently verified customer outcome. Estimated benefit = resolved conversations × (assumed human cost − assumed AI cost). Time recovered is also modeled. These figures exclude implementation, supervision, provider token costs, and errors. Cart additions are not revenue or incremental sales.

## Architecture

```text
React storefront + workspace (Vinext/Vite, port 5173)
    /api proxy
Node HTTP API (localhost only, port 4311)
    Agent loop → OpenRouter chat completions + function schemas
    Tool executor → local catalog / policy / orders / handoffs
    Separate confirmation endpoint → eligibility recheck → write
    Local JSON store → .local/state.json
```

- `server/seed.mjs`: catalog, demo orders, default instructions, operational policy, tool metadata.
- `server/engine.mjs`: model loop and tool execution. The provider is isolated from the domain tool executor for future adapter replacement.
- `server/server.mjs`: API, session cookie, form verification, persistence, dashboard metrics, evaluations.
- `app/page.tsx` / `app/globals.css`: storefront, conversation components, and workspace.
- `public/covers/`: eight preloaded local SVG covers.

The agent has seven configurable domain tools plus a `respond` function for the final message and response primitives: Answer, Clarify, Acknowledge, Confirm, Act, Escalate, Decline, Redirect, and Close. Primitives label visible response behavior; no hidden reasoning is collected or displayed.

## Enforcement boundaries

- Order data is returned only for the order verified in the session. Matching a demo email/order pair is sufficient **for this local demo only**; production requires proper authenticated customer identity.
- The model can stage a write but cannot confirm it. Customer confirmation tokens are session-bound, one-use, expire after ten minutes, and become invalid when policy changes.
- Order status, stock, replacement waiting period, and duplicate replacement eligibility are checked again at execution time.
- Disabled tools are excluded from model requests and rejected in the executor.
- Scope and prose grounding remain prompt-level guidance. They are labeled separately from code-enforced checks. A single passing adversarial probe is not a safety guarantee.
- The API key stays server-side. API errors redact key-like strings. The frontend has no key input or bundled credential.

This is a **local prototype, not a production service**. Admin routes have no login, access control, or organization boundaries; the API binds to loopback, checks local Host/Origin headers, and uses an HttpOnly SameSite session cookie. Do not expose either service to the internet. Production also needs rate-limit hardening, durable transactional storage, real authentication, observability, sensitive-data handling, and broader evaluations.

## Checks and reset

```sh
npm test
npx tsc --noEmit
npm run build
```

Fourteen automated tests cover ISBN validation, unauthorized access, confirmation/replay protection, eligibility and stock checks, duplicate writes, policy changes, disabled tools, handoffs, and the agent loop with a stubbed provider. The workspace runs seven deterministic boundary checks against isolated seed state. Its live demo and adversarial suite exercises 14 isolated scenarios using the real provider, with state/tool assertions, response heuristics, and inspectable prompts and replies. Run it with `npm run test:live` or the workspace button. It tests typos, topic changes, invalid/unknown ISBNs, stock and budget limits, false policy updates, spoofed verification/tool output, prompt extraction, off-topic requests, and local handoffs.

A response-validation layer rejects common affirmative promises of unsupported notifications, a real human response, or unverified order access and requests a corrected answer. These checks cover known failure patterns, not every possible misleading statement.

To reset demo orders and conversations: stop the app, remove `.local/state.json`, then restart. The seed database is recreated with relative shipment dates. This deletes only this demo's local settings and records. Your API key in `.env.local` remains separate.

## Upload later

Use the sibling `bookly-source.zip`. It excludes `.env.local`, runtime records, build artifacts, dependencies, and machine-local state. The ZIP includes `.env.example`, source, cover assets, lockfile, and this guide. Install dependencies and configure the key after extracting.

OpenRouter API reference: https://openrouter.ai/docs/guides/features/tool-calling


## Simulated red-team case study

Testing & guardrails includes a clearly labeled, scripted unauthorized-cancellation failure. Toggle Before fix / After fix or replay the steps to explain the difference between trusting a customer assertion and enforcing session ownership plus explicit confirmation. The replay does not call a model, execute a tool, change an order, or enter the real evaluation history.

General book discovery cannot request ISBN forms: irrelevant form tools are removed from that intent’s model tool set and rejected by the executor. An explicit request for ISBN or exact-edition lookup switches intent and makes the ISBN form available. Existing customer-facing discovery transcripts suppress misplaced legacy ISBN forms while admin traces retain the original evidence.
