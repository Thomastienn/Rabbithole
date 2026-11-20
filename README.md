# Rabbithole

A local learning workspace where every side question gets its own branch.

Ask a question, highlight a passage you don't understand, and explore it in a child conversation. The original thread stays intact, and every conversation shows up as a box on a map you can pan, fold and come back to. Everything runs and saves on your computer.

<!-- Demo video and screenshots go here. -->

## Features

- Branch from any passage in a reply. The child gets that passage plus a compact snapshot of its parent's context, and branches nest to any depth.
- A learning tree map beside the chat, with pan, zoom, drag and fold.
- Claude (default) and Codex through their official CLIs and your existing plans, or any OpenAI-compatible endpoint. You can switch models mid-conversation and keep the history.
- Interactive visuals, Mermaid diagrams and narrated videos, rendered locally.
- Tutor tools for web search, page reading, image finding and offline Python, plus a memory note that carries across trees.
- Image, PDF and text attachments, with local OCR for models that can't read images.
- Full keyboard control, with optional Vim bindings.

## Quick start

You need [Node.js 24+](https://nodejs.org/) with npm.

```sh
git clone https://github.com/Thomastienn/Rabbithole.git
cd Rabbithole
npm start
```

The first run installs dependencies, sets up the video tools and a local search instance, and builds the app, so it needs internet access. Rabbithole then opens at http://127.0.0.1:4317. Later starts reuse that setup. Stop it with Ctrl+C.

```sh
npm run serve                # start without opening a browser
npm start -- --port 4318     # use another port (or set RABBITHOLE_PORT)
```

Startup checks for system libraries such as Cairo and Pango and prints the install command for anything missing. Video rendering needs Linux with bubblewrap.

## Connect a model

You can open saved trees without a provider. To get new replies, set up at least one:

| Provider | Setup |
| --- | --- |
| Claude (default) | Install [Claude Code](https://code.claude.com/docs/en/setup), then run `claude` and sign in. |
| Codex | `npm install -g @openai/codex`, then **Map menu → Settings → Continue with ChatGPT**. |
| Custom endpoint | **Map menu → Settings → Connections → Add endpoint**, with an OpenAI-compatible base URL and API key. |

Claude and Codex use your plan's sign-in. Rabbithole has no API-key fallback for them.

## Desktop app

`npm run desktop:build` builds a Linux AppImage or an unsigned Windows installer. It needs Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). See [Setup](docs/guide/setup.md#linux-desktop-app).

## Data and privacy

Trees, messages and videos are stored in `~/.local/share/rabbithole` (or `$XDG_DATA_HOME/rabbithole`). Set `RABBITHOLE_DATA_DIR` to use another folder. The files are not encrypted, so back the folder up before you upgrade.

The server only listens on `127.0.0.1`, and the app has no telemetry. Your questions and their branch context go to the provider you choose. Video narration goes to Microsoft's Edge TTS service.

## Documentation

- [Setup](docs/guide/setup.md): install details, desktop builds, providers and custom endpoints
- [Using Rabbithole](docs/guide/usage.md): branching, tutor features, videos and keyboard controls
- [Data, backups and privacy](docs/guide/data-and-privacy.md): storage, upgrades, restore and network use
- [Troubleshooting](docs/guide/troubleshooting.md)
- [Changelog](CHANGELOG.md)

## Development

```sh
npm test         # unit and component tests
npm run build    # type-check and build
npm run verify   # smoke browser scripts (needs agent-browser)
```

More in [Setup › Development checks](docs/guide/setup.md#development-checks).
