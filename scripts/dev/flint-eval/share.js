// Flint and Share a clip (app/ui/shareclip.js): a short video of the project for X, TikTok, Instagram or YouTube, and
// a timelapse of its screenshots. Used by scripts/dev/flint-eval-cases.js as v:'sc'. [ctx, text, intent, slots?]
module.exports = [
  ['g', 'make a clip for tiktok', 'share.clip', { platform: 'tiktok' }], ['g', 'make a clip for x', 'share.clip', { platform: 'x' }], ['g', 'make a video for instagram', 'share.clip', { platform: 'instagram' }],
  ['g', 'make a clip for twitter', 'share.clip', { platform: 'x' }], ['g', 'make a short clip for reels', 'share.clip', { platform: 'tiktok' }], ['g', 'make a quick video for youtube', 'share.clip', { platform: 'x' }],
  ['g', 'share this', 'share.clip'], ['g', 'share it', 'share.clip'], ['g', 'share a clip', 'share.clip'], ['g', 'share a clip of my app', 'share.clip'],
  ['g', 'share my app on tiktok', 'share.clip', { platform: 'tiktok' }], ['g', 'share my game on x', 'share.clip', { platform: 'x' }], ['g', 'post our game on instagram', 'share.clip', { platform: 'instagram' }],
  ['g', 'share the project on social media', 'share.clip'], ['g', 'show off my site on linkedin', 'share.clip', { platform: 'x' }],
  ['g', 'make a clip of my app', 'share.clip'], ['g', 'make a video of our game for instagram', 'share.clip', { platform: 'instagram' }], ['g', 'make a clip of the changes', 'share.clip'],
  ['g', 'make a reel of my app', 'share.clip'], ['g', 'make a post about our game for x', 'share.clip', { platform: 'x' }], ['g', 'record a clip of this', 'share.clip'],
  ['g', 'make a clip from my website', 'share.clip'], ['g', 'cut a short video of the progress for tiktok', 'share.clip', { platform: 'tiktok' }],
  ['g', 'make a timelapse', 'share.timelapse'], ['g', 'make a timelapse of the project', 'share.timelapse'], ['g', 'timelapse', 'share.timelapse'], ['g', 'make a time lapse video', 'share.timelapse'],
  ['g', 'show me a timelapse of how it grew', 'share.timelapse'], ['g', 'make a timelapse of my game for tiktok', 'share.timelapse'], ['g', 'create a time-lapse of our app', 'share.timelapse'],
  ['g', 'timelapse of the build', 'share.timelapse'],
];
