# Make an app: In practice

The first version works for you. Make it work for other people.

## Plan in thin slices

Write each feature as "someone can do X". Build the thinnest version that lets them do it, try it, then improve. One slice is one task on the Task Board.

## Screens and states

For every screen, design four states, not one:

- **Empty**: nothing here yet, and what to do first.
- **Loading**: something is happening.
- **Error**: what went wrong, in plain words, and how to fix it.
- **Full**: lots of data, long names, small screens.

## Data

- Decide what is saved and where before you build. Write it in a doc in the project.
- Collect only what the app needs. Say what you keep and why.
- Keep secrets (keys, passwords) out of the project's files.

## Working with AI helpers

- Give one clear task at a time, with what "done" looks like.
- Ask for small changes you can read. Review what the helper proposes before you approve it.
- If something breaks, go back a version, then ask again with what went wrong.

## Testing

1. Do the main job at phone size, then on a real phone using the link.
2. Try wrong input: empty, very long, emoji, pasted text.
3. Try it with a slow connection and with none.
4. Hand it to someone new and say nothing.

## Releasing

Publish often. Each publish is a version with a note on what changed. In Publish, **Where it goes** offers:

- **A link that stays up**, through your own GitHub sign-in. Everything below builds on it.
- **Install on phones**: name, icon and an offline copy, so it opens like an app.
- **Android app**: an app file built in your GitHub account, with a download link and a QR code.
- **Computer app**: Windows, Mac and Linux installers, unsigned.
- **Download it**: a zip for any web service you already use.

An iPhone app needs a Mac and a paid Apple developer account. Until then, iPhone users install from the link.
