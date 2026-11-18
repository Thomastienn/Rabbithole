#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

// Entries of app.tar; a new build replaces exactly these and keeps the tool folders the download manager fills.
const APP: [&str; 8] = [
    "dist",
    "server",
    "scripts",
    "src",
    "node_modules",
    "node",
    "package.json",
    "package-lock.json",
];

struct Server(Mutex<Option<Child>>);

// The bundle is read-only (an AppImage mount), but the server writes its tools beside its code, so it runs from a copy.
fn app_root() -> PathBuf {
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".local/share")
        })
        .join("rabbithole-app")
}

fn install(resources: &Path, root: &Path) -> std::io::Result<()> {
    let build = fs::read_to_string(resources.join("app.build"))?;
    let stamp = root.join(".build");
    if fs::read_to_string(&stamp).ok().as_deref() == Some(build.as_str()) {
        return Ok(());
    }
    fs::create_dir_all(root)?;
    let _ = fs::remove_file(&stamp);
    // The video browser lives in node_modules/.remotion; keep it across app updates.
    let (browser, kept) = (root.join("node_modules/.remotion"), root.join(".remotion"));
    if browser.exists() && !kept.exists() {
        fs::rename(&browser, &kept)?;
    }
    for name in APP {
        let path = root.join(name);
        if path.is_dir() {
            fs::remove_dir_all(&path)?;
        } else if path.exists() {
            fs::remove_file(&path)?;
        }
    }
    let status = Command::new("tar")
        .arg("-xf")
        .arg(resources.join("app.tar"))
        .arg("-C")
        .arg(root)
        .status()?;
    if !status.success() {
        return Err(std::io::Error::other(format!("tar exited with {status}")));
    }
    if kept.exists() {
        fs::create_dir_all(root.join("node_modules"))?;
        fs::rename(&kept, &browser)?;
    }
    fs::write(&stamp, build)
}

fn show_error(window: &WebviewWindow, message: &str) {
    let _ = window.eval(format!(
        "document.getElementById('status').outerHTML = '<pre id=status></pre>'; document.getElementById('status').textContent = {message:?};"
    ));
}

// Runs on its own thread for the server's lifetime: Linux delivers PDEATHSIG when the spawning thread exits.
fn run_server(app: AppHandle, window: WebviewWindow) {
    let root = app_root();
    let resources = match app.path().resource_dir() {
        Ok(dir) => dir,
        Err(error) => return show_error(&window, &error.to_string()),
    };
    if let Err(error) = install(&resources, &root) {
        return show_error(
            &window,
            &format!("Rabbithole could not unpack into {}: {error}. Check free disk space, then reopen it.", root.display()),
        );
    }
    let spawned = (|| {
        let (reader, writer) = std::io::pipe()?;
        let mut command = Command::new(root.join("node"));
        command
            .args(["server/main.mjs", "--port", "0"])
            .current_dir(&root)
            .stdout(writer.try_clone()?)
            .stderr(writer);
        #[cfg(target_os = "linux")]
        unsafe {
            use std::os::unix::process::CommandExt;
            // If the shell dies without a clean exit, the server still shuts down and releases the data folder.
            command.pre_exec(|| {
                libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM);
                Ok(())
            });
        }
        let child = command.spawn()?;
        drop(command); // closes this process's copies of the pipe so reading ends when the server exits
        std::io::Result::Ok((child, reader))
    })();
    let (child, reader) = match spawned {
        Ok(spawned) => spawned,
        Err(error) => {
            return show_error(
                &window,
                &format!("Rabbithole could not start its server: {error}"),
            )
        }
    };
    *app.state::<Server>().0.lock().unwrap() = Some(child);
    let (mut log, mut listening) = (String::new(), false);
    for line in BufReader::new(reader).lines().map_while(Result::ok) {
        println!("{line}");
        if listening {
            continue;
        }
        match line
            .strip_prefix("Rabbithole: ")
            .and_then(|url| url.parse().ok())
        {
            Some(url) => {
                listening = true;
                let _ = window.navigate(url);
            }
            None => log += &format!("{line}\n"),
        }
    }
    if !listening {
        show_error(&window, &log);
    }
}

