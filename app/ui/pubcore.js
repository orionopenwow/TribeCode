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
    const add = (id, ok, label, why, auto) => out.push({ id, ok: !!ok, auto: !!auto && !ok, label, why: ok ? '' : why });
    add('index', !!idx, 'Has a first page', 'There is no index.html at the top of the web folder. Build a first version first.');
    if (!idx) return out;
    const paths = new Set(bundle.map(f => f.path));
    const missing = localRefs(html).filter(u => !/\/$/.test(u) && !paths.has(decodeURI(u)));
    add('loads', !missing.length, 'Every file the page asks for is there', `The first page points at ${missing.length} file${missing.length === 1 ? '' : 's'} that ${missing.length === 1 ? 'is' : 'are'} not in the folder: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}. It may open with parts missing.`);
    add('name', /<title>\s*[^<\s][^<]*<\/title>/i.test(html), 'Has a name', 'No title on the page. Your title is added for you.', true);
    add('desc', /<meta[^>]+name=["']description["'][^>]*content=["'][^"']{8,}/i.test(html) || /<meta[^>]+content=["'][^"']{8,}["'][^>]*name=["']description["']/i.test(html), 'Has a one-line description', 'No description for search and share cards. Your one line is added for you.', true);
    add('phone', /<meta[^>]+name=["']viewport["']/i.test(html), 'Fits a phone', 'No phone setting (viewport) on the page. It is added for you.', true);
    const hasIcon = /<link[^>]+rel=["'][^"']*icon/i.test(html) || paths.has('favicon.ico') || paths.has('favicon.svg') || paths.has('icon.svg');
    add('icon', hasIcon, 'Has an icon', 'No icon. One is made for you from the name and color.', true);
    if (kind === 'game') add('canvas', /<canvas\b/i.test(html) || bundle.some(f => /\.(m?js)$/i.test(f.path) && /getContext\(|WebGLRenderer|createElement\(["']canvas/.test(textOf(f))), 'Has a game screen', 'No game canvas found on the first page. Check the game starts from index.html.');
    const bytes = bundle.reduce((n, f) => n + (f.size || 0), 0);
    add('size', bytes < 100 * 1024 * 1024, 'Small enough to load fast', `${(bytes / 1048576).toFixed(0)} MB in all. Compress pictures and sound, or load big files only when needed.`);
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
    const out = bundle.filter(f => !/^\.github\/|^android\/|^ios-app\//.test(f.path)).map(f => ({ ...f }));
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

  // ---------- itch.io (HTML5 upload rules, itch.io/docs/creators/html5) ----------
  const ITCH = { files: 1000, total: 500 * 1024 * 1024, one: 200 * 1024 * 1024, path: 240 };
  function itch(bundle) {
    const problems = [], bytes = bundle.reduce((n, f) => n + (f.size || 0), 0);
    if (!find(bundle, 'index.html')) problems.push('index.html must sit at the top of the zip.');
    if (bundle.length > ITCH.files) problems.push(`${bundle.length} files; itch.io takes up to ${ITCH.files}.`);
    if (bytes > ITCH.total) problems.push(`${(bytes / 1048576).toFixed(0)} MB; itch.io takes up to 500 MB unpacked.`);
    const big = bundle.filter(f => (f.size || 0) > ITCH.one); if (big.length) problems.push(`${big[0].path} is over 200 MB.`);
    const long = bundle.filter(f => f.path.length > ITCH.path); if (long.length) problems.push(`A file path is longer than ${ITCH.path} characters: ${long[0].path.slice(0, 60)}…`);
    return { ok: !problems.length, problems, files: bundle.length, bytes };
  }

  // ---------- app wrappers: files that go beside the published page, built by GitHub in the person's own account ----------
  function twaManifest(m) {
    const u = new URL(m.url), color = HEX.test(m.color || '') ? m.color : '#F26B1D', icon = m.iconUrl || new URL('icons/icon-512.png', m.url).href;
    return { packageId: m.pkg, host: u.host, name: String(m.title || 'My app').slice(0, 50), launcherName: String(m.title || 'My app').slice(0, 12), display: 'standalone', themeColor: color, themeColorDark: '#000000',
      navigationColor: '#000000', navigationColorDark: '#000000', navigationDividerColor: '#000000', navigationDividerColorDark: '#000000', backgroundColor: HEX.test(m.bg || '') ? m.bg : '#ffffff', enableNotifications: false,
      startUrl: u.pathname.replace(/\/?$/, '/'), iconUrl: icon, maskableIconUrl: icon, splashScreenFadeOutDuration: 300, signingKey: { path: './android.keystore', alias: 'app' },
      appVersionName: String(m.version || 1), appVersionCode: Number(m.version || 1), shortcuts: [], generatorApp: 'tribecode', webManifestUrl: new URL('manifest.webmanifest', m.url).href, fallbackType: 'customtabs',
      features: {}, alphaDependencies: { enabled: false }, enableSiteSettingsShortcut: true, isChromeOSOnly: false, isMetaQuest: false, fullScopeUrl: m.url, minSdkVersion: 21, orientation: 'default', fingerprints: [], additionalTrustedOrigins: [], retainedBundles: [], appVersion: String(m.version || 1) };
  }
  const assetLinks = (pkg, fps) => JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: (fps && fps.length ? fps : ['REPLACE_WITH_THE_SHA256_FROM_THE_BUILD']) } }], null, 2) + '\n';
  const ANDROID_YML = `# Made by TribeCode (Publish > Android app). Builds an installable Android app that opens your published page full
# screen (a Trusted Web Activity, built with Google's Bubblewrap, Apache-2.0). It runs in YOUR GitHub account; TribeCode
# never sees your signing key.
#   - No secrets set: a TEST build, signed with a throwaway key made during the run. Good for trying it on your phone.
#     Each test build has a new identity, so remove the old one before installing a new one.
#   - For the store: add two repository secrets, ANDROID_KEYSTORE_BASE64 (your keystore file, base64) and
#     ANDROID_KEYSTORE_PASSWORD (key alias "app"). Then every build has the same identity and also makes an .aab.
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
          java-version: '17'
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install Bubblewrap
        run: |
          npm install -g @bubblewrap/cli@1
          mkdir -p "$HOME/.bubblewrap"
          echo "{\\"jdkPath\\":\\"$JAVA_HOME\\",\\"androidSdkPath\\":\\"$ANDROID_HOME\\"}" > "$HOME/.bubblewrap/config.json"
      - name: Signing key
        working-directory: android
        env:
          KEYSTORE_B64: \${{ secrets.ANDROID_KEYSTORE_BASE64 }}
          KEYSTORE_PW: \${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
        run: |
          if [ -n "$KEYSTORE_B64" ] && [ -n "$KEYSTORE_PW" ]; then
            echo "$KEYSTORE_B64" | base64 -d > android.keystore
            echo "PW=$KEYSTORE_PW" >> "$GITHUB_ENV"; echo "KIND=release" >> "$GITHUB_ENV"
          else
            keytool -genkeypair -keystore android.keystore -alias app -keyalg RSA -keysize 2048 -validity 9125 -storepass tribecode-test -keypass tribecode-test -dname "CN=Test build"
            echo "PW=tribecode-test" >> "$GITHUB_ENV"; echo "KIND=test" >> "$GITHUB_ENV"
          fi
      - name: Build
        working-directory: android
        env:
          BUBBLEWRAP_KEYSTORE_PASSWORD: \${{ env.PW }}
          BUBBLEWRAP_KEY_PASSWORD: \${{ env.PW }}
        run: |
          bubblewrap update --skipVersionUpgrade --manifest=./twa-manifest.json
          bubblewrap build --skipPwaValidation
          FP=$(keytool -list -v -keystore android.keystore -alias app -storepass "$PW" | sed -n 's/^.*SHA256: //p' | head -1)
          PKG=$(node -p "require('./twa-manifest.json').packageId")
          printf '[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"%s","sha256_cert_fingerprints":["%s"]}}]\\n' "$PKG" "$FP" > assetlinks.json
          cp app-release-signed.apk app.apk
          echo "### Android app ($KIND build)" >> "$GITHUB_STEP_SUMMARY"
          echo "Signing fingerprint (SHA-256): $FP" >> "$GITHUB_STEP_SUMMARY"
      - name: Release
        working-directory: android
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          V=$(node -p "require('./twa-manifest.json').appVersionName")
          TAG="android-v$V-\${{ github.run_number }}"
          FILES="app.apk assetlinks.json"
          if [ "$KIND" = "release" ] && [ -f app-release-bundle.aab ]; then FILES="$FILES app-release-bundle.aab"; fi
          gh release create "$TAG" $FILES --title "Android app $V ($KIND build)" --notes "Install app.apk on an Android phone. assetlinks.json holds this build's signing fingerprint." --latest
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
          mkdir -p ios-build/www && rsync -a --exclude .git --exclude .github --exclude android --exclude ios-build ./ ios-build/www/
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
      { path: 'android/twa-manifest.json', text: JSON.stringify(twaManifest(m), null, 2) + '\n' },
      { path: 'android/assetlinks.template.json', text: assetLinks(m.pkg) },
      { path: 'android/README.md', text: `# Android app\n\nGitHub builds this for you (Actions > Android app). The finished app is under Releases as \`app.apk\`.\n\n- **Test build** (no secrets): install it by hand on your phone. It opens ${m.url}.\n- **Store build**: add the secrets named at the top of \`.github/workflows/tribecode-android.yml\`, then upload the \`.aab\` in Google Play Console.\n- **No address bar**: Android hides the bar only when \`/.well-known/assetlinks.json\` on your site's domain lists this app's signing fingerprint. Each release carries a ready \`assetlinks.json\`. On a \`<name>.github.io/<project>/\` address that file has to live in your \`<name>.github.io\` project; with your own domain it goes at the top of this one. Until then the app still works, with a slim bar on top.\n` },
    ];
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
    await gh(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, 'PATCH', { sha: c.d.sha, force: true });
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

  return { slug, pkgId, kindOf, preflight, finish, pwaFiles, iconSvg, itch, ITCH, wrapperFiles, twaManifest, assetLinks, pagesPublish, ANDROID_YML, IOS_YML };
});
