# One-click Claude and Codex, a first-launch progress bar and a chosen Windows install folder

Decided with the project owner on 2026-11-25 (grilling session). Terms follow `GLOSSARY.md` (learner, first-run setup, add-on, download, install folder, chat model). Respects ADR 0019 (Electron desktop) and ADR 0020 (add-ons installed on request); ADR 0024 records installing the command-line tools and ADR 0025 the install folder.

## Problem Statement

First-run setup tells a learner without Claude Code or Codex to run a terminal command, and the commands are Linux ones even on Windows (`curl … | bash`, `npm install -g @openai/codex`). Signing in to Claude means running `claude` in a terminal. A learner who doesn't use a terminal cannot get past setup. The app also misses Codex when the official Windows installer put it in its own folder.

On first launch the app shows its logo and "Starting…" for 10 to 20 seconds with nothing moving toward done, so it looks frozen.

The Windows installer installs at once into a fixed folder and puts the learner's data, add-ons included, in a different folder under `%APPDATA%`. The learner cannot choose where the app goes, and uninstalling leaves gigabytes behind.

The owner has no Windows machine, so a broken Windows install is found only by a learner.

## Solution

First-run setup and Settings show an Install button for each missing tool. It runs the tool's official installer in the background, PowerShell on Windows, with progress shown like a download, then checks for the tool again on its own. A Sign in button signs in to Claude without a terminal, as Codex already does. The command stays visible, in the right form for the learner's system, for anyone who prefers it or whose install failed. No administrator rights are needed.

The first launch shows a progress bar under "Starting…" that moves steadily and finishes when the app is ready.

The Windows installer asks where to install, defaulting to today's location, and always installs into a Rabbithole folder there. That install folder holds the app, its add-ons and the learner's data. Updates keep the data. Uninstalling offers "Also delete my learning trees, videos and add-ons", ticked by default. Data in the old `%APPDATA%\rabbithole` folder moves into the new folder on first launch.

The Desktop build workflow first installs Claude Code and Codex on a Windows runner the way the app does, and stops the run at once if that breaks.

## User Stories

1. As a learner without Claude Code, I want an Install button, so that I don't need a terminal.
2. As a learner without Codex, I want an Install button, so that I don't need a terminal.
3. As a learner, I want the install to run in the background with visible progress, so that I know it's working.
4. As a learner, I want the app to check for the tool again when the install finishes, so that I don't have to press anything.
5. As a learner, I want a clear message and a Retry button when an install fails, so that I can try again.
6. As a learner, I want to see the command the button runs, so that I can run it myself if I prefer.
7. As a learner on Windows, I want that command in PowerShell form, so that it works when I paste it.
8. As a learner on Linux, I want the command in shell form, so that it works in my terminal.
9. As a learner, I want the install to need no administrator rights, so that it works on a computer I don't administer.
10. As a learner, I want the tools installed from their official sources, so that I can trust them and they update themselves.
11. As a learner, I want a Sign in button for Claude, so that I can sign in without a terminal.
12. As a learner, I want the sign-in page opened in my browser, so that I sign in where I normally do.
13. As a learner, I want the app to notice when I've signed in, so that setup moves on without me checking.
14. As a learner, I want the same Install and Sign in buttons in Settings, so that I can add the other tool later.
15. As a learner who installed Codex with its Windows installer, I want the app to find it, so that it shows as installed.
16. As a learner, I want only one tool required, so that I can start with either.
17. As a learner opening the app for the first time, I want a progress bar while it starts, so that it doesn't look frozen.
18. As a learner, I want the bar to move steadily and finish when the app is ready, so that it feels smooth.
19. As a learner opening the app later, I want no progress bar on quick starts, so that it never slows me down.
20. As a learner using a screen reader, I want the progress announced politely, so that I know the app is starting.
21. As a learner who prefers reduced motion, I want the bar to change without animation, so that it's comfortable.
22. As a learner whose app fails to start, I want the failure shown as today, so that the bar never hides an error.
23. As a learner installing on Windows, I want to choose where the app goes, so that it fits my drives.
24. As a learner, I want today's location suggested by default, so that I can just press Next.
25. As a learner, I want the app always placed in a folder named Rabbithole, so that I pick only the location.
26. As a learner who picks a folder already named Rabbithole, I want no second Rabbithole inside it, so that the path stays clean.
27. As a learner, I want my learning trees, videos, settings and add-ons kept in that same folder, so that everything is in one place.
28. As a learner, I want updates to keep my data, so that I never lose work.
29. As a learner, I want updates to keep my add-ons, so that I don't download them again.
30. As a learner uninstalling, I want a choice to delete my learning trees, videos and add-ons, ticked by default, so that removing the app removes everything.
31. As a learner uninstalling who wants to keep my data, I want to untick that choice, so that my data stays for a reinstall.
32. As a learner upgrading from an older version, I want my existing data moved into the new folder on first launch, so that nothing is lost or reinstalled.
33. As a learner, I want the move to keep my old folder if it fails, so that a failed move never loses data.
34. As a learner, I want my window layout and app preferences kept after the move, so that the app looks as I left it.
35. As a learner on Linux, I want nothing to change, so that my install keeps working.
36. As the owner, I want the Desktop build workflow to install both tools on Windows first and fail fast, so that a broken Windows install is caught before a build.
37. As the owner, I want the workflow's installer smoke test to prove updates keep the data and uninstall removes it, so that ADR 0025 holds on a real Windows machine.

## Implementation Decisions

### Installing Claude Code and Codex

