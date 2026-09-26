# Contributing

Keep the framework small, portable, and understandable. The Python CLI uses the standard library and must run on Python 3.9+ on Linux, macOS, and Windows. Invoke programs with argument arrays, preserve UTF-8 text, reject unsafe names, and never overwrite an existing destination or reinitialize an existing Git repository.

The recommended editor experience is VS Code with the Gatex companion extension, LaTeX Workshop, and a local Dev Container. Gatex presents a compact writing sidebar, creates projects from bundled starters, arranges source beside the PDF, and restores the preview; keep compilation, PDF rendering, and SyncTeX in LaTeX Workshop and Git operations in VS Code's Source Control. Keep the Dockerfile's TeX dependencies explicit, include Git for Source Control, and preserve mounted project files across container rebuilds. Normal PDF builds must work offline after setup. Keep the CLI usable with an existing host TeX installation as well.

Routine writing must work through visible, labeled controls without keyboard shortcuts or Command Palette knowledge. Keep setup files and build output out of the default Writing Files view, with an accessible Show setup files option. Put optional configuration and diagnostic controls under Advanced; do not hide errors or user source. Preserve keyboard accessibility and native VS Code theme colors in the sidebar. Avoid global editor changes that affect unrelated work.

Templates live in `templates/paper`, `templates/notes`, and `templates/common`; translated strings live in `templates/locales`. Generated projects carry their source, helper, editor settings, container definition, and README. They must remain usable after moving them or deleting the framework checkout. Update the top-level README and `templates/common/README.md` together when the workflow changes. See [localization](docs/localization.md) before adding a language.

For changes affecting creation or builds, check both paper and notes, English and Spanish, paths with spaces and accents, existing-destination rejection, Git initialization and parent-repository handling, and useful failing exits. Compile affected templates in the documented container and confirm output stays in `build/`. Check that the PDF preview refreshes and normal build artifacts do not appear in Git. State any unavailable platforms or tools in your validation notes rather than claiming unperformed checks.

Run the nine CLI integration tests from the framework root:

```sh
python3 -m unittest discover -s tests -v
```

On Windows, use `py -3` in place of `python3`. These tests cover creation, portability, Git defaults, and failure handling without requiring TeX. Inside the Dev Container, run `python3 tests/check_tex.py` for real builds across both languages and all engines, including changed PDFs, invalid source, and recovery. These checks do not replace checking the editor interface.

## Gatex extension package

The companion extension lives in `vscode-extension/` and targets VS Code 1.96+. It has no Node runtime package dependencies. Node.js 22+ and npm are needed only for development and packaging. From the framework root, the same commands work in common Linux, macOS, and Windows shells:

```sh
npm ci --prefix vscode-extension
npm run package --prefix vscode-extension
```

The first command downloads development dependencies from the lockfile, including the pinned `@vscode/vsce` packaging tool. Packaging copies the canonical Python creator, templates, and supporting documentation into the VSIX, then writes `dist/gatex-0.1.2.vsix`; it does not publish the extension. The identifier `gatex-local.gatex` describes a local package, and no Marketplace publisher account or listing has been set up. Keep release versions in the extension manifest and documentation consistent. Inspect the package contents so it excludes tests, development dependencies, TeX installations, and machine-specific files.

Install the VSIX through **Extensions → … → Install from VSIX…** in a connected Dev Container window, then click **Reload** if prompted or close and reopen the window. Confirm LaTeX Workshop is installed in the same environment. New or rebuilt containers may need the VSIX installed again; generated projects do not include it. The manual LaTeX Workshop and CLI workflows must continue working without Gatex.

For editor changes, verify the Gatex sidebar's **New project** button for both templates and languages, cancellation, existing destinations, independent Git history, deliberate parent-repository use, and mounted container destinations. Also verify that Writing Files filters setup/build files and Show setup files reveals configuration without changing disk contents; build intermediates remain hidden. Check the project dropdown, Build PDF, Show PDF, Review changes, and Advanced controls with the mouse and keyboard accessibility. Verify opening and reopening a writing project, an initially missing PDF, closing and restoring the preview, pausing persistent preview, choosing among multiple projects, failed builds and recovery, and double-click PDF-to-source navigation. Confirm source remains on the left and PDF on the right, and check Source Control can still review and stage changes. CLI and SyncTeX command-line checks support these checks but do not establish GUI behavior. Record any editor checks left for the user.

Retain incremental build files between edits; do not add cleanup to the ordinary build path. Keep `latexmk` responsible for references and bibliography passes. Do not promise instant compilation for arbitrary documents. Keep Gatex a small companion to established editor features. Avoid mandatory Git hooks, automatic commits, online build dependencies, or unrelated hosting integrations.
