// The emoji picker (feat/chat2): one picker for reactions ("More reactions" on a message) and the composer's emoji
// button. A search box (focused on open; matches names and keywords), category tabs, "Frequently used" first (per
// person, kept in this browser), a skin tone choice, a preview line with the hovered emoji's name, and the keyboard:
// arrows move, Enter picks, Esc closes. About 360x380 next to what opened it on desktop; a bottom sheet on phones.
// TribeEmoji.open({ anchor, onPick(emoji), selected: [emoji], title })
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FREQ = 'tribecode.emojiFreq.v1', TONE = 'tribecode.emojiTone.v1';
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  // emoji|name and keywords; a trailing * means it takes a skin tone
  const CATS = [
    ['smileys', '😀', 'Smileys', `😀|grinning smile happy;😃|smiley happy joy;😄|smile laugh;😁|grin beaming;😆|laughing lol;😅|sweat smile phew;🤣|rofl rolling laughing;😂|joy tears laughing lol;🙂|slight smile;🙃|upside down silly;😉|wink;😊|blush happy;😇|innocent halo angel;🥰|love hearts adore;😍|heart eyes love;🤩|star struck wow;😘|kiss blow;😋|yum tasty;😛|tongue;😜|wink tongue crazy;🤪|zany wild;🤗|hug hugging;🤭|oops giggle;🤫|shush quiet secret;🤔|thinking hmm;🤐|zipper mouth;🤨|raised eyebrow skeptical;😐|neutral meh;😑|expressionless;😶|no mouth speechless;😏|smirk;😒|unamused;🙄|eye roll;😬|grimace awkward;😌|relieved calm;😔|pensive sad;😪|sleepy;😴|sleeping zzz tired;😷|mask sick;🤒|thermometer ill;🤕|bandage hurt;🤢|nauseated;🤮|vomit sick;🥵|hot heat;🥶|cold freezing;🥴|woozy dizzy;😵|dizzy knocked out;🤯|mind blown exploding head;🤠|cowboy yeehaw;🥳|party celebrate birthday;😎|cool sunglasses;🤓|nerd geek;🧐|monocle inspect;😕|confused;😟|worried;🙁|frown;😮|open mouth wow surprised;😯|hushed;😲|astonished shocked;😳|flushed embarrassed;🥺|pleading puppy eyes please;😦|frowning;😧|anguished;😨|fearful scared;😰|anxious sweat;😥|sad relieved;😢|cry sad tear;😭|sob crying;😱|scream fear;😖|confounded;😣|persevere;😞|disappointed;😓|downcast sweat;😩|weary;😫|tired;🥱|yawn bored;😤|triumph huff;😡|rage angry mad;😠|angry;🤬|cursing swearing;😈|devil smiling;💀|skull dead lol;💩|poop;🤡|clown;👻|ghost boo;👽|alien;🤖|robot bot;😺|cat smile;🙈|see no evil monkey;🙉|hear no evil;🙊|speak no evil`],
    ['people', '👋', 'People', `👋|wave hello hi bye*;🤚|raised back hand*;✋|raised hand stop high five*;🖖|vulcan*;👌|ok perfect*;🤌|pinched fingers*;🤏|pinch small*;✌️|victory peace*;🤞|crossed fingers luck*;🤟|love you*;🤘|rock on horns*;🤙|call me shaka*;👈|point left*;👉|point right*;👆|point up*;👇|point down*;☝️|index up*;👍|thumbs up yes like +1 approve*;👎|thumbs down no dislike -1*;✊|fist*;👊|punch fist bump*;🤛|left fist*;🤜|right fist*;👏|clap applause*;🙌|raised hands hooray celebrate*;👐|open hands*;🤲|palms up*;🤝|handshake deal agree;🙏|pray please thanks thank you*;✍️|writing*;💅|nail polish*;💪|muscle strong flex*;🧠|brain smart think;👀|eyes look watching see;👁️|eye;👅|tongue;👄|mouth lips;👶|baby*;🧒|child kid*;🧑|person*;👩|woman*;👨|man*;🧓|older person*;🧑‍💻|technologist coder developer programmer laptop*;🧑‍🎨|artist painter*;🧑‍🔬|scientist*;🧑‍🚀|astronaut*;🧑‍🍳|cook chef*;🦸|superhero*;🧙|mage wizard*;🥷|ninja*;🙋|raising hand question*;🤷|shrug idk*;🤦|facepalm*;🙇|bow sorry*;💃|dance*;🕺|dancing man*;🏃|run running*;🚶|walk*;👯|bunny dancers party`],
    ['nature', '🐻', 'Animals & nature', `🐶|dog puppy;🐱|cat kitten;🐭|mouse;🐹|hamster;🐰|rabbit bunny;🦊|fox;🐻|bear;🐼|panda;🐨|koala;🐯|tiger;🦁|lion;🐮|cow;🐷|pig;🐸|frog;🐵|monkey;🐔|chicken;🐧|penguin;🐦|bird;🦆|duck;🦉|owl;🦇|bat;🐺|wolf;🐗|boar;🐴|horse;🦄|unicorn magic;🐝|bee honey;🐛|bug caterpillar;🦋|butterfly;🐌|snail slow;🐞|ladybug;🐜|ant;🕷️|spider;🐢|turtle slow;🐍|snake python;🦎|lizard;🐙|octopus;🦑|squid;🦀|crab rust;🐠|fish tropical;🐬|dolphin;🐳|whale docker;🦈|shark;🐊|crocodile;🦖|t-rex dinosaur;🐉|dragon;🌵|cactus;🎄|tree christmas;🌲|evergreen tree;🌳|tree;🌴|palm;🌱|seedling sprout grow;🌿|herb;🍀|four leaf clover luck;🍁|maple leaf autumn;🍄|mushroom;🌷|tulip flower;🌹|rose;🌻|sunflower;🌸|cherry blossom;💐|bouquet;🌍|earth globe world;🌙|moon night;⭐|star;🌟|glowing star;✨|sparkles magic shiny new;⚡|lightning zap fast;🔥|fire lit hot;💥|boom collision;☀️|sun sunny;🌤️|sun cloud;☁️|cloud;🌧️|rain;⛈️|storm thunder;❄️|snow snowflake cold;🌈|rainbow;🌊|wave ocean water;💧|droplet water`],
    ['food', '🍕', 'Food & drink', `🍎|apple red;🍐|pear;🍊|orange tangerine;🍋|lemon;🍌|banana;🍉|watermelon;🍇|grapes;🍓|strawberry;🍒|cherries;🍑|peach;🥭|mango;🍍|pineapple;🥥|coconut;🥝|kiwi;🍅|tomato;🥑|avocado;🥦|broccoli;🌽|corn;🥕|carrot;🥔|potato;🍞|bread;🥐|croissant;🥨|pretzel;🧀|cheese;🥚|egg;🍳|cooking fried egg;🥞|pancakes;🧇|waffle;🥓|bacon;🍔|burger hamburger;🍟|fries;🍕|pizza;🌭|hot dog;🥪|sandwich;🌮|taco;🌯|burrito;🥗|salad;🍝|spaghetti pasta;🍜|ramen noodles;🍣|sushi;🍱|bento;🍤|shrimp;🍙|rice ball;🍚|rice;🍦|ice cream;🍩|donut doughnut;🍪|cookie;🎂|birthday cake;🍰|cake shortcake;🧁|cupcake;🍫|chocolate;🍬|candy;🍭|lollipop;🍿|popcorn;☕|coffee tea hot;🍵|tea matcha;🧃|juice box;🥤|soda cup;🧋|bubble tea boba;🍺|beer;🍻|cheers beers;🥂|toast champagne;🍷|wine;🍸|cocktail;🧊|ice`],
    ['activity', '🎮', 'Activities', `⚽|soccer football;🏀|basketball;🏈|american football;⚾|baseball;🎾|tennis;🏐|volleyball;🎱|8 ball pool;🏓|ping pong;🥅|goal net;⛳|golf;🏹|bow arrow;🎣|fishing;🥊|boxing;🎽|running shirt;🛹|skateboard;⛸️|ice skate;🎿|ski;🏆|trophy win champion;🥇|gold medal first;🥈|silver medal second;🥉|bronze medal third;🏅|medal;🎖️|military medal;🎗️|ribbon;🎫|ticket;🎟️|admission tickets;🎪|circus tent;🎭|theater;🎨|art palette paint design;🎬|clapper film movie;🎤|microphone sing karaoke;🎧|headphones music;🎼|score music;🎹|piano keys;🥁|drum;🎷|saxophone;🎺|trumpet;🎸|guitar;🎻|violin;🎲|dice game;♟️|chess pawn;🎯|direct hit target bullseye;🎳|bowling;🎮|video game controller gaming;🕹️|joystick arcade;🧩|puzzle piece;🎰|slot machine;🎉|tada party celebrate hooray;🎊|confetti;🎈|balloon;🎁|gift present;🪄|magic wand`],
    ['travel', '🚀', 'Travel & places', `🚀|rocket launch ship deploy fast;🛸|ufo;✈️|airplane flight;🚁|helicopter;🚂|train locomotive;🚄|bullet train fast;🚗|car;🚕|taxi;🚌|bus;🏎️|race car fast;🚓|police car;🚑|ambulance;🚒|fire engine;🚲|bicycle bike;🛴|scooter;⛵|sailboat;🚢|ship;⚓|anchor;🗺️|map;🧭|compass;🏔️|mountain snow;⛰️|mountain;🌋|volcano;🏕️|camping campfire tent;🏖️|beach;🏝️|island;🏜️|desert;🏠|house home;🏡|home garden;🏢|office building;🏰|castle;🗼|tower;🗽|statue of liberty;⛲|fountain;🎡|ferris wheel;🎢|roller coaster;🌃|night city;🌅|sunrise;🌇|sunset city;🌌|milky way galaxy space;🚧|construction wip work in progress;🚦|traffic light;🛑|stop sign;⛽|fuel gas`],
    ['objects', '💡', 'Objects', `💡|bulb idea light;🔦|flashlight;🕯️|candle;💻|laptop computer;🖥️|desktop computer monitor;⌨️|keyboard;🖱️|mouse computer;🖨️|printer;📱|phone mobile;☎️|telephone;📷|camera;📸|camera flash photo;🎥|movie camera;📺|tv television;📻|radio;🔋|battery;🔌|plug;💾|floppy disk save;💿|cd disc;📀|dvd;🧮|abacus;📡|satellite antenna;🔭|telescope;🔬|microscope;🧪|test tube experiment lab;🧬|dna;💊|pill;🩹|bandage fix;🔧|wrench fix tool;🔨|hammer build;🛠️|tools hammer wrench;⚙️|gear settings cog;🔩|nut bolt;🧲|magnet;⛓️|chains;🧰|toolbox;🔒|lock locked secure;🔓|unlocked;🔑|key;🗝️|old key;🚪|door;🧹|broom clean;🧼|soap;🛒|cart shopping;💰|money bag;💵|dollar money;💳|credit card;💎|gem diamond;⏰|alarm clock;⏳|hourglass waiting;⌛|hourglass done;📅|calendar date;📆|tear-off calendar;📌|pushpin pin;📍|round pin location;📎|paperclip attach;✂️|scissors cut;📝|memo note write;✏️|pencil edit;🖊️|pen;📖|book open read;📚|books library docs;📒|ledger notebook;📄|page document;📋|clipboard;📊|bar chart stats;📈|chart up growth trending;📉|chart down;🗂️|dividers files;📁|folder;📦|package box ship;📬|mailbox;✉️|envelope mail email;📣|megaphone announce;📢|loudspeaker;🔔|bell notification;🔕|bell off mute;🏷️|label tag;🔖|bookmark;🧾|receipt;🗑️|wastebasket trash delete`],
    ['symbols', '❤️', 'Symbols', `❤️|red heart love;🧡|orange heart;💛|yellow heart;💚|green heart;💙|blue heart;💜|purple heart;🖤|black heart;🤍|white heart;🤎|brown heart;💔|broken heart;❣️|heart exclamation;💕|two hearts;💞|revolving hearts;💓|beating heart;💗|growing heart;💖|sparkling heart;💘|cupid;💯|100 hundred perfect;💢|anger;💬|speech bubble chat comment;💭|thought bubble;🗯️|anger bubble;💤|zzz sleep;✅|check done yes ok approve;☑️|check box;✔️|check mark;❌|x cross no wrong;❎|cross mark button;➕|plus add;➖|minus;➗|divide;✖️|multiply;❓|question;❔|white question;❗|exclamation important;‼️|double exclamation;⚠️|warning caution;🚫|prohibited no;⛔|no entry;🔴|red circle;🟠|orange circle;🟡|yellow circle;🟢|green circle;🔵|blue circle;🟣|purple circle;⚫|black circle;⚪|white circle;🟥|red square;🟩|green square;🟦|blue square;🔶|orange diamond;🔷|blue diamond;🔺|red triangle up;🔻|red triangle down;♻️|recycle;🔁|repeat loop;🔄|refresh sync;▶️|play;⏸️|pause;⏹️|stop;⏩|fast forward;⏪|rewind;🔀|shuffle;⬆️|up arrow;⬇️|down arrow;⬅️|left arrow;➡️|right arrow;↩️|return back;🆕|new;🆗|ok button;🆒|cool;🆙|up;🆘|sos help;ℹ️|info information;🔝|top;🔜|soon;🏁|checkered flag finish done;🚩|red flag;🏳️|white flag;🏴‍☠️|pirate flag`],
  ].map(([id, icon, label, raw]) => ({ id, icon, label, items: raw.split(';').map(x => { const [e, rest] = x.split('|'); const tone = /\*$/.test(rest); return { e, n: rest.replace(/\*$/, ''), tone }; }) }));
  const ALL = CATS.flatMap(c => c.items.map(i => ({ ...i, cat: c.id })));
  const byE = new Map(ALL.map(i => [i.e, i]));
  const TONES = [['', '✋', 'Default'], ['\u{1F3FB}', '✋🏻', 'Light'], ['\u{1F3FC}', '✋🏼', 'Medium-light'], ['\u{1F3FD}', '✋🏽', 'Medium'], ['\u{1F3FE}', '✋🏾', 'Medium-dark'], ['\u{1F3FF}', '✋🏿', 'Dark']];
  const DEFAULT_FREQ = ['👍', '❤️', '😂', '🎉', '👀', '✅', '🔥', '🙏', '🚀', '💯', '😮', '🤔'];
  // a skin tone goes after the first code point (and replaces a variation selector right after it)
  const withTone = (it, tone) => { if (!tone || !it.tone) return it.e; const cps = [...it.e]; const rest = cps.slice(1).filter((c, i) => !(i === 0 && c === '️')); return cps[0] + tone + rest.join(''); };
  const baseOf = e => String(e).replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');
  const nameOf = e => (byE.get(e) || byE.get(baseOf(e)) || byE.get(baseOf(e) + '️') || { n: '' }).n.split(' ').slice(0, 3).join(' ');
  function freq() { const f = ls.get(FREQ, {}); const top = Object.entries(f && typeof f === 'object' ? f : {}).sort((a, b) => b[1] - a[1]).map(x => x[0]).filter(e => typeof e === 'string' && e.length < 20); return [...new Set([...top, ...DEFAULT_FREQ])].slice(0, 16); }
  function used(e) { const f = ls.get(FREQ, {}) || {}; const k = baseOf(e) === e ? e : e; f[k] = (Number(f[k]) || 0) + 1; const keep = Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, 40); ls.set(FREQ, Object.fromEntries(keep)); }

  let el = null, opts = null, tone = ls.get(TONE, '') || '', focusI = 0, items = [];
  const phone = () => matchMedia('(max-width: 820px)').matches;
  function close() { if (el) { el.remove(); el = null; } const s = $('#ep-scrim'); if (s) s.remove(); if (opts && opts.onClose) try { opts.onClose(); } catch {} opts = null; }
  function cell(e, i) {
    const sel = opts.selected && opts.selected.includes(e);
    return `<button type="button" class="ep-c ${sel ? 'on' : ''}" data-e="${esc(e)}" data-i="${i}" tabindex="-1" aria-label="${esc(nameOf(e) || e)}" title="${esc(nameOf(e) || e)}">${esc(e)}</button>`;
  }
  function draw() {
    const q = el.querySelector('.ep-q').value.trim().toLowerCase();
    const body = el.querySelector('.ep-body'); let i = 0; items = [];
    const add = list => list.map(e => { items.push(e); return cell(e, i++); }).join('');
    if (q) {
      const words = q.split(/\s+/);
      const hits = ALL.filter(it => words.every(w => it.n.split(' ').some(k => k.startsWith(w)) || it.n.includes(w))).map(it => withTone(it, tone));
      body.innerHTML = hits.length ? `<div class="ep-sec" data-sec="search"><div class="ep-h">Results</div><div class="ep-grid">${add(hits.slice(0, 160))}</div></div>` : `<p class="ep-none">No emoji for “${esc(q)}”</p>`;
    } else {
      body.innerHTML = `<div class="ep-sec" data-sec="freq"><div class="ep-h">Frequently used</div><div class="ep-grid">${add(freq().map(e => { const it = byE.get(e); return it ? withTone(it, tone) : e; }))}</div></div>`
        + CATS.map(c => `<div class="ep-sec" data-sec="${c.id}"><div class="ep-h">${esc(c.label)}</div><div class="ep-grid">${add(c.items.map(it => withTone(it, tone)))}</div></div>`).join('');
    }
    focusI = Math.min(focusI, Math.max(0, items.length - 1)); mark();
  }
  function mark(scroll) {
    el.querySelectorAll('.ep-c.kb').forEach(b => b.classList.remove('kb'));
    const b = el.querySelector(`.ep-c[data-i="${focusI}"]`); if (!b) return preview(null);
    b.classList.add('kb'); preview(b.dataset.e);
    if (scroll) b.scrollIntoView({ block: 'nearest' });
    const sec = b.closest('.ep-sec'); if (sec) el.querySelectorAll('.ep-tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.cat === sec.dataset.sec)));
  }
  function preview(e) { const p = el.querySelector('.ep-pv'); p.innerHTML = e ? `<span class="ep-pv-e">${esc(e)}</span><span class="ep-pv-n">${esc(nameOf(e) || 'emoji')}</span>` : '<span class="ep-pv-n">Pick an emoji</span>'; }
  function pick(e) { if (!e || !opts) return; used(e); const fn = opts.onPick, keep = opts.keepOpen; if (!keep) close(); try { fn(e); } catch (err) { console.error(err); } }
  function cols() { const g = el.querySelector('.ep-grid'); if (!g) return 8; return Math.max(1, getComputedStyle(g).gridTemplateColumns.split(' ').length); }

  function open(o) {
    close(); opts = o || {};
    el = document.createElement('div'); el.id = 'emoji-pick'; el.className = 'ep'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', opts.title || 'Pick an emoji');
    el.innerHTML = `<div class="ep-top"><input class="input ep-q" type="search" placeholder="Search emoji" aria-label="Search emoji" autocomplete="off" spellcheck="false">
        <button type="button" class="ep-tone" aria-label="Skin tone" aria-haspopup="true" title="Skin tone">${esc(TONES.find(t => t[0] === tone)[1])}</button></div>
      <div class="ep-tones hidden" role="radiogroup" aria-label="Skin tone">${TONES.map(t => `<button type="button" role="radio" data-tone="${t[0]}" aria-checked="${t[0] === tone}" aria-label="${t[2]}" title="${t[2]}">${t[1]}</button>`).join('')}</div>
      <div class="ep-tabs" role="tablist"><button type="button" role="tab" class="ep-tab" data-cat="freq" aria-label="Frequently used" title="Frequently used">🕘</button>${CATS.map(c => `<button type="button" role="tab" class="ep-tab" data-cat="${c.id}" aria-label="${esc(c.label)}" title="${esc(c.label)}">${c.icon}</button>`).join('')}</div>
      <div class="ep-body" role="listbox" aria-label="Emoji"></div>
      <div class="ep-pv" aria-live="polite"></div>`;
    if (phone()) { const s = document.createElement('div'); s.id = 'ep-scrim'; s.className = 'ep-scrim'; s.onclick = close; document.body.appendChild(s); el.classList.add('sheet'); }
    document.body.appendChild(el);
    focusI = 0; draw();
    if (!phone() && opts.anchor) {
      const r = opts.anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
      let top = r.bottom + 6; if (top + h > innerHeight - 8) top = r.top - h - 6;
      el.style.top = Math.max(8, Math.min(innerHeight - h - 8, top)) + 'px';
      el.style.left = Math.max(8, Math.min(innerWidth - w - 8, opts.align === 'left' ? r.left : r.right - w)) + 'px';
    }
    const q = el.querySelector('.ep-q');
    q.addEventListener('input', () => { focusI = 0; draw(); el.querySelector('.ep-body').scrollTop = 0; });
    el.addEventListener('click', e => {
      const c = e.target.closest('.ep-c'); if (c) { e.stopPropagation(); return pick(c.dataset.e); }
      const tb = e.target.closest('.ep-tab'); if (tb) { q.value = ''; draw(); const s = el.querySelector(`.ep-sec[data-sec="${tb.dataset.cat}"]`); if (s) { el.querySelector('.ep-body').scrollTop = s.offsetTop - el.querySelector('.ep-body').offsetTop; const f = s.querySelector('.ep-c'); if (f) { focusI = Number(f.dataset.i); mark(); } } return; }
      if (e.target.closest('.ep-tone')) { el.querySelector('.ep-tones').classList.toggle('hidden'); return; }
      const t = e.target.closest('[data-tone]'); if (t) { tone = t.dataset.tone; ls.set(TONE, tone); el.querySelector('.ep-tone').textContent = TONES.find(x => x[0] === tone)[1]; el.querySelectorAll('[data-tone]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.tone === tone))); el.querySelector('.ep-tones').classList.add('hidden'); draw(); q.focus(); }
    });
    el.addEventListener('mouseover', e => { const c = e.target.closest('.ep-c'); if (c) preview(c.dataset.e); });
    el.addEventListener('mouseleave', () => mark());
    el.addEventListener('keydown', e => {
      const n = items.length; if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const a = opts && opts.anchor; close(); if (a && a.focus) try { a.focus({ preventScroll: true }); } catch {} return; }
      if (!n) return;
      const k = cols(), mv = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: k, ArrowUp: -k }[e.key];
      if (mv !== undefined) { if (e.target === q && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && q.value) return; e.preventDefault(); focusI = Math.max(0, Math.min(n - 1, focusI + mv)); mark(true); return; }
      if (e.key === 'Enter') { e.preventDefault(); pick(items[focusI]); }
    });
    setTimeout(() => q.focus({ preventScroll: true }), 0);
    return el;
  }
  document.addEventListener('mousedown', e => { if (el && !(e.target.closest && (e.target.closest('#emoji-pick') || (opts && opts.anchor && opts.anchor.contains(e.target))))) close(); }, true);
  addEventListener('resize', () => { if (el && !phone()) close(); });

  window.TribeEmoji = { open, close, isOpen: () => !!el, nameOf, freq, used, CATS };
})();