- A server route installs one tool by name, `claude` or `codex`, and reports progress through the existing downloads model, so the sidebar and setup show it like any download. One install per tool at a time; asking again while one runs returns the running one.
- The commands are the official installers, run without a terminal:
  - Claude Code: `irm https://claude.ai/install.ps1 | iex` in PowerShell on Windows; `curl -fsSL https://claude.ai/install.sh | bash` on Linux.
  - Codex: `powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"` on Windows; `curl -fsSL https://chatgpt.com/codex/install.sh | sh` on Linux; both with `CODEX_NON_INTERACTIVE=1` set.
- The installer's output goes to the server log. The download row shows indeterminate progress that eases forward and completes on exit, since the installers report no percentage.
- On success the server clears its cached tool lookup and the client reloads models, so setup moves on by itself. On failure the row shows the last line of the installer's output and a Retry button.
- The tool finder also searches `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin` on Windows, where Codex's installer puts it. A tool installed while the app runs is found without a restart.
- First-run setup and the Connections section of Settings show, for a missing tool, Install plus the command for the learner's system, PowerShell on Windows, and a link to the official setup page.
- Claude Sign in runs `claude auth login` in the background, opens the sign-in address it prints in the default browser, and polls `claude auth status` until signed in, then reloads models. If the command needs a terminal (not yet proven), the button falls back to showing the command to run. The "Run claude in a terminal" copy goes.
- Codex sign-in is unchanged.
- The startup log hint for a missing Claude Code points at the Install button, with the command for the learner's system.

### Windows check in the Desktop build workflow

- A new first job on a Windows runner, which every other job needs, runs the app's own install code for both tools, as the server would run it, then confirms the tool finder finds each and that `--version` runs. It fails the run at once if either step fails.
- It doesn't sign in; that needs an account.
- The existing Windows installer smoke test also installs the built installer, writes a file into the data folder, installs it again silently as an update, checks the file survived, then uninstalls silently and checks the install folder is gone.

### First-launch progress bar

- The starting page shows a thin progress bar under "Starting…" only when the data folder held no database before this start. That is the first launch, or the first after a fresh install.
- The bar eases toward 90 % over about 20 seconds, slowing as it nears 90 %, and jumps to 100 % when the server is ready, just before the window shows the app.
- The status line stays the polite live region. The bar has a progressbar role without a value, so screen readers don't hear every tick. With reduced motion it advances in a few steps without animation.
- A start failure hides the bar and shows the existing failure text.

### Windows install folder

- The NSIS installer becomes an assisted, per-user installer that lets the learner change the folder. The default is today's location, `%LOCALAPPDATA%\Programs\Rabbithole`.
- The installer always installs into a folder named Rabbithole at the chosen location. A chosen path that already ends in Rabbithole is used as is.
- The install folder holds the app files and a `data` folder. The desktop app passes `data` to the server as its data folder, so add-ons go in `data` with everything else, as ADR 0020 already does. The app still never writes into its own files.
- Electron's own profile, which today shares `%APPDATA%\Rabbithole` with the data folder on Windows, moves inside `data` too. The app sets its profile path before Electron starts, so the old folder is not in use when it moves.
- Uninstall removes the app files. A page with "Also delete my learning trees, videos and add-ons", ticked by default, decides whether `data` goes too. A silent uninstall deletes `data`. The uninstall the updater runs before installing a new version never deletes `data`; it replaces the default whole-folder removal with one that skips `data`.
- On first launch, when `data` holds no database and `%APPDATA%\rabbithole` exists, the app moves the old folder's contents into `data` before the server starts. It renames when both are on one drive. Otherwise it copies, checks the copy and deletes the old folder only after the check. If the move fails, the app logs it, keeps the old folder and uses it for this run.
- The smoke test's lookup of the installed app follows the new folder.
- Linux AppImage installs and data are unchanged.

## Testing Decisions

- Tests check outcomes the learner or owner sees: a tool appears as installed, data survives, the bar shows only on first launch. They don't check how commands are assembled internally.
- Install route tests, next to the existing download and add-on tests, with a fake runner in place of the installers: Windows and Linux commands are the official ones; success clears the lookup and reports done; failure reports the last output line; a second request joins the running install.
- Tool finder tests, next to the existing find-cli tests: Codex in its Windows installer folder is found.
- First-run setup and Settings component tests, next to the existing first-run and settings tests: Install and the command show for a missing tool; the Windows command is PowerShell; the Sign in button replaces the terminal copy; finishing an install moves setup on.
- Claude sign-in tests with a fake `claude`: the printed address is opened and status is polled until signed in; a command that exits needing a terminal falls back to the command copy.
- Desktop shell unit tests, next to the existing shell tests: first-launch detection; the data folder and profile path inside the install folder; migration renames, copies and verifies, and keeps the old folder when the move fails.
- The workflow's job order and the new first job are checked by the existing desktop workflow test.
- The real Windows behaviour (installers without a terminal, updates keeping `data`, uninstall removing it) is proven only on the Windows runner in the Desktop build workflow.

## Out of Scope

- Reusing the ChatGPT desktop app. It doesn't provide the Codex command-line tool the app runs.
- Bundling either tool in the installer.
- Code signing.
- An install folder choice on Linux.
- A progress bar on later launches.
- Installing Node or npm for the learner.

## Further Notes

- Not yet proven: that `claude auth login` works without a terminal, and that electron-builder's update keeps a `data` folder inside the install folder once the uninstall step skips it. The Windows checks above must prove both before release.
- `npm start` on Windows keeps `%APPDATA%\rabbithole` as its default data folder. After the move, it no longer shares data with an installed desktop app unless pointed at the install folder's `data`. Only a Windows developer is affected.
