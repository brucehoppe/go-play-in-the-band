//! Go Play in the Band as a local app. The built web app (`web/dist`) is embedded in this one
//! file, served on 127.0.0.1 only, and opened in the default browser. The page sends a
//! heartbeat while it is open; the program exits by itself a while after the last one.

use include_dir::{include_dir, Dir};
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

static SITE: Dir = include_dir!("$CARGO_MANIFEST_DIR/../web/dist");

const PORT: u16 = 8766;
/// Background tabs may only get a timer once a minute, so allow a few missed heartbeats.
const QUIET_AFTER_HEARTBEAT: u64 = 150;
/// If no page ever says hello (the browser did not open), give up after this long.
const QUIET_FROM_START: u64 = 600;
/// Tells the page it is running locally, so it sends heartbeats. The hosted demo never has this.
const LOCAL_MARK: &str = "<meta name=\"gpitb-local\" content=\"1\" />";

fn mime(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "wasm" => "application/wasm",
        "svg" => "image/svg+xml",
        "json" | "map" => "application/json",
        "webmanifest" => "application/manifest+json",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "png" => "image/png",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// The embedded file path for a request target, or None if it is not a plain relative path.
fn site_path(target: &str) -> Option<String> {
    let path = target.split(['?', '#']).next()?.strip_prefix('/')?;
    if path.split('/').any(|part| part == ".." || part == "." || part.contains('\\') || part.contains(':')) {
        return None;
    }
    Some(if path.is_empty() || path.ends_with('/') { format!("{path}index.html") } else { path.to_string() })
}

/// Only answer requests addressed to this computer, so another website cannot reach the app by
/// pointing its own name at 127.0.0.1 (DNS rebinding).
fn host_ok(host: &str, port: u16) -> bool {
    host == format!("127.0.0.1:{port}") || host == format!("localhost:{port}")
}

fn respond(stream: &mut TcpStream, status: &str, kind: &str, body: &[u8], head_only: bool) {
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(head.as_bytes());
    if !head_only {
        let _ = stream.write_all(body);
    }
}

fn handle(mut stream: TcpStream, port: u16, started: Instant, last_beat: &AtomicU64) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let mut reader = BufReader::new(match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    });
    let mut line = String::new();
    if reader.read_line(&mut line).is_err() {
        return;
    }
    let mut parts = line.split_whitespace();
    let (method, target) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
    let mut host = String::new();
    loop {
        let mut h = String::new();
        if reader.read_line(&mut h).unwrap_or(0) == 0 || h == "\r\n" || h == "\n" {
            break;
        }
        if let Some((name, value)) = h.split_once(':') {
            if name.eq_ignore_ascii_case("host") {
                host = value.trim().to_string();
            }
        }
    }
    let head_only = method == "HEAD";
    if method != "GET" && !head_only {
        return respond(&mut stream, "405 Method Not Allowed", "text/plain", b"GET only", false);
    }
    if !host_ok(&host, port) {
        return respond(&mut stream, "403 Forbidden", "text/plain", b"wrong host", head_only);
    }
    if target == "/__alive" {
        last_beat.store(started.elapsed().as_secs().max(1), Ordering::Relaxed);
        return respond(&mut stream, "204 No Content", "text/plain", b"", head_only);
    }
    match site_path(target).and_then(|p| SITE.get_file(&p).map(|f| (p, f))) {
        Some((path, file)) if path == "index.html" => {
            let page = String::from_utf8_lossy(file.contents()).replacen("<head>", &format!("<head>\n    {LOCAL_MARK}"), 1);
            respond(&mut stream, "200 OK", mime(&path), page.as_bytes(), head_only)
        }
        Some((path, file)) => respond(&mut stream, "200 OK", mime(&path), file.contents(), head_only),
        None => respond(&mut stream, "404 Not Found", "text/plain", b"not found", head_only),
    }
}

fn open_browser(url: &str) {
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(url).spawn();
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("cmd").args(["/C", "start", "", url]).spawn();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let result = std::process::Command::new("xdg-open").arg(url).spawn();
    if result.is_err() {
        println!("Open this address in your browser: {url}");
    }
}

fn main() {
    if std::env::args().any(|a| a == "--version") {
        println!("go-play-in-the-band {}", env!("CARGO_PKG_VERSION"));
        return;
    }
    // The usual port if it is free (so saved takes are found again), otherwise any free port.
    let listener = TcpListener::bind(("127.0.0.1", PORT))
        .or_else(|_| TcpListener::bind(("127.0.0.1", 0)))
        .expect("could not open a local port");
    let port = listener.local_addr().expect("no local address").port();
    let url = format!("http://127.0.0.1:{port}/");
    println!("Go Play in the Band is running at {url}");
    println!("It stops by itself a couple of minutes after you close the page. Ctrl+C stops it now.");
    if !std::env::args().any(|a| a == "--no-open") {
        open_browser(&url);
    }

    let started = Instant::now();
    let last_beat = Arc::new(AtomicU64::new(0));
    let watch = Arc::clone(&last_beat);
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(5));
        let (now, beat) = (started.elapsed().as_secs(), watch.load(Ordering::Relaxed));
        if (beat > 0 && now - beat > QUIET_AFTER_HEARTBEAT) || (beat == 0 && now > QUIET_FROM_START) {
            std::process::exit(0);
        }
    });
    for stream in listener.incoming().flatten() {
        let beat = Arc::clone(&last_beat);
        std::thread::spawn(move || handle(stream, port, started, &beat));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_targets_to_embedded_paths() {
        assert_eq!(site_path("/").as_deref(), Some("index.html"));
        assert_eq!(site_path("/assets/a.js?v=1").as_deref(), Some("assets/a.js"));
        assert_eq!(site_path("/sw.js#x").as_deref(), Some("sw.js"));
    }

    #[test]
    fn refuses_path_tricks() {
        for bad in ["/../etc/passwd", "/a/../../b", "/a\\b", "/c:/x", "no-slash", "/./x"] {
            assert_eq!(site_path(bad), None, "{bad}");
        }
    }

    #[test]
    fn only_local_hosts_are_answered() {
        assert!(host_ok("127.0.0.1:8766", 8766));
        assert!(host_ok("localhost:8766", 8766));
        assert!(!host_ok("evil.example:8766", 8766));
        assert!(!host_ok("127.0.0.1:9999", 8766));
        assert!(!host_ok("", 8766));
    }

    #[test]
    fn wasm_and_scripts_get_types_the_browser_accepts() {
        assert_eq!(mime("assets/dsp_core_bg.wasm"), "application/wasm");
        assert!(mime("assets/index.js").starts_with("text/javascript"));
        assert_eq!(mime("mystery"), "application/octet-stream");
    }

    #[test]
    fn the_web_app_is_embedded() {
        assert!(SITE.get_file("index.html").is_some(), "build the web app first: cd web && npm run build");
    }
}
