# Hooks for a stronger AI: read the design, propose changes, a person approves

How Claude (or any AI helper that speaks MCP) makes a TribeCode website or phone app design more beautiful. The
creators work with no AI at all; these hooks are the one way an AI comes in. Written in pass 4.

Code: `app/ui/flintcreate.js` (Flint in the creators, the brief, the levels), `app/ui/polish.js` (Polish it),
`app/ui/appcreator-core.js` (`readOut`, `propose`), `server/appcreator.js` (`app_read`, `app_propose`),
`server/sitedesign.js` (`site_read`, `site_propose`), `server/changereq.js` (change requests).
Tests: `app/test/flintcreate_test.js`, `app/test/e2e_flint_create.py`.

## The rule

An AI helper never changes a design. It **reads** it, **proposes** a list of steps from a fixed list, and a
**person approves**. Steps that are not on the list are skipped and named. A helper cannot approve its own proposal.
Every approved proposal is one Undo.

TribeCode does not route anything through anyone's Claude subscription. The AI is the tribe's own: a member's own
helper (Claude Code, Codex, Gemini, joined with Invite my agent), or the AI key the host set.

## Flint's levels in the creators

Every reply in the Flint panel carries a badge that says which level answered.

| Badge | Runs on | What it does |
|---|---|---|
| **No AI** | anywhere | Flint's rules read the sentence and the creator makes the edit. 66 everyday requests per creator are covered (`ASKS` in `flintcreate.js`, checked by the eval). **Polish it** is here too. |
| **In this browser** | the built-in model on WebGPU | A loose request ("something calmer for the evening") becomes 1 to 5 of Flint's **own commands** ("make it dark", "calmer motion"). |
| **On this computer** | a local model on this computer or the tribe's host (Ollama, LM Studio, llama.cpp, Jan) | The same. |
| **A stronger AI** | the tribe's own AI | **Make it beautiful**: the brief below goes to the helpers, who use the MCP tools. |

What a small model may do is narrow on purpose (`check()` in `flintcreate.js`):

- It answers with JSON only: `{"ops":[{"say":"<command>"}]}` (1 to 5) or `{"text":"…"}`. Any other field is refused.
- Every `say` is read again by the rules and must be exactly one sure command **of that creator**.
- Only edits on a closed list pass (`MODEL_OK`). A model may not start a template or a new app (they replace the whole
  design), remove anything, export, publish, undo, or reach outside the creator. A person says those.
- It never writes HTML, CSS or a design file, and it never runs anything. What passes runs through the same edit
  path as a typed sentence, with the same Undo. The reply says how the request was read.
- With no model, or when the model's answer is refused, Flint answers honestly with what it can do here.

## Polish it (no AI)

One button under the Flint thread in both creators, or say "polish it". It lists what it would change, grouped
(colour that reads, spacing, type sizes, alignment, buttons that work, empty parts, pictures, search and sharing), with
a tick box each. Nothing changes until **Apply**; the whole pass is one Undo. Things it cannot fix safely are listed
under "To do by hand".

| | Website | App |
|---|---|---|
| Colour | text, grey text and main colour contrast (from Check my site) | the main colour stands out from the background (3 to 1) |
| Spacing | one section spaced differently from the rest; two loud backgrounds back to back | the same part twice in a row; a packed screen on compact spacing |
| Type sizes | a heading set smaller than normal, a paragraph set to the biggest size | screens still called "New screen" (by hand) |
| Alignment | a section whose words line up two ways; sections that enter two different ways | a screen that starts without a title |
| Buttons | dead buttons linked to the matching page or section; forms that send nowhere (by hand) | a dead button linked to the screen its words match; no way between main screens (adds a tab bar) |
| Empty parts | empty sections and pages, missing footer | an empty screen nothing opens (removed); empty screens (by hand) |
| Pictures | missing descriptions filled from the words nearby; grey placeholders | — |
| Search | missing description for search results | — |

## Make it beautiful

