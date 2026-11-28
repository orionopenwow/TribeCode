// Hide the console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

/// fix/security-2: the Working dev lane gets IPC only with TRIBECODE_WORKING_LANE=1 or a ~/.tribecode/working-lane file
/// (Working\Start-Working.bat makes that file).
fn working_lane_enabled() -> bool {
    if std::env::var("TRIBECODE_WORKING_LANE").map(|v| v == "1").unwrap_or(false) {
        return true;
    }
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(|h| std::path::Path::new(&h).join(".tribecode").join("working-lane").is_file())
        .unwrap_or(false)
}

/// fix/p7-cache: the web view keeps cached copies of the app's own files between versions, so after an update it could
/// still show the old screens. On the first start after the version changes (or after "Clear the cache and restart"),
/// delete only the web view's cache folders, never its saved settings (Local Storage, IndexedDB stay). Std only.
fn tribecode_home() -> Option<std::path::PathBuf> {
    // fix/p15-updates: TRIBECODE_HOME overrides it (the server's server/admin.js reads the same variable).
    if let Some(h) = std::env::var_os("TRIBECODE_HOME") {
        if !h.is_empty() {
            return Some(std::path::PathBuf::from(h));
        }
    }
    std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(|h| std::path::PathBuf::from(h).join(".tribecode"))
}
fn web_cache_roots() -> Vec<std::path::PathBuf> {
    let id = "dev.tribecode.desktop";
    let mut v = Vec::new();
    #[cfg(windows)]
    if let Some(l) = std::env::var_os("LOCALAPPDATA") {
        v.push(std::path::PathBuf::from(l).join(id).join("EBWebView"));
    }
    #[cfg(target_os = "macos")]
    if let Some(h) = std::env::var_os("HOME") {
        let h = std::path::PathBuf::from(h);
        v.push(h.join("Library").join("Caches").join(id));
        v.push(h.join("Library").join("WebKit").join(id));
    }
    #[cfg(target_os = "linux")]
    {
        let cache = std::env::var_os("XDG_CACHE_HOME").map(std::path::PathBuf::from).or_else(|| std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".cache")));
        if let Some(c) = cache {
            v.push(c.join(id));
        }
    }
    v
}
fn remove_cache_dirs(dir: &std::path::Path, depth: u8) {
    const CACHE_DIRS: [&str; 8] = ["Cache", "Code Cache", "GPUCache", "Service Worker", "CacheStorage", "NetworkCache", "WebKitCache", "fsCachedData"];
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if !p.is_dir() {
            continue;
        }
        let name = e.file_name().to_string_lossy().to_string();
        if CACHE_DIRS.contains(&name.as_str()) {
            let _ = std::fs::remove_dir_all(&p);
        } else if depth > 0 {
            remove_cache_dirs(&p, depth - 1);
        }
    }
}
fn clear_stale_web_cache() {
    let Some(home) = tribecode_home() else { return };
    let marker = home.join("ui-version");
    let asked = home.join("clear-cache");
    let ver = env!("CARGO_PKG_VERSION");
    let last = std::fs::read_to_string(&marker).unwrap_or_default();
    if last.trim() == ver && !asked.is_file() {
        return;
    }
    for r in web_cache_roots() {
        remove_cache_dirs(&r, 3);
    }
    let _ = std::fs::create_dir_all(&home);
    let _ = std::fs::write(&marker, ver);
    let _ = std::fs::remove_file(&asked);
}

/// Settings › Clear the cache: ask for a clean start, then restart the app (the server stops with it).
#[tauri::command]
fn clear_web_cache_and_restart(app: tauri::AppHandle) -> Result<(), String> {
    let home = tribecode_home().ok_or("no home folder")?;
    std::fs::create_dir_all(&home).map_err(|e| e.to_string())?;
    std::fs::write(home.join("clear-cache"), "1").map_err(|e| e.to_string())?;
    app.restart();
}

/// The tribe server this app is hosting, if any (bundled as a sidecar binary).
struct Host(Mutex<Option<(CommandChild, u16)>>);
/// The last lines the server printed, so the app can show why it didn't start.
struct HostLog(Arc<Mutex<Vec<String>>>);

