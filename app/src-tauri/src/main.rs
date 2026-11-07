// Hide the console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

/// The tribe server this app is hosting, if any (bundled as a sidecar binary).
struct Host(Mutex<Option<(CommandChild, u16)>>);
/// The last lines the server printed, so the app can show why it didn't start.
struct HostLog(Arc<Mutex<Vec<String>>>);

fn port_free(port: u16) -> bool {
    std::net::TcpListener::bind(("127.0.0.1", port)).is_ok()
}

#[tauri::command]
fn host_start(app: tauri::AppHandle, state: tauri::State<'_, Host>, port: u16, dir: String, name: String) -> Result<String, String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some((_, p)) = slot.as_ref() {
        return Ok(format!("http://localhost:{p}"));
    }
    // Something already listens on the port (often TribeCode started from the repo or another copy of
    // the app): use it instead of starting a second server on the same folder.
    if !port_free(port) {
        return Ok(format!("http://localhost:{port}"));
    }
    let ui = app
        .path()
        .resolve("ui", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let port_s = port.to_string();
    let ui_s = ui.to_string_lossy().to_string();
    let (mut events, child) = app
        .shell()
        .sidecar("tribecode-server")
        .map_err(|e| e.to_string())?
        .args(["--port", port_s.as_str(), "--dir", dir.as_str(), "--name", name.as_str(), "--ui", ui_s.as_str(), "--exit-with-parent"])
        .spawn()
        .map_err(|e| format!("could not start the tribe server: {e}"))?;
    *slot = Some((child, port));
    let lines = app.state::<HostLog>().0.clone();
    if let Ok(mut l) = lines.lock() {
        l.clear();
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

#[tauri::command]
fn host_status(state: tauri::State<'_, Host>) -> Option<u16> {
    state.0.lock().ok().and_then(|s| s.as_ref().map(|(_, p)| *p))
}

fn main() {
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
        .invoke_handler(tauri::generate_handler![host_start, host_stop, host_status, host_log])
        .setup(|app| {
            // Register tribecode:// at runtime too (needed for dev builds on Windows and Linux).
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building TribeCode");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some((child, _)) = handle.state::<Host>().0.lock().ok().and_then(|mut s| s.take()) {
                let _ = child.kill();
            }
        }
    });
}
