# The app installs Claude Code and Codex on request

ADR 0011 left the Claude Code and Codex command-line tools outside the app, and first-run setup told the learner to install them in a terminal with Linux commands, even on Windows, then to run `claude` in a terminal to sign in. Learners who do not use a terminal stop there. We decided that first-run setup and Settings show an Install button for each missing tool, which runs that tool's official installer in the background (`install.ps1` through PowerShell on Windows, `install.sh` on Linux), shows its progress like a download and checks for the tool again when it finishes; a Sign in button then signs in to Claude without a terminal, as Codex already does inside the app. Both installers write into the learner's own folders, so neither needs administrator rights. The command stays visible, in PowerShell form on Windows, for anyone who prefers to run it themselves or whose install failed. The app also finds Codex where the Windows installer puts it. Because the owner has no Windows machine, the Desktop build workflow's first job installs both tools on a Windows runner the same way and fails the run fast if either install or the app's detection breaks.

We accepted that the app now runs installer scripts fetched from Anthropic's and OpenAI's servers at the learner's request, and depends on those scripts staying non-interactive, in exchange for a setup a learner can finish without a terminal. The tools are still not bundled: each comes from its official source and updates itself as it would after a manual install.

This supersedes the part of ADR 0011 that leaves installing the tools to the learner; not bundling them still stands.

## Considered Options

- Keep the terminal instructions and fix only the Windows commands. Still blocks learners who never open a terminal.
- Install through npm in the background. Needs Node on the learner's PATH and is no longer the vendors' recommended install.
- Bundle both tools in the installer. Adds size and makes the app responsible for updating them.
- Reuse the ChatGPT desktop app if installed. It does not provide the Codex command-line tool the app runs.
