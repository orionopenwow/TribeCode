// Publish for real: the shared core (feat/publish-real, docs/PUBLISH.md). One file used by the browser (publish.js, and
// a phone-only tribe with its own GitHub token) and by the server (server/publishreal.js requires it), so there is one
// implementation of: what kind of thing a project is, the pre-flight check, the files that make a page installable, the
// itch.io rules, the app-wrapper workflows, and the GitHub Pages upload.
//
// A "bundle" is a list of { path, text? | b64? , size }: the web folder as it will be published.
// Public (window.TribePubCore / module.exports):
//   kindOf(bundle)                      -> 'site' | 'game' | 'app'
//   preflight(bundle, meta)             -> [{ id, ok, auto, label, why }]
//   finish(bundle, meta)                -> bundle with a title, description, phone viewport and (meta.pwa) the install files
//   pwaFiles(meta)                      -> [{ path, text }]            manifest.webmanifest + sw.js (+ icon.svg)
//   itch(bundle)                        -> { ok, problems: [..], files, bytes }
//   wrapperFiles(kind, meta)            -> [{ path, text }]            'android' | 'ios'  (GitHub workflow + config)
//   assetLinks(pkg, fingerprints)       -> text
//   pagesPublish(opts)                  -> { repo, url, commit, pagesEnabled, settingsUrl, created }
//   slug(s), pkgId(login, slug)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TribePubCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'app';
  const pkgId = (login, sl) => `io.github.${String(login || 'me').toLowerCase().replace(/[^a-z0-9]/g, '') || 'me'}.${String(sl || 'app').replace(/[^a-z0-9]/g, '').replace(/^\d+/, '') || 'app'}`.slice(0, 80);
  const escA = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const textOf = f => (f && typeof f.text === 'string' ? f.text : '');
  const find = (bundle, p) => bundle.find(f => f.path === p);
  const HEX = /^#[0-9a-fA-F]{6}$/;

  // ---------- what is it? ----------
  function kindOf(bundle) {
    const idx = textOf(find(bundle, 'index.html'));
    const code = idx + '\n' + bundle.filter(f => /\.(m?js)$/i.test(f.path) && f.size < 400000).slice(0, 12).map(textOf).join('\n').slice(0, 600000);
    const game = /<canvas\b/i.test(idx) || /\b(THREE\.|new\s+Phaser\.|PIXI\.|kaboom\(|kaplay\(|requestAnimationFrame)\b/.test(code) && /getContext\(|WebGLRenderer|Phaser|PIXI|kaplay|kaboom/.test(code);
    if (game) return 'game';
    const app = !!find(bundle, 'manifest.webmanifest') || !!find(bundle, 'manifest.json') || /serviceWorker\.register|localStorage\.(set|get)Item|indexedDB\.open/.test(code) || /<(input|select|textarea)\b/i.test(idx) && /addEventListener\(/.test(code);
    return app ? 'app' : 'site';
  }

  // ---------- the pre-flight check ----------
  // `auto: true` means Publish fills it in for you (from the title and line you type), so it never blocks.
  function localRefs(html) {
    const out = [], re = /\b(?:src|href)\s*=\s*["']([^"'#?]+)(?:[?#][^"']*)?["']/gi; let m;
    while ((m = re.exec(html))) { const u = m[1].trim(); if (!u || /^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|mailto:|tel:)/i.test(u) || u.startsWith('{')) continue; out.push(u.replace(/^\.\//, '').replace(/^\//, '')); }
    return out;
  }
  function preflight(bundle, meta = {}) {
    const idx = find(bundle, 'index.html'), html = textOf(idx), kind = meta.kind || kindOf(bundle), out = [];
    const fill = (t, v) => String(t).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : ''));
    // why: the English sentence. whyKey + vars: the same sentence as a template, so the screen can show it in any language.
    const add = (id, ok, label, why, auto, vars) => out.push(ok ? { id, ok: true, auto: false, label, why: '' } : vars ? { id, ok: false, auto: !!auto, label, why: fill(why, vars), whyKey: why, vars } : { id, ok: false, auto: !!auto, label, why });
    add('index', !!idx, 'Has a first page', 'There is no index.html at the top of the web folder. Build a first version first.');
    if (!idx) return out;
    const paths = new Set(bundle.map(f => f.path));
    const missing = localRefs(html).filter(u => !/\/$/.test(u) && !paths.has(decodeURI(u)));
    add('loads', !missing.length, 'Every file the page asks for is there', missing.length === 1 ? 'The first page points at a file that is not in the folder: {files}. It may open with parts missing.' : 'The first page points at {n} files that are not in the folder: {files}. It may open with parts missing.', false, { n: missing.length, files: missing.slice(0, 3).join(', ') + (missing.length > 3 ? '…' : '') });
    add('name', /<title>\s*[^<\s][^<]*<\/title>/i.test(html), 'Has a name', 'No title on the page. Your title is added for you.', true);
    add('desc', /<meta[^>]+name=["']description["'][^>]*content=["'][^"']{8,}/i.test(html) || /<meta[^>]+content=["'][^"']{8,}["'][^>]*name=["']description["']/i.test(html), 'Has a one-line description', 'No description for search and share cards. Your one line is added for you.', true);
    add('phone', /<meta[^>]+name=["']viewport["']/i.test(html), 'Fits a phone', 'No phone setting (viewport) on the page. It is added for you.', true);
    const hasIcon = /<link[^>]+rel=["'][^"']*icon/i.test(html) || paths.has('favicon.ico') || paths.has('favicon.svg') || paths.has('icon.svg');
    add('icon', hasIcon, 'Has an icon', 'No icon. One is made for you from the name and color.', true);
    if (kind === 'game') add('canvas', /<canvas\b/i.test(html) || bundle.some(f => /\.(m?js)$/i.test(f.path) && /getContext\(|WebGLRenderer|createElement\(["']canvas/.test(textOf(f))), 'Has a game screen', 'No game canvas found on the first page. Check the game starts from index.html.');
    const bytes = bundle.reduce((n, f) => n + (f.size || 0), 0);
    add('size', bytes < 100 * 1024 * 1024, 'Small enough to load fast', '{mb} MB in all. Compress pictures and sound, or load big files only when needed.', false, { mb: (bytes / 1048576).toFixed(0) });
    return out;
  }

  // ---------- make the bundle complete ----------
  const iconSvg = (name, color) => {
    const c = HEX.test(color || '') ? color : '#F26B1D', ch = (String(name || 'A').trim()[0] || 'A').toUpperCase();
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="${c}"/><text x="256" y="345" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="280" font-weight="700" text-anchor="middle" fill="#fff">${escA(ch)}</text></svg>\n`;
  };
  function swText(version, paths) {
    // Cache the page's own files; show the saved copy first and refresh it in the background; other sites pass through.
    return `// Made by TribeCode: lets this page install on a phone and open with no connection.\n`
      + `const CACHE = 'app-v${String(version || 1).replace(/[^\w.-]/g, '')}';\nconst FILES = ${JSON.stringify(paths)};\n`
      + `self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting())); });\n`
      + `self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });\n`
      + `self.addEventListener('fetch', e => {\n  const u = new URL(e.request.url);\n  if (e.request.method !== 'GET' || u.origin !== location.origin) return;\n`
      + `  e.respondWith(caches.open(CACHE).then(async c => {\n    const hit = await c.match(e.request, { ignoreSearch: true });\n`
      + `    const net = fetch(e.request).then(r => { if (r && r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit || c.match('./index.html'));\n    return hit || net;\n  }));\n});\n`;
  }
  function pwaFiles(meta = {}, bundle = []) {
    const name = String(meta.title || 'My app').slice(0, 60), color = HEX.test(meta.color || '') ? meta.color : '#F26B1D';
    const icons = [];
    if (meta.icons && meta.icons['192']) icons.push({ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' });
    if (meta.icons && meta.icons['512']) icons.push({ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' });
    icons.push({ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' });
    const manifest = { name, short_name: name.slice(0, 12), description: String(meta.desc || '').slice(0, 240), start_url: './', scope: './', display: 'standalone', orientation: meta.kind === 'game' ? 'any' : 'portrait-primary',
      background_color: HEX.test(meta.bg || '') ? meta.bg : '#ffffff', theme_color: color, icons };
    const out = [{ path: 'manifest.webmanifest', text: JSON.stringify(manifest, null, 2) + '\n' }, { path: 'icon.svg', text: iconSvg(name, color) }];
    if (meta.icons) for (const k of ['192', '512']) if (meta.icons[k]) out.push({ path: `icons/icon-${k}.png`, b64: String(meta.icons[k]).replace(/^data:image\/png;base64,/, '') });
    const cached = ['./', 'index.html', ...bundle.filter(f => f.path !== 'index.html' && f.size < 5 * 1024 * 1024 && !/^\.|\/\./.test(f.path)).map(f => f.path), ...out.map(f => f.path)];
    out.push({ path: 'sw.js', text: swText(meta.version || Date.now(), [...new Set(cached)].slice(0, 400)) });
    return out;
  }
  function finish(bundle, meta = {}) {
    const out = bundle.filter(f => !/^\.github\/|^android\/|^desktop\/|^ios-app\//.test(f.path)).map(f => ({ ...f }));
    const idx = find(out, 'index.html'); if (!idx || typeof idx.text !== 'string') return out;
    let h = idx.text; const head = [];
    const paths = new Set(out.map(f => f.path));
    if (!/<meta[^>]+charset/i.test(h)) head.push('<meta charset="utf-8">');
    if (!/<meta[^>]+name=["']viewport["']/i.test(h)) head.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
    if (!/<title>\s*[^<\s][^<]*<\/title>/i.test(h) && meta.title) { h = h.replace(/<title>\s*<\/title>/i, ''); head.push(`<title>${escA(meta.title)}</title>`); }
    if (!/<meta[^>]+name=["']description["']/i.test(h) && meta.desc) head.push(`<meta name="description" content="${escA(meta.desc)}">`);
    const hasIcon = /<link[^>]+rel=["'][^"']*icon/i.test(h) || paths.has('favicon.ico') || paths.has('favicon.svg');
    let extra = [];
    if (meta.pwa && !paths.has('manifest.webmanifest') && !/<link[^>]+rel=["']manifest["']/i.test(h)) {
      extra = pwaFiles(meta, out);
      head.push('<link rel="manifest" href="manifest.webmanifest">', `<meta name="theme-color" content="${escA(HEX.test(meta.color || '') ? meta.color : '#F26B1D')}">`, '<link rel="apple-touch-icon" href="' + (meta.icons && meta.icons['192'] ? 'icons/icon-192.png' : 'icon.svg') + '">');
      if (!hasIcon) head.push('<link rel="icon" href="icon.svg" type="image/svg+xml">');
      const reg = `<script>if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){})})}</script>`;
      h = /<\/body>/i.test(h) ? h.replace(/<\/body>(?![\s\S]*<\/body>)/i, reg + '</body>') : h + reg;
    } else if (!hasIcon && !paths.has('icon.svg')) { extra = [{ path: 'icon.svg', text: iconSvg(meta.title, meta.color) }]; head.push('<link rel="icon" href="icon.svg" type="image/svg+xml">'); }
    else if (!hasIcon) head.push('<link rel="icon" href="icon.svg" type="image/svg+xml">');
    if (head.length) h = /<head[^>]*>/i.test(h) ? h.replace(/<head[^>]*>/i, m => m + head.join('')) : (/<html[^>]*>/i.test(h) ? h.replace(/<html[^>]*>/i, m => m + '<head>' + head.join('') + '</head>') : '<!doctype html><head>' + head.join('') + '</head>' + h);
    idx.text = h; idx.size = h.length;
    for (const f of extra) { const at = out.findIndex(x => x.path === f.path); const g = { ...f, size: (f.text || f.b64 || '').length }; if (at >= 0) out[at] = g; else out.push(g); }
    return out;
  }

  // ---------- a small secrets check, for a tribe with no computer (the computer's own safety check is server/publish.js) ----------
  const SECRETS = [['Anthropic key', /sk-ant-[\w-]{20,}/], ['OpenAI key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/], ['GitHub sign-in', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_\w{30,})/], ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
    ['Stripe live key', /\b[sr]k_live_[A-Za-z0-9]{16,}/], ['Google key', /\bAIza[0-9A-Za-z_-]{35}\b/], ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/]];
  function secrets(bundle) {
    const findings = [];
    for (const f of bundle) {
      const t = textOf(f); if (!t || t.length > 2 * 1024 * 1024) continue;
      for (const [kind, re] of SECRETS) { const m = re.exec(t); if (m) { findings.push({ level: 'block', kind, file: f.path, line: t.slice(0, m.index).split('\n').length, why: 'This would be public for anyone to copy. Take it out of the file, then publish.' }); break; } }
    }
    return { findings, blocked: findings.length > 0, files: bundle.length };
  }

  // ---------- itch.io (HTML5 upload rules, itch.io/docs/creators/html5) ----------
  const ITCH = { files: 1000, total: 500 * 1024 * 1024, one: 200 * 1024 * 1024, path: 240 };
  function itch(bundle) {
    const problems = [], keys = [], bytes = bundle.reduce((n, f) => n + (f.size || 0), 0);
    const pr = (key, vars) => { keys.push({ key, vars: vars || {} }); problems.push(String(key).replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ''))); };
    if (!find(bundle, 'index.html')) pr('index.html must sit at the top of the zip.');
    if (bundle.length > ITCH.files) pr('{n} files; itch.io takes up to {max}.', { n: bundle.length, max: ITCH.files });
    if (bytes > ITCH.total) pr('{mb} MB; itch.io takes up to 500 MB unpacked.', { mb: (bytes / 1048576).toFixed(0) });
    const big = bundle.filter(f => (f.size || 0) > ITCH.one); if (big.length) pr('{file} is over 200 MB.', { file: big[0].path });
    const long = bundle.filter(f => f.path.length > ITCH.path); if (long.length) pr('A file path is longer than {max} characters: {file}…', { max: ITCH.path, file: long[0].path.slice(0, 60) });
    return { ok: !problems.length, problems, keys, files: bundle.length, bytes };
  }

  // ---------- app wrappers: files that go beside the published page, built by GitHub in the person's own account ----------
  // Android: a tiny Gradle project (a Trusted Web Activity through Google's android-browser-helper, Apache-2.0). We used
  // Bubblewrap first; its own docs say the first build stops to ask for a licence and for downloads, which a build on
  // GitHub can't answer, so the project is written out here instead and built with plain Gradle. Sources: docs/PUBLISH.md.
  const ANDROID = { agp: '8.7.3', gradle: '8.10.2', sdk: 35, minSdk: 21, helper: '2.4.0', jdk: '17' };
  const xmlEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const resEsc = s => xmlEsc(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/&quot;/g, '\\&quot;').replace(/^([@?])/, '\\$1');   // an Android string resource
  function androidInfo(m) {
    const u = new URL(m.url), v = Math.max(1, Number(m.version) || 1);
    return { packageId: m.pkg, host: u.host, origin: u.origin, startUrl: u.href, path: u.pathname.replace(/\/?$/, '/'), name: String(m.title || 'My app').replace(/\s+/g, ' ').trim().slice(0, 50) || 'My app',
      themeColor: HEX.test(m.color || '') ? m.color : '#F26B1D', versionCode: v, versionName: String(v), minSdk: ANDROID.minSdk, targetSdk: ANDROID.sdk, built: ANDROID };
  }
  function androidProject(m) {
    const a = androidInfo(m);
    const out = [
      { path: 'android/settings.gradle', text: `pluginManagement {\n    repositories {\n        google()\n        mavenCentral()\n        gradlePluginPortal()\n    }\n}\ndependencyResolutionManagement {\n    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)\n    repositories {\n        google()\n        mavenCentral()\n    }\n}\nrootProject.name = 'app'\ninclude ':app'\n` },
      { path: 'android/build.gradle', text: `plugins {\n    id 'com.android.application' version '${ANDROID.agp}' apply false\n}\n` },
      { path: 'android/gradle.properties', text: 'android.useAndroidX=true\norg.gradle.jvmargs=-Xmx2g\n' },
      { path: 'android/app/build.gradle', text: `plugins {\n    id 'com.android.application'\n}\n\nandroid {\n    namespace '${a.packageId}'\n    compileSdk ${ANDROID.sdk}\n\n    defaultConfig {\n        applicationId '${a.packageId}'\n        minSdk ${ANDROID.minSdk}\n        targetSdk ${ANDROID.sdk}\n        versionCode ${a.versionCode}\n        versionName '${a.versionName}'\n    }\n\n    compileOptions {\n        sourceCompatibility JavaVersion.VERSION_1_8\n        targetCompatibility JavaVersion.VERSION_1_8\n    }\n\n    signingConfigs {\n        release {\n            storeFile file(System.getenv('KEYSTORE_FILE') ?: 'android.keystore')\n            storePassword System.getenv('KEYSTORE_PW')\n            keyAlias 'app'\n            keyPassword System.getenv('KEYSTORE_PW')\n        }\n    }\n\n    buildTypes {\n        release {\n            minifyEnabled false\n            signingConfig signingConfigs.release\n        }\n    }\n\n    lint {\n        checkReleaseBuilds false\n        abortOnError false\n    }\n}\n\ndependencies {\n    implementation 'com.google.androidbrowserhelper:androidbrowserhelper:${ANDROID.helper}'\n}\n` },
      { path: 'android/app/src/main/AndroidManifest.xml', text: `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application\n        android:allowBackup="false"\n        android:icon="@mipmap/ic_launcher"\n        android:label="@string/app_name"\n        android:supportsRtl="true">\n        <meta-data\n            android:name="asset_statements"\n            android:resource="@string/asset_statements" />\n        <activity\n            android:name="com.google.androidbrowserhelper.trusted.LauncherActivity"\n            android:exported="true"\n            android:label="@string/app_name"\n            android:theme="@android:style/Theme.Translucent.NoTitleBar">\n            <meta-data\n                android:name="android.support.customtabs.trusted.DEFAULT_URL"\n                android:value="${xmlEsc(a.startUrl)}" />\n            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n            <intent-filter android:autoVerify="true">\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data\n                    android:host="${xmlEsc(a.host)}"\n                    android:pathPrefix="${xmlEsc(a.path)}"\n                    android:scheme="https" />\n            </intent-filter>\n        </activity>\n    </application>\n</manifest>\n` },
      { path: 'android/app/src/main/res/values/strings.xml', text: `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">${resEsc(a.name)}</string>\n    <string name="asset_statements" translatable="false">[{ \\"relation\\": [\\"delegate_permission/common.handle_all_urls\\"], \\"target\\": { \\"namespace\\": \\"web\\", \\"site\\": \\"${xmlEsc(a.origin)}\\" } }]</string>\n</resources>\n` },
      { path: 'android/app.json', text: JSON.stringify(a, null, 2) + '\n' },
    ];
    const icon = m.icons && (m.icons['512'] || m.icons[512]);
    if (icon) out.push({ path: 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', b64: String(icon).replace(/^data:image\/png;base64,/, '') });
    return out;
  }
  const assetLinks = (pkg, fps) => JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: (fps && fps.length ? fps : ['REPLACE_WITH_THE_SHA256_FROM_THE_BUILD']) } }], null, 2) + '\n';
  const ANDROID_YML = `# Made by TribeCode (Publish > Android app). Builds an installable Android app that opens your published page full
# screen (a Trusted Web Activity, through Google's android-browser-helper, Apache-2.0). It runs in YOUR GitHub account;
# TribeCode never sees your signing key.
#   - No secrets set: a TEST build, signed with a throwaway key made during the run. Good for trying it on your phone.
#     Each test build has a new identity, so remove the old one before installing a new one.
#   - For the store: add two repository secrets, ANDROID_KEYSTORE_BASE64 (your keystore file, base64) and
#     ANDROID_KEYSTORE_PASSWORD (key alias "app", same password for the key). Then every build has the same identity
#     and also makes an .aab for Google Play.
name: Android app
on:
  workflow_dispatch:
  push:
    branches: [main]
    paths: ['android/**', '.github/workflows/tribecode-android.yml']
permissions:
  contents: write
concurrency:
  group: android-app
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '${ANDROID.jdk}'
      - uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '${ANDROID.gradle}'
      - name: Signing key
        env:
          KEYSTORE_B64: \${{ secrets.ANDROID_KEYSTORE_BASE64 }}
          KEYSTORE_PW_SECRET: \${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
        run: |
          KS="$RUNNER_TEMP/android.keystore"
          if [ -n "$KEYSTORE_B64" ] && [ -n "$KEYSTORE_PW_SECRET" ]; then
            echo "$KEYSTORE_B64" | base64 -d > "$KS"
            echo "::add-mask::$KEYSTORE_PW_SECRET"
            echo "KEYSTORE_PW=$KEYSTORE_PW_SECRET" >> "$GITHUB_ENV"; echo "KIND=release" >> "$GITHUB_ENV"
          else
            keytool -genkeypair -keystore "$KS" -storetype PKCS12 -alias app -keyalg RSA -keysize 2048 -validity 9125 -storepass tribecode-test -keypass tribecode-test -dname "CN=Test build"
            echo "KEYSTORE_PW=tribecode-test" >> "$GITHUB_ENV"; echo "KIND=test" >> "$GITHUB_ENV"
          fi
          echo "KEYSTORE_FILE=$KS" >> "$GITHUB_ENV"
      - name: Build
        working-directory: android
        run: |
          gradle --no-daemon assembleRelease
          if [ "$KIND" = "release" ]; then gradle --no-daemon bundleRelease; fi
          cp app/build/outputs/apk/release/app-release.apk app.apk
          FP=$(keytool -list -v -keystore "$KEYSTORE_FILE" -alias app -storepass "$KEYSTORE_PW" | sed -n 's/^.*SHA256: //p' | head -1)
          PKG=$(node -p "require('./app.json').packageId")
          printf '[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"%s","sha256_cert_fingerprints":["%s"]}}]\\n' "$PKG" "$FP" > assetlinks.json
          echo "### Android app ($KIND build)" >> "$GITHUB_STEP_SUMMARY"
          echo "Signing fingerprint (SHA-256): $FP" >> "$GITHUB_STEP_SUMMARY"
      - name: Release
        working-directory: android
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          V=$(node -p "require('./app.json').versionName")
          TAG="android-v$V-\${{ github.run_number }}"
          FILES="app.apk assetlinks.json"
          if [ "$KIND" = "release" ] && [ -f app/build/outputs/bundle/release/app-release.aab ]; then cp app/build/outputs/bundle/release/app-release.aab app.aab; FILES="$FILES app.aab"; fi
          gh release create "$TAG" $FILES --title "Android app $V ($KIND build)" --notes "Install app.apk on an Android phone. assetlinks.json holds this build's signing fingerprint." --latest
`;

  // Computer app: a tiny Tauri v2 project (MIT / Apache-2.0) whose one window opens the published page. Unsigned.
  const DESKTOP = { tauri: '2', node: '20' };
  function desktopInfo(m) {
    const v = Math.max(1, Number(m.version) || 1), name = (String(m.title || 'My app').replace(/[^\p{L}\p{N} ._-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)) || 'My app';
    return { productName: name, version: `1.0.${Math.min(v, 65535)}`, identifier: String(m.pkg || 'io.github.me.app').replace(/[^A-Za-z0-9.-]/g, '-'), url: m.url };
  }
  function desktopProject(m) {
    const d = desktopInfo(m);
    const conf = { $schema: 'https://schema.tauri.app/config/2', productName: d.productName, version: d.version, identifier: d.identifier, build: { frontendDist: d.url },
      app: { windows: [{ title: d.productName, width: 1100, height: 760, minWidth: 360, minHeight: 480 }], security: { csp: null } },
      bundle: { active: true, targets: 'all', icon: ['icons/32x32.png', 'icons/128x128.png', 'icons/128x128@2x.png', 'icons/icon.icns', 'icons/icon.ico'] } };
    const out = [
      { path: 'desktop/src-tauri/tauri.conf.json', text: JSON.stringify(conf, null, 2) + '\n' },
      { path: 'desktop/src-tauri/Cargo.toml', text: `[package]\nname = "app"\nversion = "${d.version}"\nedition = "2021"\n\n[build-dependencies]\ntauri-build = { version = "${DESKTOP.tauri}", features = [] }\n\n[dependencies]\ntauri = { version = "${DESKTOP.tauri}", features = [] }\n\n[profile.release]\nstrip = true\nopt-level = "s"\n` },
      { path: 'desktop/src-tauri/build.rs', text: 'fn main() {\n    tauri_build::build()\n}\n' },
      { path: 'desktop/src-tauri/src/main.rs', text: '#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]\n\nfn main() {\n    tauri::Builder::default()\n        .run(tauri::generate_context!())\n        .expect("error while running the app");\n}\n' },
      { path: 'desktop/src-tauri/.gitignore', text: 'target/\ngen/\n' },
      { path: 'desktop/README.md', text: `# Computer app\n\nGitHub builds this for you (Actions > Computer app). The installers are under Releases.\n\nIt is a small window that opens ${d.url}, so it needs a connection, and it shows the newest version of your page every time.\n\n## Opening it the first time\n\nThese builds are not signed, so the computer asks before it runs them. That is expected.\n\n- **Windows**: "Windows protected your PC" appears. Choose More info, then Run anyway.\n- **Mac** (Apple chip): open it once, close the warning, then go to System Settings > Privacy & Security and choose Open Anyway.\n- **Linux**: the .AppImage needs "Allow running as a program" in its Properties; the .deb installs as usual.\n\nTo remove the warnings you need your own Windows certificate and Apple developer account. TribeCode never holds those.\n` },
    ];
    const icon = m.icons && (m.icons['512'] || m.icons[512]);
    if (icon) out.push({ path: 'desktop/app-icon.png', b64: String(icon).replace(/^data:image\/png;base64,/, '') });
    return out;
  }
  const DESKTOP_YML = `# Made by TribeCode (Publish > Computer app). Builds Windows, Mac (Apple chip) and Linux installers that open your
# published page in its own window (Tauri v2, MIT / Apache-2.0). It runs in YOUR GitHub account.
# The builds are NOT signed: desktop/README.md says how to open them the first time.
name: Computer app
on:
  workflow_dispatch:
  push:
    branches: [main]
    paths: ['desktop/**', '.github/workflows/tribecode-desktop.yml']
permissions:
  contents: write
concurrency:
  group: desktop-app
  cancel-in-progress: true
jobs:
  release:
    runs-on: ubuntu-latest
    outputs:
      tag: \${{ steps.mk.outputs.tag }}
    steps:
      - uses: actions/checkout@v4
      - id: mk
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          V=$(node -p "require('./desktop/src-tauri/tauri.conf.json').version")
          TAG="desktop-v$V-\${{ github.run_number }}"
          gh release create "$TAG" desktop/README.md --title "Computer app $V" --notes "Installers for Windows, Mac (Apple chip) and Linux. They are not signed: README.md says how to open them the first time." --latest=false
          echo "tag=$TAG" >> "$GITHUB_OUTPUT"
  build:
    needs: release
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-22.04, windows-latest, macos-latest]
    runs-on: \${{ matrix.os }}
    timeout-minutes: 60
    defaults:
      run:
        shell: bash
    steps:
      - uses: actions/checkout@v4
      - name: Linux packages
        if: startsWith(matrix.os, 'ubuntu')
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf xdg-utils
      - uses: actions/setup-node@v4
        with:
          node-version: '${DESKTOP.node}'
      - uses: dtolnay/rust-toolchain@stable
      - uses: swatinem/rust-cache@v2
        with:
          workspaces: './desktop/src-tauri -> target'
      - name: Icons
        working-directory: desktop
        run: npx --yes @tauri-apps/cli@${DESKTOP.tauri} icon ./app-icon.png
      - name: Build
        working-directory: desktop
        run: npx --yes @tauri-apps/cli@${DESKTOP.tauri} build
      - name: Upload
        working-directory: desktop/src-tauri/target/release/bundle
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          shopt -s nullglob
          FILES=(deb/*.deb rpm/*.rpm appimage/*.AppImage nsis/*.exe msi/*.msi dmg/*.dmg)
          if [ \${#FILES[@]} -eq 0 ]; then echo "::error::No installer was made."; exit 1; fi
          gh release upload "\${{ needs.release.outputs.tag }}" "\${FILES[@]}" --clobber --repo "\${{ github.repository }}"
`;
  const IOS_YML = `# Made by TribeCode (Publish > iPhone app). PREPARED, NOT ONE CLICK: Apple only lets an app be signed with a paid Apple
# Developer account, and the build needs a Mac (GitHub lends one here). This wraps your published page with Capacitor
# (MIT) and sends it to TestFlight. It does nothing until you add these repository secrets:
#   IOS_CERT_P12_BASE64, IOS_CERT_PASSWORD   your Apple Distribution certificate (.p12, base64) and its password
#   IOS_PROFILE_BASE64                       an App Store provisioning profile for the bundle id below (base64)
#   IOS_TEAM_ID                              your Apple team id
#   ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8    an App Store Connect API key (the .p8 text)
# Apple may refuse an app that is only a web page in a shell; add something the page can't do alone before you submit.
name: iPhone app
on:
  workflow_dispatch:
jobs:
  build:
    runs-on: macos-latest
    timeout-minutes: 45
    env:
      APP_NAME: "__NAME__"
      BUNDLE_ID: "__PKG__"
      IOS_CERT_P12_BASE64: \${{ secrets.IOS_CERT_P12_BASE64 }}
    steps:
      - name: Check the secrets are set
        run: |
          if [ -z "$IOS_CERT_P12_BASE64" ]; then echo "::error::Add the Apple signing secrets first (see the top of this file)."; exit 1; fi
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Wrap the page
        run: |
          mkdir -p ios-build/www && rsync -a --exclude .git --exclude .github --exclude android --exclude desktop --exclude ios-build ./ ios-build/www/
          cd ios-build && npm init -y >/dev/null && npm install @capacitor/core@6 @capacitor/cli@6 @capacitor/ios@6
          npx cap init "$APP_NAME" "$BUNDLE_ID" --web-dir www && npx cap add ios && npx cap sync ios
      - name: Signing
        env:
          IOS_CERT_PASSWORD: \${{ secrets.IOS_CERT_PASSWORD }}
          IOS_PROFILE_BASE64: \${{ secrets.IOS_PROFILE_BASE64 }}
        run: |
          KC="$RUNNER_TEMP/app.keychain-db"; security create-keychain -p tmp "$KC"; security set-keychain-settings -lut 21600 "$KC"; security unlock-keychain -p tmp "$KC"
          echo "$IOS_CERT_P12_BASE64" | base64 -d > "$RUNNER_TEMP/cert.p12"
          security import "$RUNNER_TEMP/cert.p12" -P "$IOS_CERT_PASSWORD" -A -t cert -f pkcs12 -k "$KC"; security list-keychain -d user -s "$KC"
          mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
          echo "$IOS_PROFILE_BASE64" | base64 -d > "$HOME/Library/MobileDevice/Provisioning Profiles/app.mobileprovision"
      - name: Build and upload to TestFlight
        env:
          IOS_TEAM_ID: \${{ secrets.IOS_TEAM_ID }}
          ASC_KEY_ID: \${{ secrets.ASC_KEY_ID }}
          ASC_ISSUER_ID: \${{ secrets.ASC_ISSUER_ID }}
          ASC_KEY_P8: \${{ secrets.ASC_KEY_P8 }}
        run: |
          cd ios-build/ios/App
          xcodebuild -workspace App.xcworkspace -scheme App -configuration Release -archivePath "$RUNNER_TEMP/App.xcarchive" DEVELOPMENT_TEAM="$IOS_TEAM_ID" CODE_SIGN_STYLE=Manual PROVISIONING_PROFILE_SPECIFIER=app CODE_SIGN_IDENTITY="Apple Distribution" archive
          printf '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>method</key><string>app-store-connect</string><key>teamID</key><string>%s</string><key>signingStyle</key><string>manual</string><key>provisioningProfiles</key><dict><key>%s</key><string>app</string></dict></dict></plist>' "$IOS_TEAM_ID" "$BUNDLE_ID" > "$RUNNER_TEMP/export.plist"
          xcodebuild -exportArchive -archivePath "$RUNNER_TEMP/App.xcarchive" -exportOptionsPlist "$RUNNER_TEMP/export.plist" -exportPath "$RUNNER_TEMP/out"
          mkdir -p "$HOME/.appstoreconnect/private_keys" && echo "$ASC_KEY_P8" > "$HOME/.appstoreconnect/private_keys/AuthKey_$ASC_KEY_ID.p8"
          xcrun altool --upload-app -f "$RUNNER_TEMP/out/App.ipa" -t ios --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
`;
  function wrapperFiles(kind, m = {}) {
    if (kind === 'android') return [
      { path: '.github/workflows/tribecode-android.yml', text: ANDROID_YML },
      ...androidProject(m),
      { path: 'android/assetlinks.template.json', text: assetLinks(m.pkg) },
      { path: 'android/README.md', text: `# Android app\n\nGitHub builds this for you (Actions > Android app). The finished app is under Releases as \`app.apk\`.\n\n- **Test build** (no secrets): install it by hand on your phone. It opens ${m.url}.\n- **Store build**: add the secrets named at the top of \`.github/workflows/tribecode-android.yml\`, then upload \`app.aab\` in Google Play Console.\n- **No address bar**: Android hides the bar only when \`/.well-known/assetlinks.json\` on your site's domain lists this app's signing fingerprint. Each release carries a ready \`assetlinks.json\`. On a \`<name>.github.io/<project>/\` address that file has to live in your \`<name>.github.io\` project, in a folder called \`.well-known\` (with an empty \`.nojekyll\` file beside it).\n\nThis folder is a small Android project: \`app/build.gradle\` and \`app/src/main/AndroidManifest.xml\`. It is written again on every publish, so change things in TribeCode, not here.\n` },
    ];
    if (kind === 'desktop') return [{ path: '.github/workflows/tribecode-desktop.yml', text: DESKTOP_YML }, ...desktopProject(m)];
    if (kind === 'ios') return [{ path: '.github/workflows/tribecode-ios.yml', text: IOS_YML.replace('__NAME__', String(m.title || 'My app').replace(/["\\$`]/g, '').slice(0, 40)).replace('__PKG__', m.pkg || 'com.example.app') }];
    return [];
  }

  // ---------- GitHub Pages: the page gets its own small project on the person's GitHub ----------
  // opts: { fetch, api?, token, name, title, desc, files:[{path, text|b64}], project, message, onStep? }
  async function pagesPublish(o) {
    const api = String(o.api || 'https://api.github.com').replace(/\/+$/, ''), f = o.fetch || fetch;
    const scrub = s => String(s || '').replace(/(gh[pousr]_|github_pat_)[\w]+/g, '***').slice(0, 200);
    async function gh(path, method, body, okStatuses) {
      const r = await f(api + path, { method: method || 'GET', headers: { Authorization: 'Bearer ' + o.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'TribeCode', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const d = r.status === 204 ? {} : await r.json().catch(() => ({}));
      if (!r.ok && !(okStatuses || []).includes(r.status)) throw Object.assign(new Error(scrub(d.message) || `GitHub said ${r.status}`), { status: r.status, gh: true });
      return { status: r.status, d };
    }
    const step = s => { try { o.onStep && o.onStep(s); } catch {} };
    if (!o.token) throw Object.assign(new Error('Connect GitHub first.'), { status: 401 });
    step('Signing in');
    const me = (await gh('/user')).d, login = me.login; if (!login) throw Object.assign(new Error('GitHub did not say who you are. Sign in again.'), { status: 401 });
    const name = slug(o.name), repo = `${login}/${name}`;
    let info = await gh(`/repos/${repo}`, 'GET', null, [404]), created = false;
    if (info.status === 404) {
      step('Making its home on GitHub');
      info = await gh('/user/repos', 'POST', { name, description: String(o.desc || o.title || '').slice(0, 300), auto_init: true, has_issues: false, has_wiki: false, has_projects: false });
      created = true;
    } else {
      const mark = await gh(`/repos/${repo}/contents/.tribecode.json`, 'GET', null, [404]);
      if (mark.status === 404) throw Object.assign(new Error(`You already have something called "${name}" on GitHub that TribeCode did not make. Pick another name.`), { status: 409, taken: true });
    }
    const branch = info.d.default_branch || 'main';
    let head = null;
    for (let i = 0; i < 6 && !head; i++) {   // a brand-new project's first commit can take a moment to appear
      const ref = await gh(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, 'GET', null, [404, 409]);
      if (ref.status === 200) head = ref.d.object.sha; else await new Promise(r => setTimeout(r, o.wait == null ? 700 : o.wait));
    }
    if (!head) throw Object.assign(new Error('GitHub is still setting the project up. Try again in a moment.'), { status: 503 });
    const files = [...o.files, { path: '.nojekyll', text: '' }, { path: '.tribecode.json', text: JSON.stringify({ madeWith: 'TribeCode', project: o.project || '', title: o.title || '' }, null, 2) + '\n' }];
    step(`Sending ${files.length} files`);
    const tree = [];
    for (const x of files) {
      const blob = await gh(`/repos/${repo}/git/blobs`, 'POST', x.b64 != null ? { content: x.b64, encoding: 'base64' } : { content: x.text || '', encoding: 'utf-8' });
      tree.push({ path: x.path, mode: '100644', type: 'blob', sha: blob.d.sha });
    }
    const t = await gh(`/repos/${repo}/git/trees`, 'POST', { tree });
    const c = await gh(`/repos/${repo}/git/commits`, 'POST', { message: o.message || 'Publish', tree: t.d.sha, parents: [head] });
    await gh(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, 'PATCH', { sha: c.d.sha, force: false });
    step('Turning the page on');
    let pagesEnabled = false, url = `https://${login.toLowerCase()}.github.io/${name}/`;
    const pg = await gh(`/repos/${repo}/pages`, 'GET', null, [404, 403]);
    if (pg.status === 200) { pagesEnabled = true; url = pg.d.html_url || url; }
    else {
      const mk = await gh(`/repos/${repo}/pages`, 'POST', { source: { branch, path: '/' } }, [403, 404, 409, 422]);
      if (mk.status === 201 || mk.status === 200 || mk.status === 409) { pagesEnabled = true; url = (mk.d && mk.d.html_url) || url; }
    }
    return { repo, login, branch, url: url.replace(/\/?$/, '/'), commit: c.d.sha, pagesEnabled, created, settingsUrl: `https://github.com/${repo}/settings/pages`, web: `https://github.com/${repo}` };
  }

  return { slug, pkgId, kindOf, secrets, preflight, finish, pwaFiles, iconSvg, itch, ITCH, wrapperFiles, androidInfo, desktopInfo, assetLinks, pagesPublish, ANDROID_YML, IOS_YML, DESKTOP_YML, ANDROID, DESKTOP };
});