fn port_free(port: u16) -> bool {
    std::net::TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// One plain HTTP/1.0 request to this computer (std only, short timeouts). Returns the whole answer, headers included.
fn http_local(port: u16, req: &str) -> Option<String> {
    use std::io::{Read, Write};
    use std::time::Duration;
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let mut s = std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(700)).ok()?;
    let _ = s.set_read_timeout(Some(Duration::from_millis(1500)));
    let _ = s.set_write_timeout(Some(Duration::from_millis(700)));
    s.write_all(req.as_bytes()).ok()?;
    let mut buf = Vec::new();
    let _ = s.take(64 * 1024).read_to_end(&mut buf);
    Some(String::from_utf8_lossy(&buf).to_string())
}

/// The text value of the first `"key":"…"` in a JSON answer (version and build ids never contain quotes).
fn json_field(text: &str, key: &str) -> String {
    let pat = format!("\"{key}\":\"");
    match text.find(&pat) {
        Some(i) => {
            let rest = &text[i + pat.len()..];
            rest.find('"').map(|j| rest[..j].to_string()).unwrap_or_default()
        }
        None => String::new(),
    }
}

/// fix/p15-updates: what a TribeCode server on this port says about itself: (version, build id). None: not TribeCode.
fn health(port: u16) -> Option<(String, String)> {
    let req = format!("GET /api/health HTTP/1.0\r\nHost: localhost:{port}\r\nConnection: close\r\n\r\n");
    let text = http_local(port, &req)?;
    if !(text.starts_with("HTTP/1.") && text.contains(" 200") && text.contains("\"tribe\"") && text.contains("\"version\"")) {
        return None;
    }
    Some((json_field(&text, "version"), json_field(&text, "build")))
}

/// feat/easy-start: is the program on this port a TribeCode server? Anything else that holds the port (another app, a
/// hung older copy) is not reused: the server starts on the next free port.
fn is_tribecode(port: u16) -> bool {
    health(port).is_some()
}

/// fix/p15-updates: the build id of the page bundled with this app (<meta name="tribe-build"> in ui/index.html, stamped
/// at release by scripts/dev/buildid.js). Empty for a development build.
fn bundled_build(app: &tauri::AppHandle) -> String {
    let Ok(p) = app.path().resolve("ui/index.html", tauri::path::BaseDirectory::Resource) else { return String::new() };
    let html = std::fs::read_to_string(p).unwrap_or_default();
    let pat = "<meta name=\"tribe-build\" content=\"";
    match html.find(pat) {
        Some(i) => {
            let rest = &html[i + pat.len()..];
            rest.find('"').map(|j| rest[..j].to_string()).unwrap_or_default()
        }
        None => String::new(),
    }
}

/// 64 hex characters from the OS-seeded hasher keys (std only: no rand crate).
fn random_hex() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let mut out = String::new();
    for i in 0..4u64 {
        let mut h = RandomState::new().build_hasher();
        h.write_u128(nanos);
        h.write_u32(std::process::id());
        h.write_u64(i);
        out.push_str(&format!("{:016x}", h.finish()));
    }
    out
}

/// fix/p15-updates: the per-install secret this app and its servers share (~/.tribecode/admin-secret, server/admin.js).
/// Made once by whichever starts first; only this computer's user can read it.
fn admin_secret() -> Option<String> {
    use std::io::Write;
    let home = tribecode_home()?;
    let file = home.join("admin-secret");
    if let Ok(s) = std::fs::read_to_string(&file) {
        let s = s.trim().to_string();
        if s.len() >= 32 {
            return Some(s);
        }
    }
    let _ = std::fs::create_dir_all(&home);
    let s = random_hex();
    let mut oo = std::fs::OpenOptions::new();
    oo.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        oo.mode(0o600);
    }
    if let Ok(mut f) = oo.open(&file) {
        if f.write_all(s.as_bytes()).is_ok() {
            return Some(s);
        }
    }
    std::fs::read_to_string(&file).ok().map(|x| x.trim().to_string()).filter(|x| x.len() >= 32)
}

