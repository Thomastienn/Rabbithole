# On Windows one learner-chosen folder holds the app and its data

ADR 0019 installs the Windows app per user with a one-click installer into a fixed program folder, and keeps everything that changes, including add-ons and learning trees, in a separate data folder under `%APPDATA%`. The learner cannot choose where any of it goes, and uninstalling leaves gigabytes of add-ons and data behind. We decided that the Windows installer asks for a location, defaulting to today's, and always installs into a folder named Rabbithole there. That install folder holds the app, its add-ons and a `data` folder with the learner's learning trees, videos and settings. The app still never writes into its own app files. Updates keep the `data` folder. Uninstalling offers "Also delete my learning trees, videos and add-ons", ticked by default, so a learner who removes the app removes everything unless they choose to keep their data. On first launch after this change, an existing `%APPDATA%\rabbithole` folder moves into the new `data` folder, so nothing is reinstalled or lost. Linux is unchanged.

We accepted that a default uninstall deletes the learner's data, and that the updater must be proven not to remove the `data` folder, in exchange for an install the learner controls in one place and an uninstall that leaves nothing behind.

This supersedes the part of ADR 0019 that keeps the data folder apart from the app on Windows. Running in place and never writing into the app's own files still stand.

## Considered Options

- Keep data under `%APPDATA%` and only let the learner choose the app's folder. Add-ons and data, the large part, would still go where the learner did not choose.
- Leave data behind on uninstall, as most apps do. The owner wants an uninstall to clear everything unless the learner says otherwise.
- Ask on every uninstall with nothing ticked. Most learners removing the app want it gone; the default should do that.
