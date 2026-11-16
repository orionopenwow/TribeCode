// Flint and the Launch kit (app/ui/launchkit.js): store screenshots, the app icon, store text, keywords, paywalls, the
// launch checklist and the preview video. Used by scripts/dev/flint-eval-cases.js as v:'lk'. [ctx, text, intent, slots?]
module.exports = [
  ['g', 'make store screenshots', 'launch.shots'], ['g', 'make app store screenshots', 'launch.shots'], ['g', 'create screenshots for the app store', 'launch.shots'],
  ['g', 'i need screenshots for google play', 'launch.shots'], ['g', 'play store screenshots', 'launch.shots'], ['g', 'make my app store screenshots', 'launch.shots'],
  ['g', 'design screenshots for my app', 'launch.shots'], ['g', 'generate store screenshots for ios', 'launch.shots'], ['g', 'make the feature graphic', 'launch.shots'],
  ['g', 'make an app icon', 'launch.icon'], ['g', 'design my app icon', 'launch.icon'], ['g', 'i need an app icon', 'launch.icon'], ['g', 'create a new app icon', 'launch.icon'],
  ['g', 'app icon generator', 'launch.icon'], ['g', 'make the icons for my app', 'launch.icon'], ['g', 'generate app icons', 'launch.icon'],
  ['g', 'write my store description', 'launch.text'], ['g', 'write the app store description', 'launch.text'], ['g', 'draft my play store listing', 'launch.text'],
  ['g', 'help me write the app store listing', 'launch.text'], ['g', 'write a description for the app store', 'launch.text'], ['g', 'write my google play description', 'launch.text'],
  ['g', 'make my store listing', 'launch.text'], ['g', 'write the store text', 'launch.text'],
  ['g', 'check my keywords', 'launch.keywords'], ['g', 'check my app store keywords', 'launch.keywords'], ['g', 'improve my keywords', 'launch.keywords'], ['g', 'fix the store keywords', 'launch.keywords'],
  ['g', 'optimize my keywords', 'launch.keywords'], ['g', 'help with aso', 'launch.keywords'], ['g', 'app store optimization', 'launch.keywords'],
  ['g', 'add a paywall', 'launch.paywall'], ['g', 'make a paywall screen', 'launch.paywall'], ['g', 'design a paywall', 'launch.paywall'], ['g', 'add a paywall to my app', 'launch.paywall'],
  ['g', 'paywall templates', 'launch.paywall'], ['g', 'create a subscription paywall', 'launch.paywall'],
  ['g', 'what do i need to launch on the app store', 'launch.checklist'], ['g', 'what do i need to publish on google play', 'launch.checklist'], ['g', 'app store checklist', 'launch.checklist'],
  ['g', 'how do i get my app on the app store', 'launch.checklist'], ['g', 'how do i submit my app to the play store', 'launch.checklist'], ['g', 'launch checklist', 'launch.checklist'],
  ['g', 'what do i need to put my app in the stores', 'launch.checklist'],
  ['g', 'make an app preview video', 'launch.video'], ['g', 'app store preview video', 'launch.video'], ['g', 'make the app preview', 'launch.video'],
  ['g', 'open the launch kit', 'launch.open'], ['g', 'launch kit', 'launch.open'], ['g', 'show me the launch kit', 'launch.open'],
  // neighbours that must keep their meaning
  ['g', 'publish my app to the app store', 'publish.to'], ['g', 'make an android app', 'publish.to'], ['g', 'publish it', 'publish'],
];
