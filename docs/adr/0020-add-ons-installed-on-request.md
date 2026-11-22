# Video tools, offline Python and web search are add-ons installed on request

ADR 0019 bundled Python, Manim, TinyTeX and the video browser so videos worked on first launch, and the installers grew to about 1 GB (1.08 GB AppImage, 940 MB Windows installer). Most of that is tools a learner who only chats never uses. We decided the installer carries only what chatting needs: Electron, the pinned Node, the app and, on Windows, the sandbox launcher. Video tools, offline Python and web search become add-ons the learner installs on request, from a last step of first-run setup (install each, install all, or skip) or from the Add-ons page in Settings, and they download in the background into the data folder, so the app still never writes into its own folder. Video tools need offline Python, which they share. A video asked for without video tools is still made and waits with an Install button. An installed add-on whose pinned version no longer matches after an app update updates itself; one never installed stays untouched. `npm start` and the desktop app follow the same rule through the same setup code.

Add-ons come from upstream, as `npm start` already gets them: a standalone Python through uv, PyPI wheels, TinyTeX's official release and the video browser through Remotion, every version pinned. PyPI has no Linux wheels for pycairo and manimpango, which Manim needs, so CI builds manylinux wheels of them with `auditwheel` and attaches them to a GitHub release, and the Linux install finds them with `--find-links`; Windows uses PyPI's wheels. We accepted that the first video waits for a download of about 1 GB, and that installs depend on several upstream hosts being reachable, in exchange for a far smaller installer and one install path for development and desktop.

This supersedes ADR 0019's bundled video tools. Its Electron shell, run-in-place layout and sandboxing still stand.

## Considered Options

- Keep bundling every tool (ADR 0019). Videos work at once, but every learner downloads about 1 GB, most of it unused.
- One prebuilt archive per add-on on each release, as LM Studio and Jan ship their runtimes. Every learner gets the bits CI tested from one host, but each release uploads about 1 GB and the desktop gets a second install path beside `npm start`'s.
- Install from upstream only, as ComfyUI Desktop does. On Linux this builds pycairo and manimpango from source, so the learner would need a compiler and the Cairo and Pango development packages.
- Download add-ons automatically after first-run setup. Learners who only chat would still pay for the downloads.
