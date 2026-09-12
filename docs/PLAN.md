# herdr-picker — Implementation Plan

Select components in Chrome, comment on them, send straight into the herdr
agent session you were last working in.

---

## 1. Product flow

1. You run a dev server yourself (`npm run dev` → `localhost:3000`).
2. You click the extension icon → **Design Mode** turns on.
3. Hover highlights elements. Click selects one. A popover asks for a comment.
4. Shift-click adds more selections. A floating tray shows the running count.
5. Hit **Send**. The extension resolves which herdr agent owns that dev server
   and drops a formatted prompt into that pane.

---

## 2. Architecture

```
┌─ Chrome ─────────────────┐        ┌─ herdr pane ────────────────┐
│ content script           │        │ daemon (Bun, HTTP)          │
│   overlay / select /     │        │                             │
│   comment                │        │   GET  /health              │
│        │                 │        │   GET  /targets?url=…       │
│        ▼ runtime.message │        │   POST /send                │
│ background service worker│──HTTP─▶│                             │
│   screenshot + crop      │        │        │                    │
│   daemon fetches         │        │        ▼                    │
│                          │        │   lsof :3000 → project dir  │
│ popup (Preact)           │        │   herdr agent list → pick   │
│   target picker          │        │   write /tmp/nudge-picks/…  │
└──────────────────────────┘        │   herdr agent prompt <pane> │
                                     └─────────────────────────────┘
```

### Why plain HTTP, not WebSocket
Every interaction is request/response. Nothing needs server push in v1.
HTTP removes the reconnect loop, the MV3 service-worker lifecycle traps, and
an entire `ws-client` module.

### Why the background worker owns all network
Content scripts run in the page's origin, so hitting the daemon from there
needs CORS. The background worker has `host_permissions` for `127.0.0.1`
instead — no CORS, and it's the idiomatic MV3 pattern.

---

## 3. Target resolution

The join key between "a URL in my browser" and "an agent in herdr" is the
**dev server's working directory**.

```
http://localhost:3000
  → lsof -nP -iTCP:3000 -sTCP:LISTEN -t          → PID
  → lsof -a -p <PID> -d cwd -Fn                  → /Users/…/website/apps/web
  → herdr agent list, keep agents whose cwd is a
    prefix of (or prefixed by) that path          → 11 candidates
  → rank: focused === true wins, else max state_change_seq
  → w2:p1H  "Add live wallet preview in phone frame"  (done)
```

Prefix matching goes **both directions** so monorepos work: the agent may sit
at the repo root while the dev server runs from `apps/web`.

The resolved target is never fired at blindly — the popup shows it by its
`terminal_title_stripped` with a status dot and a dropdown to override.

`agent_status` gates the send: `idle`/`done` are green, `working` shows a
"this agent is busy — queue anyway?" warning, `blocked` is disabled.

---

## 4. Repository layout

```
herdr-picker/
├── README.md
├── CONVENTIONS.md
├── daemon/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # compose + listen                 ~60
│       ├── config.ts             # port, paths, timeouts            ~30
│       ├── logger.ts             # prefixed console                 ~25
│       ├── herdr/
│       │   ├── client.ts         # spawn `herdr`, parse JSON        ~90
│       │   └── types.ts          # Agent, Workspace                 ~50
│       ├── resolve/
│       │   ├── dev-server.ts     # port → cwd via lsof              ~80
│       │   └── target.ts         # cwd → ranked agents              ~90
│       ├── payload/
│       │   ├── render.ts         # selections → markdown            ~90
│       │   └── writer.ts         # write note.md + shot.png         ~80
│       └── server/
│           ├── router.ts         # method+path dispatch             ~70
│           └── routes.ts         # the three handlers               ~130
└── extension/
    ├── package.json
    ├── wxt.config.ts
    └── src/
        ├── entrypoints/
        │   ├── background.ts     # message router, capture, fetch   ~110
        │   ├── content.ts        # mount overlay in shadow root     ~80
        │   ├── fiber.main.ts     # MAIN world _debugSource reader   ~90
        │   └── popup/
        │       ├── index.html
        │       ├── main.tsx      # mount                            ~20
        │       ├── App.tsx       # picker shell                     ~120
        │       └── TargetRow.tsx # one agent row                    ~80
        ├── lib/
        │   ├── protocol.ts       # daemon request/response types    ~70
        │   ├── daemon.ts         # typed fetch wrappers             ~80
        │   └── messaging.ts      # typed chrome.runtime wrappers    ~70
        ├── overlay/
        │   ├── controller.ts     # idle → picking → commenting      ~150
        │   ├── highlight.ts      # hover rect + tag chip            ~110
        │   ├── popover.ts        # comment input                    ~150
        │   ├── tray.ts           # "3 selections · Send" bar        ~110
        │   └── styles.ts         # shadow-root CSS                  ~90
        ├── inspect/
        │   ├── selector.ts       # unique CSS selector              ~90
        │   ├── styles.ts         # relevant computed styles         ~60
        │   └── source.ts         # request source from MAIN world   ~70
        └── capture/
            └── crop.ts           # OffscreenCanvas crop             ~70
```

