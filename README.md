# herdr design mode

Select components on a local dev server, comment on them, and send them straight
to the herdr agent session that is working on that project.

```
you select + comment in the browser
        │
        │   ┌─ which project is this?      lsof on the dev-server port
        ▼   ▼
  extension  ──HTTP + pairing token──▶  daemon (in a herdr pane)
                            │
                            ├─ which agent owns it?         herdr agent list
                            ├─ is that agent really in it?  scope check
                            └─ send the review              herdr agent prompt
```

## Requirements

- Node 23.6 or newer — it runs the daemon's TypeScript directly, no build step
- `herdr` on your PATH, with the daemon started from inside a herdr pane
- Chrome

## Setup

**1. Start the daemon**, in a pane in the herdr session you want reviews sent to:

```bash
npx .              # from the repo root
```

It listens on `127.0.0.1:8791` and prints a **pairing code**:

```
[design-mode] Pairing code: 8b5296f8ea3180a2397bf57e6384e9ea
```

Loopback only — it runs `herdr` commands and must never be reachable from the
network. The code is generated once and kept at `~/.herdr-design-mode/token`
(mode `0600`), so it survives restarts.

**2. Build and load the extension:**

```bash
cd extension
npm install
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, choose **Load
unpacked**, and pick `extension/dist`.

**3. Pair them.** Open the extension popup and paste the pairing code. Without
it the daemon answers `401` — see [Why pairing exists](#why-pairing-exists).

## Using it

1. Run your dev server yourself, e.g. `npm run dev` on `localhost:3000`.
2. Open the page in Chrome and click the extension icon, then **Turn on**. The
   popup also shows the keyboard shortcut Chrome assigned — `⌥⇧D` on macOS.
3. Hover to highlight, click to select, describe the change, press **Enter**.
   Use **Shift+Enter** for a new line. The sliders button opens a live style
   editor — anything you change there is applied to the page immediately and
   sent as an exact before and after.
   While you hover, the child components inside the highlighted one are outlined
   too, each in its own colour, so the shape of the tree is visible before you
   click. With a Vite inspector plugin in your app those outlines follow real
   component boundaries — the wrapper `<div>`s belonging to the hovered component
   are skipped, and only descendants declared in another file are drawn. Without
   one they fall back to direct DOM children.
4. Use the pen button to draw directly over the page. Draw one or more strokes,
   click the pen again, then comment on the marked region.
5. Add an optional page note in the tray. It can accompany selections or be sent
   on its own when the feedback applies to the whole page.
6. Select as many elements and drawings as you like — the tray lists them in a
   card above the bar, where any one of them can be removed before sending. The
   session follows the tab across reloads and route changes, so one review can
   contain annotations and page notes from multiple pages.
7. Check the agent named in the tray, refresh or change it if needed, then hit
   **Send**.

### Two states

A **session** is open whenever the tray is showing, and it holds every selection
you have made. **Annotating** is the narrower mode where clicks are intercepted
to pick elements.

They are separate so you can step out of annotating to scroll, open a menu, or
type into the form you are reviewing, and come back with your selections intact.

| Action | Effect |
|---|---|
| **Esc** | Close the composer, or stop annotating — selections are kept |
| **⌘.** | Toggle annotating back on (`Ctrl+.` off macOS) |
| Bubble button in the tray | The same toggle, with the shortcut on hover |
| **End session** in the popup | Ends the session and discards anything unsent |
| The annotation pill in the tray | Opens the card of queued annotations, each removable |
| Drag the tray's header | Moves the tray anywhere on screen; it is remembered |
| Chevron in the tray's header | Collapses the tray to its header |

While annotating is off the tray stays put, and the page behaves completely
normally. Navigate in the same tab and the tray, queued annotations, and
page-specific notes are restored on the next page.

## What the agent receives

A short prompt pointing at a note on disk, so the review does not flood its
context:

```
Browser review — 2 selections on http://localhost:3000/tools/wallet.
Read @/tmp/herdr-picks/2026-08-18-16-52-03-y55p/note.md and address each comment.
```

The note starts with an optional page-level comment, then leads with the source
location of each component or the position of each drawing. Every review item
includes its comment, surrounding facts, accessibility context when available,
and a cropped screenshot:

```md
## 1. src/components/PriceCard.tsx:42

