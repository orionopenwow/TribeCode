// After-huddle summary. A project setting, "Post a summary after each huddle" (off by default; the tribe host or
// the project's lead switches it in the huddle's captions strip). When it is on and a captioned huddle ends (or
// someone presses "End & summarize"), this writes a short summary and the overall mood of the conversation:
//   * by the local model (brain, Ollama) when it runs, else a plain extractive summary (no model needed),
//   * posted as one chat line in the project's channel,
//   * and, when the project has a git repo, committed as notes/huddles/<date>-<HHMM>.md
//     (commit message "TribeCode: huddle notes <date>"; only that file, on the branch that is checked out, never pushed).
// The repo file holds the summary and the mood, not the transcript: the transcript stays in the tribe's Docs.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const gitutil = require('./gitutil');

const pad = n => String(n).padStart(2, '0');
const day = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const MOODS = ['positive', 'neutral', 'negative', 'mixed'];

const POS = /\b(great|good|nice|love|loved|awesome|cool|thanks|thank you|yes|agree|agreed|happy|excited|works|working|fun|perfect|done|shipped|easy|glad|amazing|fixed)\b/gi;
const NEG = /\b(bug|bugs|broken|break|breaks|problem|problems|worried|worry|stuck|hate|fail|fails|failed|failing|bad|issue|issues|blocked|blocker|angry|frustrat\w*|annoying|crash\w*|slow|wrong|late|confus\w*|hard)\b/gi;
const KEY = /\b(will|i'll|we'll|let's|lets|decide|decided|agree|agreed|need|needs|should|must|plan|ship|build|fix|write|todo|next|deadline|tonight|tomorrow)\b/i;

// Overall mood from word counts: good enough to say "upbeat" vs "worried" when no model runs.
function sentimentOf(text) {
  const t = String(text || ''), p = (t.match(POS) || []).length, n = (t.match(NEG) || []).length;
  if (p && n && Math.abs(p - n) <= 1) return 'mixed';
  if (p > n) return 'positive';
  if (n > p) return 'negative';
  return 'neutral';
}
// Up to three lines that carry decisions or plans (in the order they were said), as "Name: text" bullets.
function extractive(lines) {
  const scored = lines.map((l, i) => ({ l, i, s: (KEY.test(l.text) ? 10 : 0) + Math.min(l.text.length, 160) / 40 }));
  const top = scored.filter(x => x.l.text.split(/\s+/).length >= 3).sort((a, b) => b.s - a.s).slice(0, 3).sort((a, b) => a.i - b.i);
  return (top.length ? top : scored.slice(0, 3)).map(x => `- ${x.l.name}: ${x.l.text.length > 200 ? x.l.text.slice(0, 197) + '…' : x.l.text}`).join('\n');
}
// The model's answer: "MOOD: positive - reason" then "SUMMARY:" bullets. Lenient about formatting.
function parseModel(out) {
  const text = String(out || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim(); if (!text) return null;
  const mood = text.match(/^\W*(?:mood|sentiment)\W*:?\W*(positive|neutral|negative|mixed)\b[\s\-–—:,.]*(.*)$/im);
  let summary = (text.split(/^\W*summary\W*:?\s*$/im)[1] || text.replace(/^.*(?:mood|sentiment).*$/im, '')).trim();
  summary = summary.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 6).map(s => (/^[-*•]/.test(s) ? s.replace(/^[-*•]\s*/, '- ') : '- ' + s)).join('\n');
  if (!summary) return null;
  return { summary, sentiment: mood ? mood[1].toLowerCase() : null, why: mood ? mood[2].trim().slice(0, 160) : '' };
}

module.exports = function huddleSum({ P, brain, postChat, nameOf, log = () => {} }) {
  const enabled = pid => !!(pid && (P.get(pid) || {}).huddleSummary);

  async function summarize(lines) {
    const transcript = lines.map(l => `${l.name}: ${l.text}`).join('\n');
    let model = null;
    try {
      model = parseModel(await brain.generate(`Huddle transcript:\n${transcript.slice(-10000)}\n\n` +
        'Reply in exactly this format:\nMOOD: <positive|neutral|negative|mixed> - <a few words on why>\nSUMMARY:\n- <2 to 4 short bullets: what was discussed and decided>\nOnly use facts from the transcript.',
        { system: 'You summarize short voice huddles for a small team of friends building software. Be concrete, brief and kind.', maxTokens: 260 }));
    } catch { model = null; }
    const sentiment = (model && MOODS.includes(model.sentiment)) ? model.sentiment : sentimentOf(transcript);
    if (model) return { summary: model.summary, sentiment, why: model.why, by: `local model (${(brain.status && brain.status().model) || 'Ollama'})` };
    return { summary: extractive(lines), sentiment, why: '', by: 'TribeCode (extractive; local model off)' };
  }

  async function commit(repo, rel, body, date) {
    if (!repo || !fs.existsSync(path.join(repo, '.git'))) return null;
    const G = gitutil(repo), abs = path.join(repo, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
    const relGit = rel.split(path.sep).join('/');
    for (let tries = 0; tries < 3; tries++) {   // git's index.lock can be busy for a moment (autopilot, a teammate's commit)
      try {
        await G.git(['add', '--', relGit]);
        await G.git([...(await G.identity()), 'commit', '--quiet', '--no-verify', '-m', `TribeCode: huddle notes ${date}`, '--', relGit]);
        return { file: relGit, sha: (await G.gitTry(['rev-parse', '--short', 'HEAD'])).out };
      } catch (e) { if (tries === 2 || !/index\.lock|unable to create/i.test(e.message)) throw e; await new Promise(r => setTimeout(r, 400)); }
    }
    return null;
  }

  // m: { project, started }, lines: [{ at, name, text }], docTitle: the meeting notes doc in Docs.
  async function post({ project, started, lines, docTitle }) {
    if (!enabled(project) || !lines || !lines.length) return null;
    return P.inProject(project, async () => {
      const start = new Date(started), end = new Date(lines[lines.length - 1].at);
      const mins = Math.max(1, Math.round((end - start) / 60000));
      const who = [...new Set(lines.map(l => l.name))];
      const s = await summarize(lines);
      const date = day(start);
      const p = P.get(project) || {};
      let saved = null, error = '';
      if (p.repo) {
        let rel = path.join('notes', 'huddles', `${date}-${hm(start).replace(':', '')}.md`);
        for (let n = 2; fs.existsSync(path.join(p.repo, rel)); n++) rel = path.join('notes', 'huddles', `${date}-${hm(start).replace(':', '')}-${n}.md`);
        const md = `# Huddle notes · ${date} ${hm(start)}\n\n**When** ${date} ${hm(start)} to ${hm(end)} · ${mins} min\n**Who spoke** ${who.join(', ')}\n` +
          `**Mood** ${s.sentiment}${s.why ? ` (${s.why})` : ''}\n**Summary by** ${s.by}\n\n## Summary\n\n${s.summary}\n\n` +
          `_The full transcript is in TribeCode › Docs${docTitle ? ` › "${docTitle}"` : ''}._\n`;
        try { saved = await commit(p.repo, rel, md, date); } catch (e) { error = e.message.split('\n')[0]; log('huddle notes commit failed: ' + error); }
      }
      const where = saved ? `\n_Saved to the repo: \`${saved.file}\` (${saved.sha})._` : error ? `\n_Could not commit the notes to the repo: ${error}_` : '';
      const msg = postChat('general', 'tribecode', `🧾 **Huddle summary** · ${mins} min · ${who.join(', ')} · mood: **${s.sentiment}**${s.why ? ` (${s.why})` : ''}\n${s.summary}${where}`,
        { huddleSummary: { sentiment: s.sentiment, by: s.by, file: saved ? saved.file : null } });
      return { ...s, file: saved && saved.file, sha: saved && saved.sha, message: msg && msg.id, error };
    });
  }

  return { enabled, post, summarize };
};
module.exports.sentimentOf = sentimentOf;
module.exports.extractive = extractive;
module.exports.parseModel = parseModel;
