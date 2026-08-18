# Code conventions — herdr-picker

Rules the code follows, so a reader who has never seen this repo can open any
file and know what to expect.

## Size and shape

- **500 LOC hard cap per file.** Target is 150. A file crossing 200 is a
  prompt to split it.
- One responsibility per file. The filename says what it does:
  `resolve/dev-server.ts` resolves dev servers, and nothing else.
- Functions stay under ~40 lines. Past that, extract a named helper — the name
  is the documentation.
- No file has more than one exported "main" thing plus its types.

## Naming

- Files: `kebab-case.ts`. Preact components: `PascalCase.tsx`.
- Functions are verbs: `resolveProjectDir`, `rankCandidates`, `writePayload`.
- Booleans read as questions: `isBusy`, `hasSource`, `canSend`.
- No abbreviations except the universally known ones (`id`, `url`, `ws`).
  `ws` for workspace is banned — it reads as WebSocket. Use `workspace`.

## Exports

- **Named exports only.** No `export default`, except where a framework
  demands it (WXT entrypoints, Preact route components).
- Types live next to the code that owns them. Types crossing the
  daemon/extension boundary live only in `protocol.ts`, duplicated verbatim on
  both sides — no shared package, no build coupling.

## Errors

- Anything touching the outside world (`lsof`, the `herdr` CLI, the network,
  the filesystem) returns a result, never throws:
  ```ts
  type Result<T> = { ok: true; value: T } | { ok: false; error: string };
  ```
- `error` is a sentence a non-programmer can act on:
  `"Nothing is listening on port 3000 — is your dev server running?"`
  Not `"ENOENT"`.
- Route handlers are the only place that converts a `Result` into an HTTP
  status. Everything below them just passes it up.

## Comments

- Comment **why**, never **what**. If the what isn't obvious, rename it.
- Every non-obvious external contract gets a short block explaining it —
  `lsof` flags, the isolated-world limitation, `state_change_seq` semantics.
  Future-you will not remember these.
- JSDoc one-liners on exported functions. No `@param`/`@returns` noise —
  TypeScript already says that.

## TypeScript

- `strict: true`. No `any`. Use `unknown` at boundaries and narrow.
- No non-null `!`. Handle the null, or restructure so it can't be null.
- Prefer `type` over `interface` except for the protocol shapes, where
  `interface` signals "this is a contract".

## Extension specifics

- All overlay DOM lives in a shadow root. Never touch the host page's DOM
  beyond one mount node.
- All overlay CSS is scoped inside that shadow root. No global styles, ever.
- Every `chrome.*` call goes through `lib/messaging.ts` or `lib/daemon.ts` —
  no raw `chrome.runtime.sendMessage` scattered through the UI.
- Content-script code assumes it may be injected twice. Guard the mount.

## Daemon specifics

- No global mutable state. Dependencies are passed as arguments.
- Every subprocess spawn has a timeout and a readable failure message.
- The daemon reads herdr state and sends prompts. It **never** creates,
  closes, or moves panes.

## Formatting

- Prettier defaults, 2-space indent, single quotes, semicolons, 100 columns.
- No lint-rule debates. The formatter decides; nobody argues.
