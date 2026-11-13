// Premium and AI credits, checked on the server (harden, docs/REVIEW-2026-11-12.md, docs/PREMIUM.md). The browser's
// plan (app/ui/premium.js) is only a mirror of this: clearing site storage no longer resets a trial, and a gated feature
// is refused here, with a calm 402 that the app turns into the plans pop-out.
//
// What is gated (everything else, and everything local, stays free):
//   plan     premium templates saved to Files (POST /api/docs with source template:<premium id>)
//   credits  AI answered by the hosted "TribeCode credits" provider (server/llm.js 'hosted'): 1 credit per answer,
//            taken before the call and given back when it fails without an answer. Your own AI (Claude Code, a key,
//            Ollama, the built-in model) never spends credits.
//
// State: .tribe/premium.json { plan: 'free'|'trial'|'premium', until, trialUsed, credits, ledger: [last 200] }.
// Every change is a synchronous read-check-write in one tick (Node runs one at a time), so concurrent requests can't
// spend the same credit twice and the balance never goes below zero.
//
//   GET  /api/premium                 { plan, until, credits, trialUsed, gated }
//   POST /api/premium/trial           start the tribe's one 14-day trial (people, not agents, guests or spectators)
//   PUT  /api/premium                 host, on the host computer: { plan?, until?, addCredits? }   the payments webhook
//                                     stand-in. TODO(payments): Stripe/Paddle webhook (signed) calls set() instead.
'use strict';

const TRIAL_MS = 14 * 86400_000;
const PREMIUM_TEMPLATES = new Set(['board-meeting', 'fundraise']);   // app/ui/doctpl-data.js premium: true
const AI_COST = 1;

module.exports = function makePremium({ store, isLocal, log = () => {} }) {
  const FILE = '.tribe/premium.json';
  const read = () => { const d = store.readJSON(FILE, null) || {}; return { plan: ['trial', 'premium'].includes(d.plan) ? d.plan : 'free', until: d.until || null, trialUsed: !!d.trialUsed, credits: Math.max(0, Math.floor(Number(d.credits) || 0)), ledger: Array.isArray(d.ledger) ? d.ledger : [] }; };
  const write = d => store.writeJSON(FILE, { ...d, ledger: d.ledger.slice(-200) });
  function state() {
    const d = read();
    if (d.plan !== 'free' && d.until && Date.parse(d.until) < Date.now()) { d.plan = 'free'; d.until = null; write(d); }
    return d;
  }
  const active = () => state().plan !== 'free';
  const view = () => { const d = state(); return { plan: d.plan, until: d.until, credits: d.credits, trialUsed: d.trialUsed, gated: { templates: [...PREMIUM_TEMPLATES], aiCost: AI_COST } }; };

  // Take n credits, or nothing. true = taken.
  function reserve(me, n = AI_COST, why = 'ai') {
    const d = state(); n = Math.max(1, Math.floor(n));
    if (d.credits < n) return false;
    d.credits -= n; d.ledger.push({ at: new Date().toISOString(), by: me ? me.id : null, n: -n, why });
    write(d); return true;
  }
  function refund(me, n = AI_COST, why = 'refund') {
    const d = state(); d.credits += Math.max(1, Math.floor(n)); d.ledger.push({ at: new Date().toISOString(), by: me ? me.id : null, n, why }); write(d);
  }
  const credits = () => state().credits;

  // The calm answer for a gated feature. need: 'plan' | 'credits'
  const refuse = (send, res, need, feature) => send(res, 402, {
    error: need === 'credits' ? 'You are out of AI credits. Connect your own AI for free, or get credits.' : 'This one comes with Premium. Everything else stays free.',
    need, feature, plan: state().plan, credits: credits(),
  });
  // POST /api/docs: a premium template's doc needs the plan
  function docBlocked(body) {
    const m = /^template:([\w-]{1,60})$/.exec(String((body && body.source) || ''));
    return !!(m && PREMIUM_TEMPLATES.has(m[1]) && !active());
  }

  async function route(req, res, { m, b, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (m === 'GET' && !b) return send(res, 200, view());
    if (m === 'POST' && b === 'trial') {
      if (['agent', 'spectator'].includes(me.role) || me.guestUntil) return fail(res, 403, 'ask someone in the tribe to start the trial');
      const d = state();
      if (d.plan === 'premium') return send(res, 200, view());
      if (d.trialUsed) return fail(res, 409, 'This tribe already had its free trial.');
      d.plan = 'trial'; d.until = new Date(Date.now() + TRIAL_MS).toISOString(); d.trialUsed = true; d.ledger.push({ at: new Date().toISOString(), by: me.id, n: 0, why: 'trial' }); write(d);
      log(`premium: ${me.name} started the trial`);
      return send(res, 200, view());
    }
    if (m === 'PUT' && !b) {
      if (me.role !== 'host' || !isLocal(req)) return fail(res, 403, 'plans and credits change on the host computer (or from the payments webhook)');
      const body = await readBody(req) || {}, d = state();
      if (body.plan !== undefined) { if (!['free', 'trial', 'premium'].includes(body.plan)) return fail(res, 400, 'plan is free, trial or premium'); d.plan = body.plan; d.until = body.plan === 'free' ? null : body.until && Date.parse(body.until) ? new Date(Date.parse(body.until)).toISOString() : body.plan === 'trial' ? new Date(Date.now() + TRIAL_MS).toISOString() : null; }
      const add = Math.floor(Number(body.addCredits) || 0);
      if (add) { d.credits = Math.max(0, d.credits + add); d.ledger.push({ at: new Date().toISOString(), by: me.id, n: add, why: 'grant' }); }
      write(d); return send(res, 200, view());
    }
    return fail(res, 404, 'no such premium route');
  }
  return { route, view, active, reserve, refund, credits, refuse, docBlocked, AI_COST, PREMIUM_TEMPLATES };
};