Largest file ≈ 150 LOC. Nothing approaches the 500 limit.

---

## 5. Wire protocol

Shared verbatim between `daemon/src/server/routes.ts` and
`extension/src/lib/protocol.ts`.

```ts
/** One element the user picked and commented on. */
interface Selection {
  comment: string;
  tag: string;                    // "article"
  selector: string;               // "main > div.grid > article:nth-child(2)"
  classes: string[];
  text: string;                   // first ~80 chars, for grepping
  box: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>; // curated subset, not all ~340
  source?: { file: string; line: number; column?: number };
  screenshot?: string;            // base64 PNG, cropped to box
}

// GET /targets?url=http%3A%2F%2Flocalhost%3A3000
interface TargetsResponse {
  projectDir: string | null;      // null → could not resolve the port
  resolved: Target | null;        // best guess
  candidates: Target[];           // everything in that workspace
}

interface Target {
  paneId: string;                 // "w2:p1H"
  workspaceId: string;
  label: string;                  // terminal_title_stripped
  agent: string;                  // "claude" | "codex"
  status: "idle" | "working" | "blocked" | "done" | "unknown";
  cwd: string;
  focused: boolean;
  lastActiveSeq: number;
}

// POST /send
interface SendRequest { url: string; paneId: string; selections: Selection[]; }
interface SendResponse { pickId: string; notePath: string; paneId: string; }
```

---

## 6. Generated prompt

`/tmp/nudge-picks/<pickId>/note.md`:

```md
# Browser review — http://localhost:3000/tools/wallet

## 1. src/components/PriceCard.tsx:42
> padding here is inconsistent with the other two cards

- selector: `main > div.grid > article:nth-child(2)`
- box: 320x186 at (410, 220)
- padding: 24px 16px | gap: 8px | border-radius: 12px

![selection 1](./shot-1.png)
```

Injected as:

```
herdr agent prompt w2:p1H "Browser review — 2 selections. Read @/tmp/nudge-picks/<id>/note.md and address each comment."
```

Short prompt, details in the file. Keeps the agent's context clean and lets it
read the screenshots on demand rather than up front.

---

## 7. The React source-mapping hop

Content scripts run in an isolated world, so `el.__reactFiber$…` is invisible
to them. Three steps:

1. `content.ts` stashes the picked element and asks the background worker to
   run `fiber.main.ts` with `world: "MAIN"`.
2. That script walks `Object.keys(el)` for a `__reactFiber$` prefix, climbs
   `_debugOwner` until it finds a `_debugSource` on a **named component**
   (skipping host elements like `div`), and returns `{file, line}`.
3. Result comes back through `chrome.runtime` to the content script.

Absent in prod builds — `source` is simply omitted and the payload falls back
to selector + screenshot + text. Never an error, just less information.

---

## 8. Milestones

| # | Deliverable | Verifiable by |
|---|---|---|
| M0 | Repo scaffold, both `package.json`, CONVENTIONS.md | `bun run dev` boots, `wxt dev` loads |
| M1 | Daemon: lsof + agent-list resolution | `curl 'localhost:8787/targets?url=…'` returns your real pane |
| M2 | Daemon: payload write + `agent prompt` | `curl -X POST /send` puts text in a real pane |
| M3 | Extension: overlay, hover, select, comment, tray | Works standalone, logs the payload |
| M4 | MAIN-world source mapping | Selecting a component logs `PriceCard.tsx:42` |
| M5 | Screenshot capture + crop | Cropped PNG lands on disk |
| M6 | Popup picker, wired end to end | Full flow from step 1 to step 5 |
| M7 | Polish: keyboard esc, status gating, error toasts | — |

M1 first: it is the only genuinely uncertain piece, and it is testable with
`curl` before a single line of extension code exists.

---

## 9. Out of scope for v1

DevTools TUI · console/network capture · Vue/Svelte source mapping ·
prod-URL ripgrep fallback · editing code from the browser · cross-browser ·
extension packaging · auth on the daemon.