/// fix/p15-updates: ask the TribeCode server on this port to stop cleanly (POST /api/admin/shutdown with the secret; it
/// only answers this computer). True when it agreed.
fn ask_shutdown(port: u16) -> bool {
    let Some(secret) = admin_secret() else { return false };
    let req = format!("POST /api/admin/shutdown HTTP/1.0\r\nHost: localhost:{port}\r\nX-Tribe-Admin: {secret}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    http_local(port, &req).map(|t| t.starts_with("HTTP/1.") && t.contains(" 200")).unwrap_or(false)
}

fn wait_port_free(port: u16, ms: u64) -> bool {
    let until = std::time::Instant::now() + std::time::Duration::from_millis(ms);
    while std::time::Instant::now() < until {
        if port_free(port) {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    port_free(port)
}

/// Stop bundled tribe servers left running by an older copy of the app (by program name: only our own sidecar binary).
fn kill_stale_sidecars() {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/IM", "tribecode-server.exe"])
            .creation_flags(0x0800_0000)
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("pkill").args(["-f", "tribecode-server"]).status();
    }
}

#[tauri::command]
fn host_start(app: tauri::AppHandle, state: tauri::State<'_, Host>, port: u16, dir: String, name: String) -> Result<String, String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some((_, p)) = slot.as_ref() {
        return Ok(format!("http://localhost:{p}"));
    }
    // Something already listens on the port. A TribeCode server (started from the repo, or another copy of the
    // app): use it instead of starting a second server on the same folder. Anything else (feat/easy-start: another
    // program, or an older copy that no longer answers): start on the next free port instead of waiting on a port
    // that will never answer.
    // fix/p15-updates: only a server of exactly this app's version and build is reused. An older one (left running by the
    // previous version, or `npm start` from an older checkout) would keep serving old screens and old server code after
    // an update: ask it to stop cleanly, then by name if it is our old sidecar, and start ours. If it still won't stop,
    // start on the next free port and say so in the log.
    let mut port = port;
    let mut notes: Vec<String> = Vec::new();
    if !port_free(port) {
        if let Some((their_v, their_b)) = health(port) {
            let mine_v = env!("CARGO_PKG_VERSION");
            let mine_b = bundled_build(&app);
            if their_v == mine_v && (mine_b.is_empty() || their_b == mine_b) {
                return Ok(format!("http://localhost:{port}"));
            }
            let what = format!("v{their_v}{}", if their_b.is_empty() { String::new() } else { format!(" build {their_b}") });
            let asked = ask_shutdown(port);
            let mut freed = asked && wait_port_free(port, 5000);
            if !freed {
                kill_stale_sidecars();
                freed = wait_port_free(port, 3000);
            }
            if freed {
                notes.push(format!("[tribecode] stopped an older TribeCode server ({what}) on port {port}; starting v{mine_v}"));
            } else {
                notes.push(format!("[tribecode] an older TribeCode server ({what}) on port {port} would not stop (close it, for example a terminal running npm start)"));
            }
        }
        if !port_free(port) {
            match (port.saturating_add(1)..=port.saturating_add(20)).find(|p| port_free(*p)) {
                Some(p) => {
                    notes.push(format!("[tribecode] port {port} is taken; starting on port {p}"));
                    port = p
                }
                None => return Err(format!("no free port near {port} on this computer")),
            }
        }
    }
    let ui = app
        .path()
        .resolve("ui", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let port_s = port.to_string();
    let ui_s = ui.to_string_lossy().to_string();
    // An empty folder or name is left out: the server then uses its own default (an empty value after --dir used to
    // stop it at once).
    let mut argv: Vec<&str> = vec!["--port", port_s.as_str()];
    if !dir.trim().is_empty() {
        argv.extend(["--dir", dir.as_str()]);
    }
    if !name.trim().is_empty() {
        argv.extend(["--name", name.as_str()]);
    }
    argv.extend(["--ui", ui_s.as_str(), "--exit-with-parent"]);
    let (mut events, child) = app
        .shell()
        .sidecar("tribecode-server")
        .map_err(|e| format!("could not start the tribe server: {e}"))?
        .args(argv)
        .spawn()
        .map_err(|e| format!("could not start the tribe server: {e}"))?;
    *slot = Some((child, port));
    let lines = app.state::<HostLog>().0.clone();
    if let Ok(mut l) = lines.lock() {
        l.clear();
        l.extend(notes);
    }
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(ev) = events.recv().await {
            let (text, ended) = match ev {
                CommandEvent::Stdout(b) | CommandEvent::Stderr(b) => (String::from_utf8_lossy(&b).trim_end().to_string(), false),
                CommandEvent::Error(e) => (format!("[error] {e}"), false),
                CommandEvent::Terminated(p) => (format!("[server stopped, exit code {:?}]", p.code), true),
                _ => continue,
            };
            if let Ok(mut l) = lines.lock() {
                l.push(text);
                let n = l.len();
                if n > 200 {
                    l.drain(0..n - 200);
                }
            }
            if ended {
                // Let the next host_start try again.
                if let Ok(mut s) = handle.state::<Host>().0.lock() {
                    *s = None;
                }
            }
        }
    });
    Ok(format!("http://localhost:{port}"))
}

