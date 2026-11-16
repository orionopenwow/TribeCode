// Flint and how changes work here (feat/cowork-editors, app/ui/changes.js, server/changereq.js): who approves, why I
// can't change or publish something, sending my change for an OK, and the list of suggested changes.
// Used by scripts/dev/flint-eval-cases.js as v:'cw'. [ctx, text, intent, slots?]
module.exports = [
  ['g', 'who can approve my change?', 'changes.who'], ['g', 'who approves changes here', 'changes.who'], ['g', 'who can approve my changes to the website', 'changes.who', { tool: 'website' }],
  ['g', 'who approves changes to the app', 'changes.who', { tool: 'app' }], ['g', 'who can change the website', 'changes.who', { tool: 'website' }], ['g', 'who can edit the store page', 'changes.who', { tool: 'store page' }],
  ['g', 'who will approve my edits', 'changes.who'], ['g', 'who do i ask for approval', 'changes.who'], ['g', 'who signs off on changes', 'changes.who'], ['a', 'who needs to approve this change', 'changes.who'],
  ['g', 'who is in charge of the website', 'changes.who', { tool: 'website' }], ['mo', 'who can approve my changes to the motion graphic', 'changes.who', { tool: 'motion graphic' }],
  ['g', "why can't I publish?", 'changes.why', { verb: 'publish' }], ['g', 'why cant i publish', 'changes.why', { verb: 'publish' }], ['g', "why can't i change the website", 'changes.why', { verb: 'change', tool: 'website' }],
  ['g', 'why cannot i edit the app', 'changes.why', { verb: 'edit', tool: 'app' }], ['s', "why can't i edit this", 'changes.why', { verb: 'edit' }], ['g', 'why are my changes a draft', 'changes.why'],
  ['g', 'why do my changes need approval', 'changes.why'], ['a', 'why is it not letting me save', 'changes.why', { verb: 'save' }], ['g', 'why are my edits not saving', 'changes.why'],
  ['s', 'send this to Ana for approval', 'changes.send', { who: 'ana' }], ['a', 'send my changes for approval', 'changes.send'], ['mo', 'submit my draft for review', 'changes.send'], ['s', 'suggest this change', 'changes.send'],
  ['a', 'ask ana to approve this', 'changes.send', { who2: 'ana' }], ['s', 'send it for an ok', 'changes.send'], ['g', 'send my suggestion', 'changes.send'], ['s', 'ask for approval', 'changes.send'],
  ['a', 'send these changes to sam for approval', 'changes.send', { who: 'sam' }], ['s', 'get maya to approve my changes', 'changes.send', { who2: 'maya' }],
  ['g', 'show my requests', 'changes.mine'], ['g', 'show my change requests', 'changes.mine'], ['g', 'open suggested changes', 'changes.mine'], ['g', 'what changes are waiting for me', 'changes.mine'],
  ['g', "what's waiting for my ok", 'changes.mine'], ['g', 'did anyone approve my change', 'changes.mine'], ['g', 'list pending changes', 'changes.mine'], ['g', 'which requests are pending', 'changes.mine'],
];
