# Learning in TribeCode: is it worth having?

Written 2026-11-14 for the owner's question: is the educational side worth having, what is missing, and where should it live. Short answer: **yes, but as one place and mostly as short answers**, not as a course you sit through. This page says what was found, what was kept, merged and cut, and what is still missing.

## What was there (before this change)

| Surface | What it teaches | Time | Ends with something real? | Newcomer | Experienced builder |
|---|---|---|---|---|---|
| Help center paths (6 goals, 3 depths, `docs/guide/p-*.md`) | The app, from idea to a published link | 5 to 20 min a path | Yes: every step has a Do it button | Good, the best thing here | Useful at the Production depth only |
| Guide pages (15, `docs/guide/0x-*.md`) | How each part works | 2 to 4 min a page | No, reading only | Too much to read first | Good as reference |
| Flint lessons (19, `flintlessons.js`) | One feature in three lines, then Show me | 20 seconds | Points at the real control | Good | Skipped |
| The tour (`flinttour.js`) | Where the main places are | 2 min | No | Fine once | Skipped |
| Academy (65 lessons, 10 jobs, about 5 hours) | Running a business: selling, support, money, legal | 3 to 6 min a lesson | Yes: every lesson has a Try it step | Lost: it is not about the app, and it was a separate place called by job titles | The only content they do not already know |
| Website Learn page (5 modules, about 55 min) | What code is, building together | 55 min | No, reading and a quiz | Good before installing | Not for them |

What was wrong:

- **Three names for learning** (Guide, Help center, Academy) and no place that showed all of it or what you had done.
- **Nothing answered "how do I X" in one screen.** Flint answered from a paragraph of a long page; the paths were the shortest thing and they are five minutes.
- **Progress was only kept for the Academy.** The next-step sheet taught the same step again every time.
- **Overlap:** the three publish lessons in the Academy's Build track repeat the paths; Guide page 13 describes the Academy; the website course module 2 repeats the app's first path.
- **Thin:** Guide pages 11 (money) and 15 (modes) describe settings more than they teach; six Flint lessons (premium, market, local, people, files, chat) are three facts with no task.

## Decisions

| Surface | Decision | What happened |
|---|---|---|
| Help center | **Keep, rename to Learn** | It is the one learning place. Home shows My progress, quick guides, the six paths, the skills lessons, tours and demos. |
| Quick guides | **New** | 45 one-screen cards (a line on why, 3 to 5 steps, Do it for me, Show me). One file, `templates/quickguides.json`, read by the app, Flint and the website. |
| Paths | **Keep** | A step that is already true for the project is ticked, and doing a step counts as learning it. |
| Guide pages | **Keep as reference** | Still listed and searched. Search now shows quick guides first. |
| Flint lessons | **Merge** | They are the Show me behind the quick guides. Still open by name from Flint. |
| Tour | **Keep** | One quick guide starts it. |
| Academy | **Merge into Learn as "Skills"** | The 65 lessons, progress and badges are kept. They are listed on the Learn home by job with progress, and open in the same reader, which now has a way back to Learn. The separate "Academy" name is retired in the app's chrome (the destination is "Skills lessons"). Legal documents and "do it free elsewhere" stay as they were. Company's "Learn this role" still opens the right track. |
| Website Learn page | **Keep the course, add the quick guides** | The page now shows the same 45 cards with a search box. The course is for people who have not installed yet. |

Nothing people use was removed.

## What changed in the product

- **? menu:** Quick guides is the second entry. **Ctrl K** lists every card. **Empty states** get a "How it works" link to the card for that kind of place. The **next-step sheet** offers "How do I do this?" until you have done that step once, then never again.
- **Flint:** a "how do I" question that a card answers gets the card in the reply, with Do it for me and Show me. "quick guides", "open the guide for …", "what should I learn next", "resume" and "my progress" work. Flint only offers cards for parts of the app that are present, and a card's wording uses the live name of the button or Settings tab it points at.
- **Progress:** kept on the device (`tribecode.learn`). Academy progress stays on the server as before.
- **Languages:** the Learn chrome, group names and all 45 card titles are in the eight languages, in the app and on the website. The card steps, the one-line why and the button labels are English for now.

## Holes not filled

1. Card steps in seven languages (titles are done).
2. Progress follows the device, not the person. It should sync with the account when sign-in is switched on.
3. No short video or animation per card; Show me is the stand-in.
4. The Academy lessons still use job titles (CEO, CTO) and emoji badges inside the reader. They need a plain-language pass.
5. The website course still uses emoji and its own progress; it does not share progress with the app.
6. No card for money: taking payments, prices, or a shop checkout (the backend is built but off).
7. No card for accounts: sign-in, moving to a new computer, sharing one group across two computers.
8. Game and app paths have no quick guides beyond "start" (sprites, levels, sound, saving a score).
9. No "what went wrong" cards for AI helpers (an AI that will not join, an AI that changed the wrong thing).
10. Nothing measures which cards are opened or finished, so the "40 most likely questions" is a judgement, not data.

## The 10 most valuable next lessons

1. **Your first hour:** one guided run from nothing to a published page with a friend invited. The single most useful lesson; it strings six cards together.
2. **Tell an AI helper what you want:** how to write a task an AI can finish, with three before and after examples.
3. **Check what an AI changed:** read the change, try it in the preview, say yes or send it back.
4. **Two people, one project, no stepping on toes:** who owns what, hand-offs, and what a conflict looks like.
5. **Fix it when the preview is blank:** the five usual causes, in order.
6. **Get your first ten visitors:** where to post the link and what to say (from the Growth lessons, shortened).
7. **Make it work on a phone:** check at phone width, fix the three common problems, add to Home Screen.
8. **Your own web address:** point a name you own at the published site.
9. **Take your project with you:** export, back up, and open it on another computer.
10. **From hobby to small business:** the four Company questions, a price, and the two legal pages every site needs.