> padding here is inconsistent with the other two cards

- element: `<article>`
- selector: `main > div.grid > article:nth-child(2)`
- box: 320x186 at (410, 220)
- styles: padding: 24px 16px; gap: 8px; border-radius: 12px

![selection 1](./shot-1.png)
```

## How a page finds its agent

A browser tab knows a port. herdr knows working directories. The process
listening on that port bridges the two:

1. `lsof` maps the port to a PID, and the PID to its working directory.
2. That directory widens to its git repository root, so an agent sitting at the
   root still matches a dev server started from a package inside it.
3. Agents whose working directory falls inside that repository are candidates.
4. The focused pane wins; otherwise the highest `state_change_seq` does, which is
   herdr's session-wide counter of who acted most recently.

The winner is only a suggestion. The tray shows it by name and lets you pick a
different agent before anything is sent. Targets can be refreshed in place.
Blocked agents cannot receive a review, while a working agent requires a second
confirmation before the review is queued.

## Where source locations come from

Clicking an element gives a selector and a screenshot. Turning that into a file
and line needs the framework to expose it, which only happens in development
builds. Four sources are tried, most reliable first:

| Source | Covers |
|---|---|
| `data-inspector-*` / `data-v-inspector` attributes | Vite inspector plugins, React and Vue |
| `_debugSource` on the React fiber | React 16 to 18 |
| `__source` prop from the JSX source transform | React with the Babel transform |
| `__vueParentComponent.type.__file` | Vue 3, file only — no line number |

React 19 removed `_debugSource`, so a React 19 app with no inspector attributes
falls all the way through to the selector and screenshot.

When none of the sources apply the review still sends — the note simply says the
source is unknown and leans on the selector, classes, and text instead.

## Endpoints

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | open | Liveness check for the popup |
| `GET /build` | open | Long poll the dev live-reload loop waits on |
| `GET /targets?url=<page-url>` | paired | Which agents could act on this page |
| `POST /blob` | paired | Store one PNG, return a `blobId` |
| `POST /send` | paired | Write the note and prompt the chosen agent |

The daemon resolves the project from the dev-server port with `lsof`; the
response reports `"source": "lsof" | "none"`.

```bash
curl -H 'Authorization: Bearer <pairing code>' \
     -H 'Origin: chrome-extension://<your extension id>' \
     'http://127.0.0.1:8791/targets?url=http://localhost:3000'
```

### Why pairing exists

The daemon types text into a coding agent. Anything that can reach it can drive
that agent. Loopback alone is not a boundary: every website you visit can
`fetch()` `127.0.0.1`, and a plain `POST` with a `text/plain` body does not even
trigger a preflight the daemon could refuse.

So three things guard it:

- **A bearer token** on `/targets`, `/send`, and `/blob`, compared in constant
  time. `/health` and `/build` stay open because they reveal nothing.
- **An origin allowlist.** A request carrying any `Origin` that is not
  `chrome-extension://…` is refused with `403`, which covers every web page.
  Requests with no `Origin` at all — curl, for example — are still allowed.
- **Scope re-validation on `/send`.** The chosen pane must genuinely be working
  inside the repository behind the URL being reviewed, so a stale or forged
  `paneId` cannot reach an unrelated agent.

Reviews are written to `/tmp/herdr-picks` with `0700` directories and `0600`
files, and anything older than seven days is deleted on the next boot.

## Development

```bash
cd daemon     && npm run dev        # also watches extension/dist for rebuilds
cd extension  && npm run dev        # rebuilds on save
```

Changes reach the browser on their own. The daemon watches the extension's build
output and holds a request open until it changes; the service worker is waiting
on that request, so a rebuild restarts the extension, which then replaces the
overlay on every open page. Save a file and the page is running the new code a
moment later — no reloading the extension, no refreshing the page.

If the daemon is not running, the loop simply retries every few seconds and the
extension behaves like any other unpacked one.

```bash
cd daemon    && npm test && npm run typecheck
cd extension && npm run typecheck && npm run build
```

## Documentation

- [`docs/PLAN.md`](docs/PLAN.md) — implementation plan and milestones
- [`docs/IMPROVEMENTS.html`](docs/IMPROVEMENTS.html) — where this is going next
- [`CONVENTIONS.md`](CONVENTIONS.md) — code conventions this repo follows
