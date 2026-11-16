/*! TribeCode Motion Kit, social posts and share clips (feat/site-demos). Plain JS, no build step, no network. MIT.
 *
 * More Motion Studio templates, added through the engine's own extension point (TribeMotionKit.define). Two groups:
 *   social  'Social posts'  60+ post layouts for X, TikTok, Reels, Shorts, Instagram and LinkedIn, each a different
 *                           shape of post (a hook, a poll, a before and after, a milestone, a changelog…), in the
 *                           size each feed wants: 9:16, 1:1, 4:5 or 16:9.
 *   share   'Share clips'   the clips "Share a clip" makes from a project: its app screens in a phone, its website
 *                           with the camera moving over it, or a timelapse of its screenshots, each in three sizes.
 *                           Options: { screens: [src…], images: [src…], hook, title, cta, end: false (no end card) }.
 * Every template follows the engine's rules: one shape that never cuts, something on the beat, and a last frame that is
 * the first frame. Loads after motionkit.js in the browser; require('./motionsocial.js') in node returns the kit.
 */
(function (root, factory) {
  const K = typeof module === 'object' && module.exports ? require('./motionkit.js') : root.TribeMotionKit;
  if (K && K.define) factory(K);
  if (typeof module === 'object' && module.exports) module.exports = K;
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';
  const { S, click, drag, hover, type, focus } = K.helpers;
  const D = (id, name, about, base, states) => K.define(id, 'social', name, about, base, states);
  const still = { camera: { strength: 0 }, cursor: false };
  const V = (o = {}) => ({ aspect: '9:16', ...o });   // vertical feeds: TikTok, Reels, Shorts, stories
  const Q = (o = {}) => ({ aspect: '4:5', ...o });    // Instagram and LinkedIn portrait
  const W = (o = {}) => ({ aspect: '16:9', ...o });   // X, YouTube, LinkedIn video

  // ---------- hooks and words ----------
  D('soc-pov', 'POV hook 9:16', 'Outline captions over a full frame: the classic "POV:" opener.', V({ bars: 2, ...still, backdrop: { kind: 'scene' }, thumb: 5 }), [
    S('caption', 0, { text: 'POV: your friends just shipped a game with you', style: 'outline', fs: 76 }), S('caption', 7.6, { text: 'POV: your friends just shipped a game with you', style: 'outline', fs: 76 })]);
  D('soc-hot-take', 'Hot take', 'A big claim, a beat of silence, then the line that backs it up.', { bars: 2, ...still, thumb: 2 }, [
    S('word', 0, { text: 'Nobody needs a terminal', fs: 130, hi: 3 }), S('word', 3.5, { text: 'to make an app anymore.', fs: 130, hi: 2 }), S('word', 7.6, { text: 'Nobody needs a terminal', fs: 130, hi: 3 })]);
  D('soc-myth-fact', 'Myth and fact 4:5', 'A myth on a card, then the fact with a tick.', Q({ bars: 4, thumb: 9 }), [
    S('card', 0, { icon: 'x', title: 'Myth', body: 'You need to know code to build an app.' }, [click(5, 220, 140)]), S('check', 6), S('card', 7, { icon: 'check', title: 'Fact', body: 'You need an idea and a few friends. Flint does the rest.' }), S('card', 15.5, { icon: 'x', title: 'Myth', body: 'You need to know code to build an app.' })]);
  D('soc-three-words', 'Three words 9:16', 'Three short words on three beats, then the name.', V({ bars: 2, ...still, thumb: 3.2 }), [
    S('word', 0, { text: 'Plan.', fs: 200, w: 900 }), S('word', 1, { text: 'Build.', fs: 200, w: 900 }), S('word', 2, { text: 'Play.', fs: 200, w: 900, hi: 1 }), S('wordmark', 3.5, { text: 'LANTERN RUN', hi: 0, fs: 120 }), S('word', 7.6, { text: 'Plan.', fs: 200, w: 900 })]);
  D('soc-question-hook', 'Question hook', 'A question that stops the scroll, then the answer on a card.', { bars: 4, ...still, thumb: 9 }, [
    S('word', 0, { text: 'What if your group chat could build apps?', fs: 110, hi: 6 }), S('card', 6, { icon: 'tribe', title: 'It can', body: 'Friends and their AIs in one room, one link to join.' }), S('word', 15.5, { text: 'What if your group chat could build apps?', fs: 110, hi: 6 })]);
  D('soc-top-text', 'Top text over a screen', 'A line on top, your screenshot below, a caption to finish.', Q({ bars: 4, thumb: 6, camera: { strength: 0.15 }, cursor: false }), [
    S('word', 0, { text: 'Me after one weekend', fs: 96, w: 960 }), S('image', 3, { w: 960, h: 760 }, [focus(7)]), S('caption', 11, { text: 'we actually finished it', style: 'pill', fs: 64 }), S('word', 15.5, { text: 'Me after one weekend', fs: 96, w: 960 })]);
  D('soc-one-liner', 'One-line tip 9:16', 'Karaoke captions read the tip out, then a card sums it up.', V({ bars: 4, ...still, backdrop: { kind: 'scene' }, thumb: 3 }), [
    S('caption', 0, { text: 'click any word on your site to change it', style: 'karaoke', hold: 8 }), S('card', 9, { icon: 'sparkle', title: 'Tip', body: 'Click to select, double-click to type.' }), S('caption', 15.5, { text: 'click any word on your site to change it', style: 'karaoke', hold: 8 })]);
  D('soc-stacked', 'Stacked list 4:5', 'Three lines build a headline, then a button.', Q({ bars: 4, thumb: 10 }), [
    S('word', 0, { text: 'Games.', fs: 150, w: 900 }), S('word', 2, { text: 'Games. Apps.', fs: 150, w: 900 }), S('word', 4, { text: 'Games. Apps. Sites.', fs: 130, w: 960, hi: 2 }), S('button', 8, { text: 'Make one free', icon: 'arrow' }, [click(10, 0, 0)]), S('word', 15.5, { text: 'Games.', fs: 150, w: 900 })]);

  // ---------- launches and drops ----------
  D('soc-launch-916', 'Launch day 9:16', 'A countdown, your icon, then the name and where to get it.', V({ bars: 4, thumb: 7 }), [
    S('count', 0, { from: 3, go: 'Out now' }), S('appicon', 4, { mark: 'bolt', text: 'Pixel Quest' }), S('endcard', 9, { title: 'Pixel Quest', cta: 'Play free in your browser', mark: 'play' }), S('count', 15.5, { from: 3, go: 'Out now' })]);
  D('soc-feature-drop', 'Feature drop', 'NEW badge, the feature on a card, a toast that it is live.', { bars: 4, thumb: 7 }, [
    S('badge', 0, { text: 'NEW', live: false, icon: 'sparkle' }), S('card', 2, { icon: 'phone', title: 'Approve from your phone', body: 'One tap and it goes live. Nothing changes without a yes.' }, [click(8, 220, 140)]), S('toast', 9, { text: 'Live for everyone' }), S('badge', 15.5, { text: 'NEW', live: false, icon: 'sparkle' })]);
  D('soc-release-notes', 'Release notes 9:16', 'A version badge, three changes ticking in, an Update button.', V({ bars: 4, thumb: 8 }), [
    S('badge', 0, { text: 'v1.2', live: false, icon: 'sparkle' }), S('list', 2, { title: 'In this update', items: ['Night mode', 'Faster saves', 'A new boss'] }), S('button', 9, { text: 'Update now', icon: 'arrow' }, [click(11, 0, 0)]), S('check', 12.5), S('badge', 15.5, { text: 'v1.2', live: false, icon: 'sparkle' })]);
  D('soc-teaser', 'Teaser', 'A dark frame that says something is coming, then a glimpse of the icon.', { bars: 4, theme: 'ink', ...still, thumb: 9 }, [
    S('scene', 0, { w: 1440, h: 1440, r: 0, fill: 'paper', title: 'Something is coming', sub: 'Friday' }), S('appicon', 7, { mark: 'star' }), S('scene', 15.5, { w: 1440, h: 1440, r: 0, fill: 'paper', title: 'Something is coming', sub: 'Friday' })]);
  D('soc-download', 'Get it now 9:16', 'Your screens in a phone, then a button that becomes your icon.', V({ bars: 4, thumb: 4, camera: { strength: 0.2 } }), [
    S('phone', 0, { caption: 'Your new favourite app', w: 520, h: 1060, r: 80 }, [click(2, 0, 300), click(4, 0, 300)]), S('button', 7, { text: 'Get it free', icon: 'phone', w: 560, h: 130, r: 65, fs: 42 }, [click(9, 0, 0)]), S('appicon', 10, { mark: 'bolt', text: 'Pixel Quest' }), S('phone', 15.5, { caption: 'Your new favourite app', w: 520, h: 1060, r: 80 })]);
  D('soc-beta-call', 'Looking for testers', 'Ask for beta testers: a line, a Join button, a thank-you toast.', { bars: 4, thumb: 8 }, [
    S('word', 0, { text: 'We need ten testers', fs: 120, hi: 2 }), S('button', 4, { text: 'Join the beta', icon: 'user' }, [click(7, 0, 0)]), S('check', 8), S('toast', 10, { text: 'You are in. Check your messages' }), S('word', 15.5, { text: 'We need ten testers', fs: 120, hi: 2 })]);
  D('soc-coming-soon-916', 'Coming soon 9:16', 'A ring fills toward launch day, then the date.', V({ bars: 4, ...still, thumb: 8 }), [
    S('ring', 0, { value: 0.9, label: 'of the way there' }), S('word', 6, { text: 'Out on the 21st', fs: 140, w: 900, hi: 2 }), S('ring', 15.5, { value: 0.9, label: 'of the way there' })]);
  D('soc-event-invite', 'Event invite 4:5', 'A date badge, what it is, a button to RSVP.', Q({ bars: 4, thumb: 9 }), [
    S('badge', 0, { text: 'SAT · 8 PM', live: false, icon: 'clock' }), S('word', 2, { text: 'Game jam night at the library', fs: 100, w: 960, hi: 1 }), S('button', 8, { text: 'Save my spot', icon: 'check' }, [click(10, 0, 0)]), S('toast', 11, { text: 'See you Saturday' }), S('badge', 15.5, { text: 'SAT · 8 PM', live: false, icon: 'clock' })]);

  // ---------- proof: before and after, numbers ----------
  D('soc-before-after-916', 'Before and after 9:16', 'The word Before, the divider dragged across, then After.', V({ bars: 4, thumb: 7, camera: { strength: 0.15 } }), [
    S('word', 0, { text: 'Before', fs: 180, w: 900 }), S('wipe', 2, { w: 960, h: 1400, r: 40 }, [drag(4, 7, 380, 0, -380, 0), drag(10, 12, -380, 0, 380, 0)]), S('word', 13, { text: 'After', fs: 180, w: 900, hi: 0 }), S('word', 15.5, { text: 'Before', fs: 180, w: 900 })]);
  D('soc-day1-day30', 'Day 1 and day 30', 'Two numbers, then the screens side by side.', { bars: 4, thumb: 9, camera: { strength: 0.15 } }, [
    S('stat', 0, { value: 1, label: 'day in' }), S('stat', 3, { value: 30, from: 1, label: 'days in' }), S('wipe', 6, { la: 'Day 1', lb: 'Day 30' }, [drag(8, 11, 380, 0, -380, 0)]), S('stat', 15.5, { value: 1, label: 'day in' })]);
  D('soc-hours-built', 'Built in a weekend', 'The hours count up, then the thing they built.', { bars: 4, thumb: 9, camera: { strength: 0.25 } }, [
    S('stat', 0, { value: 38, suffix: ' hours', label: 'from idea to playable' }), S('phone', 5, {}, [click(8, 0, 200), click(11, 0, 200)]), S('stat', 15.5, { value: 38, suffix: ' hours', label: 'from idea to playable' })]);
  D('soc-milestone-night', 'Milestone on night', 'A big number on a dark canvas, a ring, then thank you.', { bars: 4, theme: 'night', cursor: false, thumb: 5 }, [
    S('stat', 0, { value: 1000, label: 'people played this week' }), S('ring', 5, { value: 1, label: 'goal reached' }), S('word', 10, { text: 'Thank you', fs: 180, hi: 1 }), S('stat', 15.5, { value: 1000, label: 'people played this week' })]);
  D('soc-weekly-recap', 'Weekly recap', 'Bars for the week, then the best number.', { bars: 4, cursor: false, thumb: 6 }, [
    S('bars', 0, {}), S('stat', 6, { value: 48, suffix: '%', label: 'more players than last week' }), S('bars', 15.5, {})]);
  D('soc-highlight-4x5', 'One number, then the chart 4:5', 'The headline number, then the line behind it with a tooltip.', Q({ bars: 4, thumb: 10 }), [
    S('stat', 0, { value: 3, suffix: 'x', label: 'more sign-ups since the new home page' }), S('chart', 5, { title: 'Sign-ups', big: '3x' }, [hover(8, 12, -330, 40, 330, 40)]), S('stat', 15.5, { value: 3, suffix: 'x', label: 'more sign-ups since the new home page' })]);
  D('soc-speedrun', 'Speedrun 9:16', 'A timer runs, a tick lands, the time stays.', V({ bars: 4, cursor: false, thumb: 9 }), [
    S('badge', 0, { text: 'SPEEDRUN', live: false, icon: 'clock' }), S('stat', 2, { value: 92, suffix: ' s', label: 'website from scratch' }), S('check', 9), S('word', 11, { text: 'New record', fs: 150, w: 900, hi: 1 }), S('badge', 15.5, { text: 'SPEEDRUN', live: false, icon: 'clock' })]);
  D('soc-streak', 'Streak 9:16', 'A ring, a streak count and a toast that keeps it going.', V({ bars: 4, cursor: false, thumb: 7 }), [
    S('ring', 0, { value: 0.71, label: 'of the week' }), S('stat', 5, { value: 21, label: 'day streak' }), S('toast', 10, { text: 'Come back tomorrow to keep it' }), S('ring', 15.5, { value: 0.71, label: 'of the week' })]);
  D('soc-leaderboard', 'Leaderboard shoutout 4:5', 'Ranked rows, then a shout to the top builder.', Q({ bars: 4, cursor: false, thumb: 6 }), [
    S('list', 0, { title: 'Top builders this week', items: ['Maya', 'Sam', 'Ana', 'Leo'], vals: [42, 35, 28, 19] }), S('word', 8, { text: 'Congrats, Maya', fs: 130, w: 960, hi: 1 }), S('list', 15.5, { title: 'Top builders this week', items: ['Maya', 'Sam', 'Ana', 'Leo'], vals: [42, 35, 28, 19] })]);
  D('soc-split-compare', 'Side by side 16:9', 'Two versions with labels, dragged back and forth, then the verdict.', W({ bars: 4, thumb: 5, camera: { strength: 0.1 } }), [
    S('wipe', 0, { w: 1500, h: 860, la: 'Old', lb: 'New' }, [drag(2, 5, 0, 0, 600, 0), drag(6, 9, 600, 0, -600, 0), drag(10, 12, -600, 0, 0, 0)]), S('word', 13, { text: 'Which one?', fs: 140 }), S('wipe', 15.5, { w: 1500, h: 860, la: 'Old', lb: 'New' })]);
  D('soc-new-look', 'A new look', 'The divider sweeps from the old theme to the new one.', { bars: 2, thumb: 4, camera: { strength: 0.1 } }, [
    S('wipe', 0, { la: 'Light', lb: 'Dark' }, [drag(1, 4, 380, 0, -380, 0), drag(5, 7, -380, 0, 380, 0)]), S('wipe', 7.6, { la: 'Light', lb: 'Dark' })]);

  // ---------- conversation: polls, questions, quotes ----------
  D('soc-poll-916', 'Poll 9:16', 'A line, the poll, a tap, results, and "tell us in the replies".', V({ bars: 4, thumb: 7 }), [
    S('word', 0, { text: 'Help us pick', fs: 150, w: 900 }), S('poll', 2, { q: 'Which boss comes next?', opts: [['The lantern ghost', 52], ['The clock tower', 30], ['The fox king', 18]] }, [click(5, -100, -40)]), S('word', 11, { text: 'Tell us in the replies', fs: 110, w: 900, hi: 3 }), S('word', 15.5, { text: 'Help us pick', fs: 150, w: 900 })]);
  D('soc-feedback-poll', 'Ask for feedback', 'A poll, a vote, a toast thanking them.', { bars: 2, thumb: 5 }, [
    S('poll', 0, { q: 'How does the new menu feel?', opts: [['Love it', 64], ['It is fine', 27], ['Bring the old one back', 9]] }, [click(2, -100, -40)]), S('toast', 5, { text: 'Thanks. We read every vote' }), S('poll', 7.6, { q: 'How does the new menu feel?', opts: [['Love it', 64], ['It is fine', 27], ['Bring the old one back', 9]] })]);
  D('soc-qa', 'Q and A 9:16', 'A question card, then the answer read out in captions.', V({ bars: 4, ...still, thumb: 3 }), [
    S('card', 0, { icon: 'chat', title: 'You asked', body: 'Can my friend use a different AI than me?' }), S('caption', 6, { text: 'yes everyone brings their own or none at all', style: 'pill', hold: 8 }), S('card', 15.5, { icon: 'chat', title: 'You asked', body: 'Can my friend use a different AI than me?' })]);
  D('soc-quote-4x5', 'Quote card 4:5', 'A real quote set large, then who said it and your end card.', Q({ bars: 4, cursor: false, thumb: 6 }), [
    S('quote', 0, { text: 'Put a real quote here, in the words someone actually used.', who: '— Name, what they made' }), S('endcard', 9, {}), S('quote', 15.5, { text: 'Put a real quote here, in the words someone actually used.', who: '— Name, what they made' })]);
  D('soc-reply-card', 'Reply to a comment', 'Their comment as a post, your answer as a card.', { bars: 4, thumb: 9, cursor: false }, [
    S('post', 0, { name: 'A follower', handle: '@follower · 2h', text: 'Does this work on a phone?', likes: 48 }), S('card', 6, { icon: 'phone', title: 'It does', body: 'Join from a link, approve changes, send voice notes.' }), S('post', 15.5, { name: 'A follower', handle: '@follower · 2h', text: 'Does this work on a phone?', likes: 48 })]);
  D('soc-shoutout', 'Shoutout', 'A post about someone, the heart fills, a thank-you toast.', { bars: 2, thumb: 6, cursor: false }, [
    S('post', 0, { name: 'Pixel Quest', handle: '@pixelquest · now', text: 'Huge thanks to Ana for the new soundtrack. Listen in the game today.', likes: 860 }), S('toast', 5, { text: 'Thank you, Ana', icon: 'heart' }), S('post', 7.6, { name: 'Pixel Quest', handle: '@pixelquest · now', text: 'Huge thanks to Ana for the new soundtrack. Listen in the game today.', likes: 860 })]);
  D('soc-thank-you-4x5', 'Thank-you card 4:5', 'Thank you, a quote from the community, a follow card.', Q({ bars: 4, cursor: false, thumb: 2 }), [
    S('word', 0, { text: 'Thank you', fs: 180, w: 900, hi: 1 }), S('quote', 3, { text: 'Add a real message from someone who played it.', who: '— Their name' }), S('endcard', 10, { title: 'Follow the build', cta: '@yourhandle', mark: 'user' }), S('word', 15.5, { text: 'Thank you', fs: 180, w: 900, hi: 1 })]);

  // ---------- show the product ----------
  D('soc-screen-spotlight', 'Screen spotlight 4:5', 'A phone, then a callout card on the feature.', Q({ bars: 4, thumb: 9, camera: { strength: 0.25 } }), [
    S('phone', 0, {}, [click(3, 0, 200)]), S('card', 6, { icon: 'sparkle', title: 'Streaks that stick', body: 'Your week in one ring. Miss a day and it waits for you.' }), S('phone', 15.5, {})]);
  D('soc-click-to-edit', 'Click to edit 16:9', 'A screenshot, the camera on one spot, a toast with the change.', W({ bars: 4, thumb: 6, camera: { strength: 0.15 }, cursor: false }), [
    S('image', 0, { w: 1500, h: 860 }, [focus(3), focus(8)]), S('toast', 11, { text: 'Headline changed. Undo is one click' }), S('image', 15.5, { w: 1500, h: 860 })]);
  D('soc-search-reveal', 'Search reveal 16:9', 'A command palette types, then the result opens as a card.', W({ bars: 4, thumb: 7 }), [
    S('cmdk', 0, { query: 'make a menu screen', items: ['Make a menu screen', 'Add a settings screen', 'Add onboarding', 'Make it dark'] }, [type(1, 3), click(4.5, 0, -70, { enter: true, soft: true })]), S('card', 5, { icon: 'phone', title: 'Menu screen added', body: 'Linked from the home screen. Press Play to try it.' }), S('cmdk', 15.5, { query: 'make a menu screen', items: ['Make a menu screen', 'Add a settings screen', 'Add onboarding', 'Make it dark'] })]);
  D('soc-dark-mode', 'Dark mode is here', 'A toggle flips on the beat, then the words.', { bars: 2, thumb: 5 }, [
    S('toggle', 0, {}, [click(1, 0, 0), click(2, 0, 0), click(3, 0, 0)]), S('word', 4, { text: 'Dark mode is here', fs: 130, hi: 1 }), S('toggle', 7.6, {})]);
  D('soc-tabs-tour', 'Tabs tour', 'A tab bar walks through three screens, then a card on the last.', { bars: 4, thumb: 9 }, [
    S('tabs', 0, { labels: ['Today', 'Stats', 'Friends'] }, [click(2, 0, 0, { i: 1 }), click(4, 250, 0, { i: 2 })]), S('card', 6, { icon: 'tribe', title: 'Friends', body: 'Cheer each other on. Streaks are better together.' }), S('tabs', 15.5, { labels: ['Today', 'Stats', 'Friends'] })]);
  D('soc-notification', 'Notification hook 9:16', 'A notification lands, gets tapped, and the words explain.', V({ bars: 4, thumb: 8 }), [
    S('notif', 0, {}, [click(3, 200, 0)]), S('check', 4), S('word', 6, { text: 'Approved from the bus', fs: 120, w: 900, hi: 3 }), S('notif', 15.5, {})]);
  D('soc-island-music', 'Soundtrack drop', 'An island opens into a player for your game soundtrack.', { bars: 4, thumb: 5 }, [
    S('island', 0, { title: 'New soundtrack', sub: 'Tap to listen', icon: 'music' }, [click(2, 0, 0)]), S('player', 3, { title: 'Lantern Theme', artist: 'Pixel Quest OST' }, [click(4, 304, -44), drag(8, 10, 28, 70, 240, 70)]), S('island', 15.5, { title: 'New soundtrack', sub: 'Tap to listen', icon: 'music' })]);
  D('soc-remix-this', 'Remix this', 'Your app in a phone, a Remix button, then the end card.', { bars: 4, thumb: 8, camera: { strength: 0.2 } }, [
    S('phone', 0, {}, [click(3, 0, 200)]), S('button', 5, { text: 'Remix it', icon: 'repost' }, [click(7, 0, 0)]), S('endcard', 8, {}), S('phone', 15.5, {})]);
  D('soc-step-by-step-916', 'Step by step 9:16', 'Step 1, 2, 3 on beats, each with its button press.', V({ bars: 4, thumb: 4 }), [
    S('word', 0, { text: 'Step 1: name it', fs: 120, w: 900, hi: 0 }), S('word', 3, { text: 'Step 2: pick a look', fs: 120, w: 900, hi: 0 }), S('word', 6, { text: 'Step 3: invite friends', fs: 110, w: 900, hi: 0 }), S('button', 9, { text: 'Copy invite link', icon: 'share' }, [click(11, 0, 0)]), S('toast', 12, { text: 'Link copied' }), S('word', 15.5, { text: 'Step 1: name it', fs: 120, w: 900, hi: 0 })]);
  D('soc-link-in-bio', 'Link in bio 9:16', 'A phone, then a badge pointing to your bio.', V({ bars: 2, thumb: 6.5, camera: { strength: 0.2 } }), [
    S('phone', 0, { w: 520, h: 1060, r: 80 }, [click(2, 0, 300)]), S('badge', 4, { text: 'LINK IN BIO', live: false, icon: 'arrow', w: 420 }), S('phone', 7.6, { w: 520, h: 1060, r: 80 })]);

  // ---------- behind the scenes and live ----------
  D('soc-live-916', 'Going live 9:16', 'LIVE badge, the stream title, a toast to join.', V({ bars: 4, cursor: false, thumb: 6 }), [
    S('badge', 0, { text: 'LIVE' }), S('word', 2, { text: 'Building the boss fight with chat', fs: 110, w: 900, hi: 2 }), S('toast', 9, { text: 'Join us now' }), S('badge', 15.5, { text: 'LIVE' })]);
  D('soc-stream-169', 'Stream overlay 16:9', 'A live badge, a lower third with your name, captions as you talk.', W({ bars: 4, ...still, backdrop: { kind: 'scene' }, thumb: 7 }), [
    S('badge', 0, { text: 'LIVE', cx: -720, cy: -380, w: 90 }), S('lower', 2, { name: 'Maya', role: 'Building Pixel Quest live' }), S('caption', 8, { text: 'today we add the second level', style: 'karaoke', hold: 7 }), S('badge', 15.5, { text: 'LIVE', cx: -720, cy: -380, w: 90 })]);
  D('soc-bts', 'Behind the scenes 9:16', 'Pill captions over your picture: what really happened.', V({ bars: 4, thumb: 8, camera: { strength: 0.15 }, cursor: false }), [
    S('image', 0, { w: 960, h: 1500 }, [focus(5), focus(10)]), S('caption', 4, { text: 'three friends one kitchen table zero sleep', style: 'pill', hold: 8 }), S('image', 15.5, { w: 960, h: 1500 })]);
  D('soc-bug-fixed', 'Bug fixed', 'A toast says fixed, a tick, and thanks to who reported it.', { bars: 2, thumb: 4 }, [
    S('toast', 0, { text: 'The jump bug is fixed', icon: 'check' }), S('check', 2), S('word', 4, { text: 'Thanks for the report, Leo', fs: 110, hi: 4 }), S('toast', 7.6, { text: 'The jump bug is fixed', icon: 'check' })]);
  D('soc-roadmap', 'Roadmap 4:5', 'What is next as a list, then how far along you are.', Q({ bars: 4, cursor: false, thumb: 9 }), [
    S('list', 0, { title: 'Coming next', items: ['Co-op mode', 'Level editor', 'Phone controls'] }), S('ring', 8, { value: 0.6, label: 'of the roadmap done' }), S('list', 15.5, { title: 'Coming next', items: ['Co-op mode', 'Level editor', 'Phone controls'] })]);
  D('soc-jam-recap', 'Jam recap 16:9', 'The countdown, how many games, the top three.', W({ bars: 4, cursor: false, thumb: 9 }), [
    S('count', 0, { from: 3, go: 'Time' }), S('stat', 4, { value: 42, label: 'games made in 48 hours' }), S('list', 9, { title: 'Top three', items: ['Lantern Run', 'Fox and Moon', 'Clock Tower'] }), S('count', 15.5, { from: 3, go: 'Time' })]);
  D('soc-tutorial-intro', 'Tutorial intro 16:9', 'Your wordmark, then a lower third with the episode.', W({ bars: 4, ...still, thumb: 8 }), [
    S('wordmark', 0, { text: 'PIXEL QUEST', hi: 6 }), S('lower', 4, { name: 'Episode 3', role: 'Adding a shop with Flint' }), S('wordmark', 15.5, { text: 'PIXEL QUEST', hi: 6 })]);
  D('soc-collab', 'Collab announcement', 'Two names on two beats, then together.', { bars: 2, ...still, thumb: 6.5 }, [
    S('word', 0, { text: 'Pixel Quest', fs: 140 }), S('word', 1.5, { text: '×', fs: 220, hi: 0 }), S('word', 3, { text: 'The Night Owls', fs: 140 }), S('word', 4.5, { text: 'A soundtrack, together', fs: 110, hi: 1 }), S('word', 7.6, { text: 'Pixel Quest', fs: 140 })]);
  D('soc-thread-opener', 'Thread opener for X 16:9', 'A hook, three points, then "a thread".', W({ bars: 4, ...still, thumb: 9 }), [
    S('word', 0, { text: 'How we shipped in 48 hours', fs: 120, hi: 3 }), S('list', 4, { items: ['One shared chat', 'Everyone brought their AI', 'Nothing merged without a yes'] }), S('badge', 12, { text: 'A THREAD', live: false, icon: 'chat', w: 380 }), S('word', 15.5, { text: 'How we shipped in 48 hours', fs: 120, hi: 3 })]);
  D('soc-countdown-169', 'Trailer title 16:9', 'A countdown, your wordmark, an end card: a game trailer opener.', W({ bars: 4, theme: 'ink', cursor: false, thumb: 8 }), [
    S('count', 0, { from: 3 }), S('wordmark', 4, { text: 'LANTERN RUN', hi: 0 }), S('endcard', 10, { title: 'Lantern Run', cta: 'Coming to your browser', mark: 'flame' }), S('count', 15.5, { from: 3 })]);
  D('soc-carousel-steps', 'Carousel: three tips 4:5', 'Three tip cards, swiped by the cursor, ending on a follow card.', Q({ bars: 4, thumb: 5 }), [
    S('card', 0, { icon: 'sparkle', title: '1. Start from a template', body: 'There are dozens. Pick the closest and change it.' }, [click(3, 220, 140)]), S('card', 4, { icon: 'tribe', title: '2. Invite one friend', body: 'Two people finish more than one.' }, [click(7, 220, 140)]),
    S('card', 8, { icon: 'check', title: '3. Ship something small', body: 'A first version beats a perfect plan.' }, [click(11, 220, 140)]), S('endcard', 12, { title: 'Save this for later', cta: '@yourhandle', mark: 'star' }), S('card', 15.5, { icon: 'sparkle', title: '1. Start from a template', body: 'There are dozens. Pick the closest and change it.' })]);
  D('soc-linkedin-update', 'Team update 4:5', 'A quiet, readable update for LinkedIn: badge, three lines, a stat.', Q({ bars: 4, theme: 'paper', cursor: false, thumb: 9 }), [
    S('badge', 0, { text: 'TEAM UPDATE', live: false, icon: 'tribe', w: 420 }), S('list', 2, { title: 'This month', items: ['Shipped the phone app', 'Two new teammates', 'First 1,000 players'] }), S('stat', 10, { value: 1000, label: 'players and counting' }), S('badge', 15.5, { text: 'TEAM UPDATE', live: false, icon: 'tribe', w: 420 })]);
  D('soc-checkout-demo', 'Shop demo 9:16', 'A buy button, a spinner, a tick and a receipt: show your shop works.', V({ bars: 4, thumb: 9 }), [
    S('button', 0, { text: 'Buy the poster', icon: 'cart' }, [click(2, 20, 0)]), S('loader', 3), S('check', 5), S('card', 7, { icon: 'cart', title: 'Order placed', body: 'A receipt is on its way. This is the example data from your app.' }), S('button', 15.5, { text: 'Buy the poster', icon: 'cart' })]);
  D('soc-onboarding-916', 'Onboarding peek 9:16', 'Three onboarding cards in a row, tapped through.', V({ bars: 4, thumb: 5 }), [
    S('card', 0, { icon: 'sparkle', title: 'Welcome', body: 'Pick a habit to start with.' }, [click(3, 220, 140)]), S('card', 4, { icon: 'bell', title: 'Reminders', body: 'We will nudge you once a day.' }, [click(7, 220, 140)]), S('card', 8, { icon: 'tribe', title: 'Friends', body: 'Invite someone to keep you honest.' }, [click(11, 220, 140)]), S('button', 12, { text: 'Start', icon: 'arrow' }, [click(14, 0, 0)]), S('card', 15.5, { icon: 'sparkle', title: 'Welcome', body: 'Pick a habit to start with.' })]);
  D('soc-ask-flint', 'Ask Flint 16:9', 'A typed request in ⌘K, a loader, the result as a toast.', W({ bars: 2, thumb: 6 }), [
    S('cmdk', 0, { query: 'add a jump sound', items: ['Add a jump sound', 'Add music', 'Add a coin sound', 'Add a menu'] }, [type(0.5, 2), click(3, 0, -70, { enter: true, soft: true })]), S('loader', 3.5), S('toast', 5, { text: 'Added jump.wav, credited' }), S('cmdk', 7.6, { query: 'add a jump sound', items: ['Add a jump sound', 'Add music', 'Add a coin sound', 'Add a menu'] })]);
  D('soc-stat-donut', 'Who plays where', 'A donut sweeps in, then the takeaway.', { bars: 2, cursor: false, thumb: 2.5 }, [
    S('donut', 0, { label: 'play on their phone' }), S('word', 4, { text: 'So we made it phone first', fs: 110, hi: 4 }), S('donut', 7.6, { label: 'play on their phone' })]);
  D('soc-greeting', 'Holiday greeting 4:5', 'A warm line, your mark, and a short wish.', Q({ bars: 2, theme: 'paper', ...still, thumb: 5 }), [
    S('logo', 0, { mark: 'star', text: 'Pixel Quest' }), S('word', 3, { text: 'Happy holidays from all of us', fs: 100, w: 960, hi: 1 }), S('logo', 7.6, { mark: 'star', text: 'Pixel Quest' })]);

  // ---------- share clips: made from a project by "Share a clip" ----------
  K.addCat('share', 'Share clips');
  const endState = (o, at) => o.end === false ? [] : [S('endcard', at, { title: o.title || 'Made with TribeCode', cta: o.cta || 'Remix it at tribecode.org' })];
  const hook = (o, d) => o.hook || d;
  const SH = (id, name, about, base, fn) => K.define(id, 'share', name, about, base, fn);
  for (const [a, sfx, ph] of [['9:16', '916', { w: 520, h: 1060, r: 80 }], ['1:1', '11', {}], ['16:9', '169', { w: 380, h: 780 }]]) {
    SH('share-app-' + sfx, `My app ${a}`, 'Your app screens in a phone, swiped by the cursor, with an end card.', { aspect: a, bars: 4, thumb: 3, camera: { strength: 0.2 } }, o => {
      const n = Math.max(1, (o.screens || []).length || 3), last = o.end === false ? 15.5 : 12, taps = []; for (let i = 1; i < Math.min(n, 4); i++) taps.push(click(i * 3, 0, 200));
      return [S('word', 0, { text: hook(o, 'Made this with friends'), fs: a === '16:9' ? 120 : 110, w: a === '9:16' ? 900 : 1100, hi: 3 }), S('phone', 2, { screens: o.screens || [], ...ph }, taps), ...endState(o, last), S('word', 15.5, { text: hook(o, 'Made this with friends'), fs: a === '16:9' ? 120 : 110, w: a === '9:16' ? 900 : 1100, hi: 3 })];
    });
    SH('share-site-' + sfx, `My website ${a}`, 'Your website with the camera moving over it, with an end card.', { aspect: a, bars: 4, thumb: 5, camera: { strength: 0.1 }, cursor: false }, o => {
      const im = (o.images || [])[0] || '', w = a === '9:16' ? 960 : a === '16:9' ? 1600 : 1240, h = a === '9:16' ? 1500 : a === '16:9' ? 900 : 1000;
      return [S('word', 0, { text: hook(o, 'Our new website'), fs: 120, w: a === '9:16' ? 900 : 1200, hi: 2 }), S('image', 2, { src: im, w, h }, [focus(5), focus(8)]), ...endState(o, 12), S('word', 15.5, { text: hook(o, 'Our new website'), fs: 120, w: a === '9:16' ? 900 : 1200, hi: 2 })];
    });
    SH('share-timelapse-' + sfx, `Timelapse ${a}`, 'Your project\'s screenshots, oldest to newest, one per beat, then the end card.', { aspect: a, bars: 4, thumb: 6, camera: { strength: 0 }, cursor: false }, o => {
      const ims = (o.images || []).slice(-10), w = a === '9:16' ? 960 : a === '16:9' ? 1600 : 1240, h = a === '9:16' ? 1500 : a === '16:9' ? 900 : 1000, list = ims.length ? ims : ['', '', ''];
      const span = o.end === false ? 14 : 10, per = Math.max(0.5, span / list.length), out = [S('badge', 0, { text: o.badge || 'FROM IDEA TO NOW', live: false, icon: 'clock', w: 520 })];
      list.forEach((src, i) => out.push(S('image', 1.5 + i * per, { src, w, h, regions: [{ x: 0, y: 0, z: 1 }] })));
      return out.concat(endState(o, 12), [S('badge', 15.5, { text: o.badge || 'FROM IDEA TO NOW', live: false, icon: 'clock', w: 520 })]);
    });
  }
  return K;
});
