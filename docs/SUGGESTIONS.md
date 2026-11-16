# Suggestions: the tribe's ever-evolving ideas

One engine turns what a tribe adds and does into a few suggestions at a time: new photos and files, the same edit made again and again, features asked for in chat that no task covers, a colour changed in one place but not in another, what was said about the website, and ideas an AI helper proposes. Nothing changes until a person taps **Apply**, every Apply has one **Undo**, and every answer teaches it what this tribe wants.

It works with no AI. With an AI it can add ideas of its own, and those wait for Apply like everything else.

## Where it shows

- **The project page**: a calm card with the best two and the count (`#pj-suggest-slot`).
- **Inside each tool**: the same list filtered to that tool (`TribeSuggest.panel(box, { provider: 'site' })`). The website designer's Suggestions tab draws its cards with the same `TribeSuggest.card`.
- **A sheet**: `TribeSuggest.open()` (the quick guide's button, Flint, "See all").
- **Flint**: "what do you suggest?", "any ideas for the app?", "suggest less", "suggest more often", "turn off suggestions", "stop suggesting about photos", "why did you suggest that?".
- **Settings › Your AI › Suggestions**: Gentle (default), Often, Off.

## Files

| File | What it does |
|---|---|
| `app/ui/suggest-core.js` | The pure parts, shared by the browser, the host and `app/test/suggest_core_test.js`: learning with decay, ranking, the cool-down, repeated edits, photo colours, "asked for, not planned". |
| `app/ui/suggest.js` | `window.TribeSuggest`: providers, gentle scheduling, the list, answers, Apply and Undo, the card, the project card, Flint. |
| `app/ui/suggestkinds.js` | The built-in providers: site, talk, files, photos, edits, brand. |
| `server/suggest.js` | What the tribe answered (so a "no" never comes back), the queue of proposals, the low-priority reading of chat, tasks and docs, the MCP tools. |

## Writing a provider

```js
TribeSuggest.register({
  id: 'motion', title: 'Motion',
  async gather(ctx) { /* read what you need; return null when there is nothing to look at */ },
  async suggest(ctx, gathered) {
    return [{ id: 'loop-' + doc.id, title: 'Make it loop', why: 'The last frame does not match the first.',
      from: [{ kind: 'edit', ref: doc.id, who: 'Ana' }], kind: 'motion-loop',
      apply: async () => { /* change it */ return async () => { /* put it back */ }; } }];
  },
});
```

- `ctx = { projectId, project, brand }` (`brand` is the project's brand kit, or null).
- An item needs `id`, `title` and `apply()`; `apply` returns the undo function (or null when there is nothing to undo).
- Optional: `kind` (what the tribe learns about; default the provider id), `why`, `from` (the chips: `{ kind: 'photo'|'file'|'edit'|'chat'|'task'|'doc'|'decision'|'comment'|'brand'|'site'|'agent'|'person', ref, who, label? }`), `before`/`after`, `score` (1 = normal), `cap` (the permission Ask uses, e.g. `'site.edit'`), `dismiss()`.
- `gather` runs only when the browser is idle; when its result is the same as last time, `suggest` is not run again. Heavy work can wait for the next idle moment with `await TribeSuggest.idle()`.
- To tell the engine something changed, call `TribeSuggest.run({ providers: ['motion'] })`; to note an edit worth noticing, `TribeSuggest.noteEdit({ tool, what, prop, dir?, value?, ref })`.
- Coming from other branches: `app` (App Creator), `motion` (Motion Studio), `launch` (Launch kit). A function named `useSong` on `window.TribeMotionStudio` lets the files provider offer "Use this song in Motion Studio".

## Gentle computing

- Providers run in `requestIdleCallback` slots, one at a time, and not while the tab is hidden, data saver is on or the battery is under 20% and not charging.
- Each provider runs again only after its inputs changed (live events: chat, tasks, docs, uploads, site comments) and no sooner than every 8 minutes (Gentle) or 90 seconds (Often), unless someone asks.
- At most 3 never-seen suggestions a day (Gentle) or 12 (Often), none during quiet hours (Settings › Notifications), unless someone asks ("Look again", Flint, opening a tool's own list). Off shows nothing and runs nothing until asked; what was asked for stays visible for ten minutes.
- The host reads chat, tasks and docs in a small low-priority queue that gives way to other requests between steps.

## How it learns

Each answer is counted for the provider and for the kind: Apply counts as a yes, **Not like this** as three noes, **Not now** teaches nothing (it hides the item for three days). Counts fade with a 30-day half-life. The weight (0.15 to 2) multiplies an item's score, so kinds the tribe applies come first and kinds it turns down come up less. **Why?** explains it in a sentence ("Your tribe applied 3 like this lately, so it comes up first."). A dismissed suggestion never comes back. "Stop suggesting about photos" mutes a provider for you only.

Stored in `.tribe/suggest/<project>.json` on the host (a project kept on this device keeps it in this browser). Nothing leaves the tribe.

## Privacy

- Only what a member of the project may read: the same rules as the website's suggestions (`server/sitesuggest.js`): never DMs, private notes, private docs or anything that looks like a key or token.
- Photos are looked at on the device that shows the suggestion: drawn into a 64-pixel canvas to read their colours and shape. They are never uploaded or sent anywhere by the engine. A picture used on the website is made on the device too (at most 1600 pixels, JPEG) when someone taps Apply.

## The AI hook (the later Claude integration)

- `POST /api/projects/:id/suggest/propose { title, why?, kind?, from?, action? }`: a person or an AI helper adds an idea to the same queue. `action` is what Apply does: `{ type: 'task', title, desc? }`, `{ type: 'site', ops }` (website steps, checked like any other) or `{ type: 'note' }`. Anything else is dropped, and text that looks like a key is refused.
- MCP tools for a member's own Claude Code, Codex or Gemini: `suggestions_list` (what is waiting, what the tribe said no to, what was applied lately) and `suggestion_propose`.
- `POST /api/projects/:id/suggest/ideas`: when the tribe's AI is on (`server/llm.js`) and you may use it, it reads what was said lately and adds up to three proposals, each a task on Apply.
- Proposals show with who proposed them; an AI helper cannot answer a suggestion (feedback is for people).

## HTTP

| Call | Who | What |
|---|---|---|
| `GET /api/projects/:id/suggest` | people in the project | `{ learn, dismissed, muted, applied, proposed, canEdit, ai }` |
| `POST …/suggest/feedback { id, provider, kind, verdict, title }` | yes / no / notlike: not spectators; later: anyone | counts the answer; no and notlike dismiss it for everyone |
| `PUT …/suggest/mute { provider, on }` | people | your own muted providers |
| `POST …/suggest/propose` | people and AI helpers (not spectators) | adds a proposal |
| `GET …/suggest/signals?since=` | people and AI helpers | project-visible chat, docs, decisions, comments and tasks |
| `POST …/suggest/ideas` | people, not spectators | the AI's ideas (when it is on) |

## Tests

- `app/test/suggest_core_test.js`: learning and decay, ranking, the cool-down, edits, palette, asks.
- `app/test/e2e_suggest_engine.py`: a provider registers and runs in idle time while typing stays smooth; Apply and Undo; Not like this lowers the weight and the item never returns; the daily cap; Off; a photo's colours and a wide photo for the top of the site; repeated edits; who it came from; proposals and the MCP tools; 390px.
