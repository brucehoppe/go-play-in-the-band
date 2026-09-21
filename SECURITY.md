# Security

Go Play in the Band is a thought experiment and proof of concept, kept up on a best-effort
basis. Only the latest commit on `main` (and the live demo built from it) is supported.

## Reporting a problem

Please report privately, not in a public issue: use **Report a vulnerability** on the
repository's [Security tab](https://github.com/brucehoppe/go-play-in-the-band/security/advisories/new).
Say what you did, what happened, and what you expected. Expect a reply within about two weeks.

## What matters here

- **Your audio stays on your computer.** The web app makes no network requests except to the
  optional local backend at `127.0.0.1:8765` (and, in the local app, a heartbeat to itself). Anything that sends audio or data elsewhere is a bug.
- **Content-Security-Policy.** The built app ships a strict policy: no inline scripts and no
  external origins. A way around it is a security issue.
- **The optional backend** listens on 127.0.0.1 only, accepts uploads up to 200 MB, answers only this app's own origins (the dev server, the local app and the hosted demo), and serves
  only `.wav` files from its own cache, addressed by a SHA-256 hash. Path tricks or a way to
  reach it from another machine or website are security issues.
- **The local app** (`desktop/`) serves the built web app on 127.0.0.1 only, answers only
  requests whose Host is `127.0.0.1` or `localhost` (so another website cannot reach it by DNS
  rebinding), accepts GET and HEAD only, and serves only files embedded at build time.
- **Stored data.** Takes and the latency setting are kept in your browser (IndexedDB and
  localStorage) and are validated when read.

Out of scope: problems that need a modified browser or physical access to your computer.