#[tauri::command]
fn host_log(log: tauri::State<'_, HostLog>) -> Vec<String> {
    log.0.lock().map(|l| l.clone()).unwrap_or_default()
}

#[tauri::command]
fn host_stop(state: tauri::State<'_, Host>) -> Result<(), String> {
    if let Some((child, _)) = state.0.lock().map_err(|e| e.to_string())?.take() {
        child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Stop a bundled tribe server left running by an older copy of the app (it holds port 4747 and its own
/// .exe, which blocks updates). Only our own sidecar binary is targeted.
#[tauri::command]
fn host_kill_stale(state: tauri::State<'_, Host>) -> Result<(), String> {
    if let Some((child, _)) = state.0.lock().map_err(|e| e.to_string())?.take() {
        let _ = child.kill();
    }
    kill_stale_sidecars();
    Ok(())
}

/// fix/p15-updates: stop the TribeCode server on `port` cleanly, whoever started it (this app's sidecar, an older copy,
/// `npm start`): our own child first, then POST /api/admin/shutdown with the shared secret. Waits up to 4 s for the port.
/// Used before an update installs (a running tribecode-server.exe is locked and would stay the old one) and by the
/// stale-server check. True when the port is free afterwards.
#[tauri::command]
fn host_shutdown(state: tauri::State<'_, Host>, port: u16) -> bool {
    if let Ok(mut s) = state.0.lock() {
        if let Some((child, p)) = s.take() {
            let _ = child.kill();
            if p != port {
                let _ = ask_shutdown(p);
            }
        }
    }
    if !port_free(port) && is_tribecode(port) {
        let _ = ask_shutdown(port);
    }
    wait_port_free(port, 4000)
}

#[tauri::command]
fn host_status(state: tauri::State<'_, Host>) -> Option<u16> {
    state.0.lock().ok().and_then(|s| s.as_ref().map(|(_, p)| *p))
}

/// feat/easy-start: what the app needs to say why a start failed: (the port our own server runs on, if any; is `port`
/// free; does a TribeCode server answer on `port`).
#[tauri::command]
fn host_diag(state: tauri::State<'_, Host>, port: u16) -> (Option<u16>, bool, bool) {
    let running = state.0.lock().ok().and_then(|s| s.as_ref().map(|(_, p)| *p));
    let free = port_free(port);
    (running, free, !free && is_tribecode(port))
}

fn main() {
    clear_stale_web_cache();   // before the web view opens, so it starts from this version's files
    let app = tauri::Builder::default()
        // Must be first: a second launch (e.g. clicking a tribecode:// invite) focuses this window
        // and forwards the link to it instead of opening another copy.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .manage(Host(Mutex::new(None)))
        .manage(HostLog(Arc::new(Mutex::new(Vec::new()))))
        .invoke_handler(tauri::generate_handler![host_start, host_stop, host_status, host_diag, host_log, host_kill_stale, host_shutdown, clear_web_cache_and_restart])
        .setup(|app| {
            // Register tribecode:// at runtime too (needed for dev builds on Windows and Linux).
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }
            // fix/security-2: only the bundled page gets IPC by default. The Working dev lane (http://localhost:4848, any
            // program could listen there) gets it only when the developer turns it on.
            if working_lane_enabled() {
                let _ = app.add_capability(include_str!("../dev-capabilities/working-lane.json"));
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building TribeCode");

    app.run(|handle, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            if let Some((child, _)) = handle.state::<Host>().0.lock().ok().and_then(|mut s| s.take()) {
                let _ = child.kill();
            }
        }
    });
}