The button shows only while the tribe has an AI connected (a helper is a member, or the host's AI key is on:
`GET /api/flint/tiers` → `now.host.online`). Otherwise the same spot shows one line: "No AI needed. A stronger AI adds
full redesigns and new writing." Saying "make it beautiful" with no AI gets the honest version and offers Polish it.

Pressing it sends a **design brief** (`brief()` in `flintcreate.js`) to the helpers (`POST /api/coord/asks`, or the
#agents channel when only the host's key is on). The brief holds:

- what the person asked (or the default: a clearer order of what is read first, calmer spacing, colour and type that
  fit the brand; keep what it says and does);
- the two tools to call and the rule that nothing changes until a person approves;
- the brand kit (name, colours, fonts, voice), the audience when it is written down, and an outline of the design.

## The MCP tools

| Tool | What it returns or does |
|---|---|
| `site_read { project? }` | The website as an outline: pages, each section with its id, type, layout and words, the theme, the brand kit, and which section types, looks and font pairs exist. No pictures. |
| `site_propose { ops, note, project? }` | A **change request** on the website (see below). The step list is in the tool's description. |
| `app_read { project? }` | The app design as JSON: screens, each part with its id, type, words and links, the look, the brand kit, `can` (parts, looks, fonts, icons, pictures, kits) and `steps` (the list below). No pictures. |
| `app_propose { ops, note, project? }` | A **change request** on the app (see below). |

Steps `app_propose` accepts (each `{ op, … }`): `theme { set: { accent, mode, radius, font, density, icons, motion,
surface } }`, `preset { id }`, `text { block, path, value }`, `icon`, `illus`, `block.add { screen, type, at? }`,
`block.remove`, `block.move { block, dir }`, `block.dup`, `item.add | item.dup | item.remove | item.up | item.down
{ block, path }`, `link { block, path, to, how? }`, `unlink`, `screen.add { name }`, `screen.rename`, `screen.move`,
`kit { kit }`, `tabbar`, `rename { name }`, `start { screen }`. At most 60 steps.

Never accepted: removing a screen, adding or removing working features, switching the iPhone or Android look,
exporting, anything with a path that is not plain words and dots. The answer lists what was used and what was
skipped, each with its reason.

## What the person sees

- **Website:** the same as the app since the pass 4 polish: a change request with the site drawn before and after.
  Flint says so once in the designer ("… proposes changes to the website") with **Look at them**. A helper that
  belongs to nobody (no person to ask on behalf of) still gets the older Apply / Decline list.
- **App:** the proposal is a change request (`server/changereq.js`). It shows under Requests in App Creator and in the
  inbox, with the helper's note, the list of changes, and the app drawn **before and after** on the reviewer's own
  screen (a helper cannot draw, so no picture is uploaded). Approve applies it as one step; Deny or Request changes
  sends it back. The request goes to the person the helper works for when they may change the app, else to whoever
  approves app changes in this group.

## Try it by hand

```
curl -s $HOST/mcp -H "Authorization: Bearer $AGENT_TOKEN" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"app_read","arguments":{}}}'
curl -s $HOST/mcp -H "Authorization: Bearer $AGENT_TOKEN" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"app_propose","arguments":{"note":"Calmer.","ops":[{"op":"theme","set":{"motion":"calm","radius":"round"}}]}}}'
```

## Left open

- Flint's sentences in replies are English; the buttons, badges and the Polish sheet are in eight languages.
- The host's AI key by itself does not count as "an AI in the tribe" for Make it beautiful: nothing there reads a
  design and proposes. With only the key, the spot shows the honest line and Polish it.
- In the website designer, More › **Make it beautiful** and the button under Flint open one sheet (say what should
  change; it goes to the helpers). Saying "make it beautiful" to Flint sends the standard brief through the same pipe.
- With only the host's AI key (no helper as a member) the brief goes to #agents; nothing there calls the MCP tools
  yet, so a proposal comes back only from a helper that is a member.