// Runs on the GTK main thread inside WebKit's download callback, so GTK's own dialog fits; rfd would start a second GTK thread.
#[cfg(target_os = "linux")]
fn save_as(suggested: &Path) -> Option<PathBuf> {
    use gtk::prelude::*;
    let dialog = gtk::FileChooserNative::new(
        Some("Save file"),
        None::<&gtk::Window>,
        gtk::FileChooserAction::Save,
        Some("Save"),
        Some("Cancel"),
    );
    dialog.set_do_overwrite_confirmation(true);
    if let Some(name) = suggested.file_name() {
        dialog.set_current_name(&name.to_string_lossy());
    }
    if let Some(dir) = suggested.parent() {
        dialog.set_current_folder(dir);
    }
    (dialog.run() == gtk::ResponseType::Accept)
        .then(|| dialog.filename())
        .flatten()
}

#[cfg(not(target_os = "linux"))]
fn save_as(suggested: &Path) -> Option<PathBuf> {
    let mut dialog = rfd::FileDialog::new();
    if let Some(name) = suggested.file_name() {
        dialog = dialog.set_file_name(name.to_string_lossy());
    }
    if let Some(dir) = suggested.parent() {
        dialog = dialog.set_directory(dir);
    }
    dialog.save_file()
}

// SIGTERM lets the server stop jobs, close the database and release its data-folder lock.
fn stop_server(app: &AppHandle) {
    let Some(mut child) = app.state::<Server>().0.lock().unwrap().take() else {
        return;
    };
    #[cfg(unix)]
    unsafe {
        libc::kill(child.id() as i32, libc::SIGTERM);
    }
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        if !matches!(child.try_wait(), Ok(None)) {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn main() {
    tauri::Builder::default()
        .manage(Server(Mutex::new(None)))
        .setup(|app| {
            let window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("Rabbithole")
                    .inner_size(1280.0, 840.0)
                    // Downloads, such as an exported MP4, ask where to save with the native dialog.
                    .on_download(|_, event| {
                        if let DownloadEvent::Requested { destination, .. } = event {
                            match save_as(destination) {
                                Some(path) => *destination = path,
                                None => return false,
                            }
                        }
                        true
                    })
                    // Links that open a new tab, such as sign-in pages, open in the learner's browser.
                    .on_new_window(|url, _| {
                        let _ = Command::new("xdg-open").arg(url.as_str()).spawn();
                        NewWindowResponse::Deny
                    })
                    .build()?;
            let handle = app.handle().clone();
            std::thread::spawn(move || run_server(handle, window));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Rabbithole could not open its window")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                stop_server(app);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_replaces_app_files_and_keeps_tools() {
        let dir = std::env::temp_dir().join(format!("rh-install-{}", std::process::id()));
        let (src, res, root) = (dir.join("src"), dir.join("res"), dir.join("root"));
        fs::create_dir_all(src.join("server")).unwrap();
        fs::write(src.join("server/main.mjs"), "new").unwrap();
        fs::create_dir_all(&res).unwrap();
        Command::new("tar")
            .arg("-cf")
            .arg(res.join("app.tar"))
            .arg("-C")
            .arg(&src)
            .arg(".")
            .status()
            .unwrap();
        fs::write(res.join("app.build"), "b2").unwrap();
        for path in [
            "server/old.mjs",
            ".venv/python",
            "node_modules/.remotion/chrome",
            "node_modules/stale/index.js",
        ] {
            fs::create_dir_all(root.join(path).parent().unwrap()).unwrap();
            fs::write(root.join(path), "x").unwrap();
        }
        install(&res, &root).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("server/main.mjs")).unwrap(),
            "new"
        );
        assert!(!root.join("server/old.mjs").exists() && !root.join("node_modules/stale").exists());
        assert!(
            root.join(".venv/python").exists()
                && root.join("node_modules/.remotion/chrome").exists()
        );
        // Same stamp: nothing is unpacked again.
        fs::write(root.join("server/main.mjs"), "edited").unwrap();
        install(&res, &root).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("server/main.mjs")).unwrap(),
            "edited"
        );
        fs::remove_dir_all(&dir).unwrap();
    }
}
