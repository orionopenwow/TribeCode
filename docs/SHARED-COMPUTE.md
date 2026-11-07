# Shared compute

Friends lend their computers to the tribe for heavy repo work: builds, test runs, code analysis (and decompiling or
indexing big codebases). It's deliberately quiet: one row in a project's **Helpers** list (right panel), shown only
once the project has a repo and more than one person.

## Step 1 (v0.7.0): who lends
- Helpers › **Shared compute** opens a small sheet: "Lend this computer" (with its core count) and who else lends,
  online or away. Server: `server/compute.js`, `GET/PUT /api/compute`, stored in `.tribe/compute.json`.

## Step 2: jobs
- The host (or an agent, through an MCP tool `run_shared`) splits heavy work into **jobs**: a repo, a commit, and a
  command from an allowlist the project declares (`tribecode.json`: `"jobs": { "build": "npm run build", "test": "npm test -- --shard={n}/{of}" }`).
- Lenders' desktop apps pull jobs over the tribe connection, check out that commit into a clean temp folder, run the
  command with no network beyond the package registry and a time limit, and send back the exit code, the log and
  any declared artifacts.
- The host merges results (test shards, build artifacts) and posts one short gist: "Build passed on 3 computers in
  41 s".

## Step 3: smarter splitting
- Test shards by past timing; builds per package in a monorepo; analysis per directory.
- Agents see lenders and can ask for a shared run instead of running a long job themselves.

## Safety
- Only commands the repo declares; only commits from the tribe's own repo; never on the lender's own files.
- Lenders can stop at any time; jobs pause when the computer is busy or on battery.
