# How far Flint goes with no AI, and which models to add on top

Research for feat/flint-max (2026-11-12). The question: inside TribeCode's own editors (website designer, design
canvas, docs, sheets, slides, tasks, chat), how much can Flint do brilliantly with rules, small tables and math, and
where does a model really earn its download or its bill? The second half is the plan for adding models, tier by tier.

Headline: almost every "wow" in a design or document editor is a **deterministic transform with good defaults**
(a palette, a contrast fix, a type pairing, a layout rhythm, a sum, a chart, a table of contents). A model is needed for
**open-ended writing and judgement**, not for edits. So Flint's tier 0 should own every edit, and models should be added
as *writers and rankers* that hand back the same edit objects tier 0 already applies (one Undo, works offline).

## 1. Findings

### Rules first is a proven design, not a stopgap
- Snips' on-device assistant parsed every query with a **deterministic pattern parser first** and only fell back to a
  probabilistic one (logistic regression + CRF) when the patterns found nothing; the patterns are "guaranteed to achieve
  a 1.0 F1-score on the training examples", models stay "a few hundred kilobytes", and parsing takes ~1.3 ms on a laptop
  ([Snips Voice Platform, arXiv 1805.10190](https://arxiv.org/pdf/1805.10190)). With 70 training queries per intent it
  beat several cloud NLU services on slot filling. That is exactly flintnlu.js's shape: patterns with slots, then
  TF-IDF nearest examples for "did you mean".
- Command palettes that feel magic share four habits: fuzzy matching with scoring, **synonyms for every command**,
  context boosting (commands for the current view rank higher) and being available everywhere with one shortcut
  ([Superhuman: How to build a remarkable command palette](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)).
  Notion's slash menu is the same idea for content: type `/` and the name of what you want
  ([Notion: Using slash commands](https://www.notion.com/help/guides/using-slash-commands)).
  Flint now does all four, plus several steps per sentence and pronouns ("it", "the same on the about page").

### What impresses in editor demos
- Canva's Magic Studio is a list of *transforms*: Magic Switch (one design into another format), Magic Design for
  Presentations (a deck from a prompt), Magic Write (copy in your brand voice), Magic Animate, Magic Edit/Grab/Expand
  for images ([Maginative on Magic Studio](https://www.maginative.com/article/canva-unveils-magic-studio-a-powerful-suite-of-ai-enhanced-design-tools/)).
  Of those, **format switching and decks from existing text** can be done with extraction + templates (Flint's
  "a 5-slide pitch from the vision doc"); voice-matched writing and image generation need a model.
- Figma's auto layout controls spacing as a gap with Between / Around / Evenly distribution
  ([Figma help: auto layout](https://help.figma.com/hc/en-us/articles/360040451373)): a solved, rule-based problem.
  Flint's "tidy this up" snaps a page to one spacing rhythm, one alignment and an even corner radius.

### Color, contrast, type, readability: all math
- **Contrast** is a formula. WCAG AA wants 4.5:1 for normal text and 3:1 for large text and UI components; AAA wants
  7:1 and 4.5:1 ([WebAIM: Contrast](https://webaim.org/articles/contrast/)). Flint measures and *fixes*: it moves a
  color's lightness until it passes and says before → after ("ink 2.64:1 → 7.07:1").
- **Palettes** are predictable in OKLCH: its L is perceived lightness, unlike HSL's, so changing hue does not wreck
  readability, and "OKLCH frees designers from the need to manually choose every color"; all browsers support it
  ([Evil Martians: OKLCH in CSS](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl)). Flint builds a
  light and a dark palette from one hue and chroma (30 moods: autumn, ocean, brutalist, luxury…) or from one hex,
  clips to sRGB by lowering chroma only, then runs the contrast fix on both.
- **Type pairing** is a small curated table: a display face with character over a neutral body face. Flint maps 12
  moods to the 8 OFL pairs the website designer already ships, with the reason in plain words.
- **Readability** is Flesch Reading Ease, 206.835 − 1.015 × words/sentence − 84.6 × syllables/word, with bands from
  "very easy" (90–100) to "very confusing" (0–29) ([Readability Formulas](https://readabilityformulas.com/learn-about-the-flesch-reading-ease-formula/)).
  Flint adds the grade level and three concrete tips (long sentences, long words, passive voice).

### Small open models that could run later

| Model | Size | License | What it would unlock for Flint |
|---|---|---|---|
| all-MiniLM-L6-v2 (embeddings) | 22.7M params, 384 dims, 256-token input | Apache-2.0 ([card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)) | Meaning-based "did you mean", search across docs/tasks/chat |
| bge-small-en-v1.5 (embeddings) | ~33M, 384 dims | check its model card before bundling | Same, slightly stronger retrieval |
| Model2Vec static embeddings | ~30 MB float32 | open source ([blog](https://huggingface.co/blog/Pringled/model2vec)) | "500x faster and 15x smaller" than a sentence transformer, ~81% of MiniLM's MTEB score (45.34 vs 56.09): runs in plain JS with no WebGPU |
| SmolLM2 135M / 360M / 1.7B | 135M–1.7B | Apache-2.0 ([card](https://huggingface.co/HuggingFaceTB/SmolLM2-135M)) | Rewrites and short summaries on device; English-first |
| Qwen3 0.6B / 1.7B / 4B | 0.6B–4B, 32K context (0.6/1.7B) | Apache-2.0 ([Simon Willison](https://simonwillison.net/2025/Apr/29/qwen-3/)) | Already Flint's browser brain (brainpick.js); 0.6B and 1.7B "should run fine on an iPhone" |
| Gemma 3 270M / 1B | 0.3B–1B, 32K context | Gemma Terms of Use, gated ([card](https://huggingface.co/google/gemma-3-270m)) | Tiny task models to fine-tune; terms need review before bundling |
| Llama 3.2 1B / 3B | 1B–3B | Llama 3.2 Community License: "Built with Llama" attribution, an acceptable-use policy, a separate license above 700M MAU ([license](https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct/blob/main/LICENSE.txt)) | Fine, but the attribution rule must show in the UI |
| Phi-4-mini | 3.8B, 128K context | MIT ([card](https://huggingface.co/microsoft/Phi-4-mini-instruct)) | Best small reasoner and function caller here, desktop-class GPU only |

Runtimes:
- **WebLLM** (Apache-2.0) runs these in the browser on WebGPU, in a Web Worker, with an OpenAI-compatible API and JSON
  mode ([GitHub](https://github.com/mlc-ai/web-llm)); it keeps "up to 80% of the decoding speed" of native MLC-LLM,
  e.g. Phi-3.5-mini at 71 tok/s on an M3 Max ([paper](https://arxiv.org/html/2412.15803v1)). TribeCode already uses it.
- **Transformers.js v3** adds WebGPU ("up to 100x faster than WASM"), q4/q8/fp16 dtypes, 120 architectures and
  1,200+ converted models; WebGPU reached ~70% of browsers in late 2024, with flags elsewhere
  ([HF blog](https://huggingface.co/blog/transformersjs-v3)). Right choice for embeddings.
- **Ollama** exposes `http://localhost:11434/v1/` with chat completions, JSON mode, tools and `/v1/embeddings`; the
  key is ignored locally ([Ollama docs](https://docs.ollama.com/api/openai-compatibility.md)). The host's model already
  goes through server/brain.js.

### Cloud
The user's own keys (Anthropic, OpenAI, Gemini, OpenRouter, Groq, any OpenAI-compatible URL) are already stored on
the host only (server/llm.js) and asked about once per device (aiconsent.js). Credits are the fallback for people
without a key (premium.js). This repository holds no prices; see each provider's page.

## 2. Capability map per editor

| Editor | No AI, done brilliantly (tier 0, shipped) | Small local model (tier 1–2) | Cloud model (tier 3) |
|---|---|---|---|
| Website designer | Several steps with one Undo; pronouns and "the same on another page"; mood/hex palettes with a real dark variant; contrast check + fix; font pairing; style moves (professional, elegant, brutalist, luxury, calm, retro, techy, modern); tidy; headline ideas and CTAs from templates and site facts; readability; Title Case; pricing with N plans and a highlighted one; bigger/smaller; links, socials, pages, sections, wiring, export | Rewriting a headline in the site's own voice; alt text drafts; ranking which of Flint's 5 headline ideas fits best | Whole-page copy from a brief; "make it look like Stripe"; images and logos; judging a design |
| Design canvas | Recipes (navbar, footer, hero, sign-up and login forms, card grid, pricing, sidebar, tab bar, dialog); card grid from a selection; recolor with a palette; screens from templates; align, distribute, group, resize, snap, dark version, wiring | Naming layers by meaning; picking a recipe from a free description | Screens from a sketch or a screenshot; illustrations |
| Docs | Table of contents; checklist; capitals; extractive TL;DR (TextRank-lite); key points; title and tag ideas; reading level; glossary | Abstractive summaries; tone rewrite of a paragraph; "continue this" | Long drafts, research, translation with nuance |
| Sheets | Sum, average, min, max, count of any column; sort (numbers, dates, months, text; the total row stays); currency and percent; a Total row with =SUM; a chart under the table from one sentence | Column meaning ("which column is revenue?") when headers are vague; formula from a description | Pivot-style analysis, forecasting in words |
| Slides | A pitch (3–10 slides) from the vision or any doc: title, problem, what we're building, how it works, why now, plan, ask | Tighter bullets per slide; speaker notes | A full narrative deck in a brand voice; images |
| Tasks | Add/assign/due/move/review with dates and people; split, estimate, suggest an owner (rules) | Grouping similar tasks (embeddings) | Planning a whole milestone from a vision |
| Chat | Summaries (extractive), pins, reactions, DMs, reminders, how-to answers from the docs | Semantic search over chat; smarter "did you mean" | Free conversation, code help |

## 3. The model plan

Each tier only adds; nothing in tier 0 depends on a model. A model's answer is always turned into the same edit
objects tier 0 applies (sitecfg ops, canvas nodes, Markdown), so Undo, offline replay and tests keep working.

| Tier | What | Download / cost | Speed budget | Turn on |
|---|---|---|---|---|
| **0 · No AI** | flintnlu.js + flintmax.js: patterns, slots, tables, OKLCH, WCAG, Flesch, TextRank | 0 (≈120 KB of JS) | < 5 ms per command | Always |
| **1 · Tiny local embeddings** | Model2Vec (plain JS, no GPU) or all-MiniLM-L6-v2 / bge-small via Transformers.js (q8) | 8–30 MB, cached once | < 30 ms per query on a laptop CPU | Automatic when idle on Wi-Fi, with a Settings switch; never on a metered phone |
| **2 · Small local LLM** | Qwen3 0.6B/1.7B in the browser (WebLLM, WebGPU, already in brainpick.js) or any Ollama model on the host | ~500 MB–1 GB (browser), host's choice (Ollama) | first token < 1 s, 20+ tok/s on a recent laptop; JSON mode for edits | Opt-in: "Set up a local model" on Flint's page |
| **3 · Your AI / credits** | The user's own Claude, OpenAI or Gemini key on the host; credits when there is no key | Pay per use with the provider | streaming; the consent card first | Settings › Flint's brain, Premium |

What each tier is used for:
1. **Tier 1** replaces TF-IDF in "did you mean", the knowledge base and taught phrases with embeddings (better on
   paraphrases), and powers semantic search across docs, tasks and chat. Store vectors per doc in `.tribe/`.
2. **Tier 2** rewrites short text in place (headline in your voice, a paragraph's tone), drafts alt text, picks among
   Flint's own candidates, and fills slots the patterns missed, always as JSON validated against the same schema.
3. **Tier 3** does what needs a big model: long writing, design critique, code, images, many-file changes.

Licensing notes: prefer Apache-2.0 / MIT models (Qwen3, SmolLM2, Phi-4-mini, MiniLM, bge-small) for anything
TribeCode downloads by default. Gemma needs its Terms of Use accepted per user; Llama 3.2 needs "Built with Llama"
shown and its acceptable-use policy linked. Model files stay out of the repo and the installers; they download on opt-in.

## 4. What shipped in feat/flint-max (tier 0)

- `app/ui/flintmax.js` (browser + Node): palettes, contrast, type pairs, style moves, copy helpers, sheet/doc/slide
  ops, canvas recipes, the designer's new moves and the runners; `app/ui/flintnlu.js` reads the new phrasings.
- Wired in `sitedesigner.js` (one Undo for many steps, "the same on …"), `sitecfg.js` (highlighted plan, size, a
  palette's own other mode), `canvas/flintpane.js` (recipes, recolor), `sheet.js` (charts) and `docs.js` (the sheet
  and deck Ask box runs local first, with its own Undo).
- `app/ui/flintpage.js`: Flint's page (levels, searchable "What I can do" with Try it, lessons).
- Eval: 1,196 phrasings at 99.4% (was 996/1,003 = 99.3%); held-out batch 6 (50, written before the matchers) scored
  48/50 = 96% on its first untuned run. `app/test/e2e_flint_max.py` runs 46 commands end to end.

## 5. Tier 1 status (2026-11-13, feat/build-feeds)

- **Built:** `app/ui/flintembed.js` (static word-embedding inference in plain JS: reads a Model2Vec model's own
  `model.safetensors` + `tokenizer.json`, WordPiece lookup, mean pooling, cosine; browser and Node, about 0.06 ms per
  sentence), `app/ui/flintmodel.js` (the opt-in sheet behind "Set up a local model": name, license, size, where it
  comes from, a Wi-Fi hint, progress, kept in IndexedDB, Remove) and `server/flintmodel.js` (the model's address).
  Tier 1 is **opt-in only**, not automatic as the table above first planned.
- **Used for:** ranking "did you mean" for unrecognized commands (`flintnlu.js setSemantic`), re-ranking help answers,
  and search by meaning over docs, tasks and chat in the Ctrl+K palette. It never decides a command, so the eval is
  identical with and without it (1189/1196 = 99.4%; held-out batches unchanged).
- **The model:** the default address is `minishlab/potion-base-8M` on Hugging Face (Model2Vec, MIT, about 30 MB). It
  could not be downloaded from the build machine, so **the real model has not been run through this loader yet**:
  check its size, license and file names on its model card before release. A host can instead put the two files in
  `<tribe>/.tribe/flint-model/` and members download from their own host.
- **Tested with a fixture** (`scripts/dev/flint-fixture-model.js`, 740 KB, not a trained model; its synonym list was
  written by the same hand as the test phrases): did-you-mean top 3 on 16 unrecognized paraphrases went from 6/16 to
  10/16 (`flint_embed_test.js`). Treat that as proof the wiring works, not as the real model's quality.
- **Not built:** vectors stored per doc in `.tribe/` (the index is rebuilt in memory, at most once a minute), taught
  phrases by meaning, tier 2.
