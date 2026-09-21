//! The instrument splitter (Demucs, in Python) is too big to live inside this program, so
//! `scripts/install` puts it in `~/.go-play-in-the-band/venv`. When it is there, the app starts it
//! on 127.0.0.1:8765 and stops it on the way out. When it is not, the app works without it.

use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

/// The server's own code travels inside this program, so it always matches the app.
const SERVER_FILES: [(&str, &str); 2] = [
    ("app.py", include_str!("../../server/app.py")),
    ("cache.py", include_str!("../../server/cache.py")),
];
pub const PORT: u16 = 8765;

static CHILD: Mutex<Option<Child>> = Mutex::new(None);

/// `~/.go-play-in-the-band`, shared with the install scripts and the server's cache.
pub fn root(home: &Path) -> PathBuf {
    home.join(".go-play-in-the-band")
}

/// Where a Python virtual environment keeps its interpreter on this system.
pub fn python(root: &Path) -> PathBuf {
    if cfg!(windows) {
        root.join("venv").join("Scripts").join("python.exe")
    } else {
        root.join("venv").join("bin").join("python")
    }
}

fn home() -> Option<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from)
}

/// The child's PATH. An app opened from Finder gets a bare one, without the folders where
/// Homebrew puts ffmpeg, and Demucs needs ffmpeg to read MP3 and M4A.
pub fn path_with_tools(current: &str) -> String {
    if cfg!(windows) {
        return current.to_string();
    }
    let mut parts: Vec<&str> = current.split(':').filter(|p| !p.is_empty()).collect();
    for extra in ["/opt/homebrew/bin", "/usr/local/bin"] {
        if !parts.contains(&extra) {
            parts.push(extra);
        }
    }
    parts.join(":")
}

fn answering() -> bool {
    TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], PORT)), Duration::from_millis(300)).is_ok()
}

/// Start the splitter if it is installed. Says what happened, in words for the terminal.
pub fn start() -> String {
    let Some(root) = home().map(|h| root(&h)) else {
        return "Instrument splitter: no home folder, so it was not started.".into();
    };
    let py = python(&root);
    if !py.is_file() {
        return "Instrument splitter: not installed. Install it with scripts/install (about 1 GB); everything else works.".into();
    }
    if answering() {
        return "Instrument splitter: already running.".into();
    }
    let dir = root.join("server");
    if let Err(e) = std::fs::create_dir_all(&dir) {
        return format!("Instrument splitter: could not create {}: {e}", dir.display());
    }
    for (name, text) in SERVER_FILES {
        if let Err(e) = std::fs::write(dir.join(name), text) {
            return format!("Instrument splitter: could not write {name}: {e}");
        }
    }
    let log = std::fs::File::create(root.join("splitter.log")).ok();
    let (out, err) = match log.as_ref().and_then(|f| f.try_clone().ok()) {
        Some(copy) => (Stdio::from(copy), log.map(Stdio::from).unwrap_or_else(Stdio::null)),
        None => (Stdio::null(), Stdio::null()),
    };
    let spawned = Command::new(&py)
        .args(["-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", &PORT.to_string()])
        .current_dir(&dir)
        .env("PATH", path_with_tools(&std::env::var("PATH").unwrap_or_default()))
        // The server stops by itself if this program dies without saying goodbye.
        .env("GPITB_PARENT_PID", std::process::id().to_string())
        .stdin(Stdio::null())
        .stdout(out)
        .stderr(err)
        .spawn();
    match spawned {
        Ok(child) => {
            *CHILD.lock().unwrap() = Some(child);
            format!("Instrument splitter: started (log: {}).", root.join("splitter.log").display())
        }
        Err(e) => format!("Instrument splitter: could not start: {e}"),
    }
}

/// Stop the splitter, if this program started it.
pub fn stop() {
    if let Some(mut child) = CHILD.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn looks_in_the_folder_the_install_script_uses() {
        let py = python(&root(Path::new("/Users/someone")));
        let expect = if cfg!(windows) { "venv\\Scripts\\python.exe" } else { ".go-play-in-the-band/venv/bin/python" };
        assert!(py.to_string_lossy().ends_with(expect), "{}", py.display());
    }

    #[cfg(not(windows))]
    #[test]
    fn the_child_can_find_ffmpeg_even_from_finder() {
        assert_eq!(path_with_tools("/usr/bin:/bin"), "/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin");
        assert_eq!(path_with_tools(""), "/opt/homebrew/bin:/usr/local/bin");
        assert_eq!(path_with_tools("/opt/homebrew/bin:/usr/bin"), "/opt/homebrew/bin:/usr/bin:/usr/local/bin");
    }

    #[test]
    fn the_server_code_is_inside_the_program() {
        for (name, text) in SERVER_FILES {
            assert!(!text.is_empty(), "{name}");
        }
        assert!(SERVER_FILES[0].1.contains("FastAPI"));
    }
}
