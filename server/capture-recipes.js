// feat/captures: recipes decide a capture's sections, cue phrases and the plain-words prompt (docs/LINK-READER.md).
// The built-in recipes live here (the desktop server is bundled into one file, so they can't be loose .json files);
// each is plain JSON data. A tribe's own recipes are JSON files in .tribe/recipes/<id>.json: agents propose them over
// MCP (capture_recipe_propose), they wait in .tribe/recipes/pending/ until a person approves them in Captures.
'use strict';

const SECTIONS = ['summary', 'points', 'actions', 'decisions', 'transcript'];
const COMMON = {
  key: ['important', 'the key', 'key point', 'main point', 'in short', 'in summary', 'to sum up', 'the point is', 'the goal', 'the problem', 'the reason', 'because', 'means that', 'turns out', 'learned', 'result'],
  decision: ['decided', 'we decide', 'decision', 'agreed', 'we agree', "we'll go with", 'we will go with', 'settled on', 'final answer', 'going with', 'lock it in', 'locked in', 'the plan is', 'our plan is'],
  action: ['we need to', 'need to', 'todo', 'to-do', 'action item', 'next step', 'next', "let's", 'will do', "i'll", 'should', 'must', 'by friday', 'tomorrow', 'tonight', 'this week'],
  skip: ['subscribe', 'sign up for our newsletter', 'cookie', 'all rights reserved', 'click here', 'advertisement', 'sponsored'],
};
const R = (id, title, emoji, extra) => ({ id, title, emoji, builtin: true, sections: ['summary', 'points', 'actions', 'decisions', 'transcript'], summarySentences: 4, points: 6,
  prompt: 'Rewrite these notes in plain, short words. Keep only facts from the text. No hype, no new facts, no emoji.', ...extra, cues: { ...COMMON, ...(extra && extra.cues) } });

const BUILTIN = [
  R('article', 'Article', '📄', { kinds: ['article', 'page'], summarySentences: 4, points: 6, sections: ['summary', 'points', 'actions', 'transcript'] }),
  R('video', 'Video', '🎬', { kinds: ['video', 'short', 'post'], summarySentences: 3, points: 6 }),
  R('voice', 'Voice note', '🎙️', { kinds: ['voice'], summarySentences: 3, points: 5 }),
  R('meeting', 'Meeting', '🗓️', { summarySentences: 3, points: 6, cues: { key: [...COMMON.key, 'update', 'blocked', 'blocker', 'status', 'risk'] },
    prompt: 'Turn this meeting into plain notes: what was discussed, what was decided, and who does what. Short words, only facts from the transcript.' }),
  R('idea', 'Idea', '💡', { summarySentences: 2, points: 5, sections: ['summary', 'points', 'actions', 'transcript'], cues: { key: [...COMMON.key, 'what if', 'imagine', 'idea', 'could be', 'the hook', 'core loop', 'feels'] },
    prompt: 'Write this idea down plainly: the idea in one or two sentences, then what makes it good, then the first small steps. Only what was said.' }),
  R('playtest', 'Playtest feedback', '🎮', { summarySentences: 3, points: 7, cues: { key: [...COMMON.key, 'confusing', 'confused', 'fun', 'boring', 'too hard', 'too easy', 'stuck', 'loved', 'hated', 'bug', 'crash', 'felt', 'frustrat'] },
    prompt: 'Sort this playtest feedback plainly: what players enjoyed, what confused or annoyed them, bugs, and fixes to try. Only what was said.' }),
  R('interview', 'Interview', '🎤', { summarySentences: 3, points: 7, sections: ['summary', 'points', 'actions', 'transcript'], cues: { key: [...COMMON.key, 'i wish', 'i always', 'i never', 'the hardest', 'my favorite', 'i use', 'pain', 'annoying'] },
    prompt: 'Summarize this interview plainly: who they are, what they need, what hurts, and quotes worth keeping. Only what was said.' }),
  R('lecture', 'Lecture', '🎓', { summarySentences: 5, points: 8, sections: ['summary', 'points', 'transcript'], cues: { key: [...COMMON.key, 'definition', 'is defined as', 'remember', 'for example', 'the formula', 'first', 'second', 'finally', 'in other words'] },
    prompt: 'Turn this lecture into study notes: the main idea, the key terms with one-line meanings, and the steps or examples. Plain words, only what was said.' }),
];

// A recipe from an agent or a file: only known fields, short strings, no code. Throws a friendly error when wrong.
function validate(r) {
  if (!r || typeof r !== 'object') throw new Error('A recipe is a small JSON object.');
  const id = String(r.id || r.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
  if (!id) throw new Error('A recipe needs a name.');
  const strs = (a, n = 24, len = 60) => (Array.isArray(a) ? a : []).map(x => String(x || '').trim().toLowerCase().slice(0, len)).filter(Boolean).slice(0, n);
  const cues = {}; for (const k of ['key', 'decision', 'action', 'skip']) cues[k] = strs(r.cues && r.cues[k], 40);
  const sections = strs(r.sections, 5).filter(s => SECTIONS.includes(s));
  return { id, title: String(r.title || id).trim().slice(0, 40), emoji: [...String(r.emoji || '📝')].slice(0, 2).join(''), sections: sections.length ? sections : ['summary', 'points', 'actions', 'transcript'],
    summarySentences: Math.max(1, Math.min(8, Number(r.summarySentences) || 3)), points: Math.max(2, Math.min(8, Number(r.points) || 6)),
    prompt: String(r.prompt || BUILTIN[0].prompt).trim().slice(0, 600), cues, kinds: strs(r.kinds, 6, 12) };
}

module.exports = { BUILTIN, COMMON, SECTIONS, validate };
