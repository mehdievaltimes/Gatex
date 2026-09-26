# Gatex for VS Code

Write LaTeX on the left and see the compiled PDF on the right. The **Gatex document icon** in VS Code's left activity bar opens a sidebar with the controls you need: create a project, choose a writing file, build, show the PDF, and review changes. Double-click PDF text to jump back to source.

Gatex 0.1.2 is a local companion extension with English and Spanish paper and notes templates. It is distributed as an installable VSIX with extension ID `gatex-local.gatex`; it has no Marketplace listing. Files remain ordinary LaTeX projects with local Git history.

## Install Gatex

1. Use VS Code 1.96 or later. For container builds, install **Dev Containers** and start Docker with Linux containers enabled.
2. Click **Extensions → … → Install from VSIX…** and select `gatex-0.1.2.vsix`.
3. Ensure Gatex and **LaTeX Workshop** (`James-Yu.latex-workshop`) are installed in that same environment. LaTeX Workshop is a declared dependency and may require an initial download.
4. Click **Reload** if prompted, or close and reopen the VS Code window. Click the **Gatex document icon** to begin.

In a Dev Container, install into the connected container window. A host-only installation does not supply Gatex to the container. In Extensions, find your locally installed Gatex and click **Install in Dev Container**, or use **Install from VSIX…**. If the file picker shows only container files, place the VSIX in the mounted project folder first. Retain the package separately: generated projects do not include it, and a new or rebuilt container may need it installed again. Creating and building projects requires a trusted workspace.

## Get the writing environment ready

When the project is open locally and its TeX tools are missing, the Gatex sidebar shows **Start writing in container**. Click it and wait for container setup. VS Code may also show **Folder contains a Dev Container configuration file**; click **Reopen in Container** in that notification to use the same environment. This notification is expected. The supplied TeX tools run inside the container and do not need installing on the host.

Gatex checks `latexmk`, the selected TeX engine, and `biber` before its initial and manual build actions. **Build PDF** stays disabled while those tools are missing; **Show PDF** can still display an existing PDF. **Check setup again** reruns detection. Finish setup before editing and compiling. If using your own native TeX distribution, restart VS Code after changing its `PATH`, then check setup again. Gatex does not install TeX or start a missing Docker daemon for you.

## Your writing sidebar

| Control | Use it to |
| --- | --- |
| **New project** | Choose a paper or notes template and language. |
| **Open folder** | Open an existing project. |
| **Project dropdown** | Switch between documents when a folder contains several projects. |
| **Build PDF** | Build now; normal edits build automatically. |
| **Show PDF** | Restore source on the left and PDF on the right. |
| **Review changes** | Review diffs, stage files, and commit in VS Code's Git panel. |
| **Writing Files** | Open document sources, bibliography, and figures. |

The default file view hides helper scripts and setup files. **Advanced → Show setup files** reveals them; **Hide setup files** restores the focused view. Generated output stays hidden; use **Build output** for its log or VS Code's Explorer to see the complete folder. Advanced also contains **Project settings** and a control to pause or resume the persistent preview. Routine writing needs no keyboard shortcuts or Command Palette.

The **Writing Files** toolbar offers **New File**, **New Folder**, and **Import Files**. Import places files in `figures/` by default; right-click a folder to add files there instead. Existing files are preserved. Include new sections in the root document with LaTeX's `\input`. **Show errors** appears when the compiler reports errors and opens the clickable Problems list.

## Create from a template

Click **New project**, choose a template and language, enter a project name, and choose its parent folder.

| Template | Content | Languages |
| --- | --- | --- |
| Paper | Abstract, introduction, conclusion, and bibliography | English, Spanish |
| Notes | Editable note sections and bibliography | English, Spanish |

The included Latin-script starters use pdfLaTeX by default. LuaLaTeX and XeLaTeX are also supported; change `engine` under **Advanced → Project settings** when needed, then click **Build PDF**. All sources are UTF-8 and use ordinary LaTeX. The picker includes the Python creator and template assets, so the framework checkout is not required after installing Gatex.

Creation requires Python 3.9+ and Git where the extension runs; the supplied Dev Container includes both. Gatex creates a new folder with source, bibliography, figures, configuration, build helper, editor settings, Dev Container definition, README, and an initialized Git repository. Existing destinations are never overwritten. When the parent already belongs to a repository, choose whether to use that history or another location. No commit is made automatically.

Inside a Dev Container, choose a destination within an opened workspace folder so files remain in the mounted workspace. For independent Git history, create from the host in a folder outside an existing repository.

After local creation, click **Start writing in container**. Gatex opens the new project in its supplied environment through Dev Containers; Docker must already be running. **Open locally** is available for a native TeX installation, and **Later** leaves the project on disk. In an existing remote environment, choose **Start writing**. Install Gatex in the new connected container window if needed. Each project can still build with its copied helper if Gatex is removed.

v0.1 includes these two starter templates and languages. Custom classes, publisher formats, and other scripts need their own documented LaTeX packages and fonts.

## Write and navigate

Gatex finds the nearest `project.yml` to the source you opened and remembers your project selection. Once setup is ready, **Show PDF** opens the root document on the left and the PDF on the right. It reuses an existing PDF or starts a build if one is missing and the required tools are available. The writing view opens automatically when you return.

Choose a file in **Writing Files** and edit. Auto Save saves after an 800 ms pause; LaTeX Workshop builds when document dependencies change, then refreshes the PDF after success. Actual compile time depends on your document and local environment.

**Double-click text in the PDF** to jump to its source. SyncTeX chooses the closest source position; equations, generated headings, and reused macros may map to nearby lines. Single clicks retain selection and link behavior. Current Gatex projects configure LaTeX Workshop's reverse-sync gesture to `double-click`. Close and reopen an existing PDF tab once after changing that setting.

The PDF stays on the right and reopens if closed. To close it deliberately, expand **Advanced**, pause the preview, then close its tab. **Show PDF** resumes it. To review your writing history, click **Review changes**, select a changed file, click **+** to stage, enter a message, and click **Commit**. Git needs your own name and email configured before committing.

## Optional command and settings reference

All routine actions are available in the sidebar. The Command Palette also retains these commands for users who prefer it:

| Command | Purpose |
| --- | --- |
| Gatex: New Project | Create from a localized starter. |
| Gatex: Open Writing Workspace | Open source and pinned PDF side by side. |
| Gatex: Toggle Persistent PDF Preview | Pause or resume automatic preview opening. |
| Gatex: Build Project | Build the selected project. |
| Gatex: Open Source Control | Open VS Code's Git interface. |

`gatex.autoOpenPreview` and `gatex.keepPreviewOpen` both default to `true`. `autoOpenPreview` controls opening at startup and project switches. With `keepPreviewOpen` set to `false`, a manually closed PDF stays closed until an explicit open, a project switch, or a window restart. Gatex requires a trusted workspace because builds execute the project's helper and local TeX tools.

For a local desktop installation, the CLI equivalent is `code --install-extension /path/to/gatex-0.1.2.vsix`. Use the connected window's **Install from VSIX** action for container installations.

## Requirements and limits

Use the generated editor settings and Dev Container, or supply Python 3.9+, `latexmk`, Biber, the selected TeX engine, and the document's packages yourself. LaTeX Workshop provides the PDF viewer and automatic builds; VS Code provides Git's interface. Gatex coordinates those features. Once the environment and extensions are installed, writing, building, and local Git operations work offline.

The project must contain `project.yml` and its copied `scripts/lwf.py` helper, or use the framework helper for included examples. Build output remains in the project's `build/` directory. Source, bibliography, figures, configuration, and history remain accessible as normal files.

The VSIX does not bundle TeX. Its container definition provisions TeX during initial setup. Gatex does not choose a Git identity or create commits. Its viewer integration was reviewed against LaTeX Workshop 10.19.0; changes to that extension's custom PDF editor integration may require a Gatex update.

## Build the VSIX from source

Maintainers need Node.js 22+ and npm. From the framework root, run the same commands in PowerShell, bash, or zsh:

```sh
npm ci --prefix vscode-extension
npm run package --prefix vscode-extension
```

Packaging copies the canonical templates, Python creator, and supporting project assets into the extension and writes `dist/gatex-0.1.2.vsix`. The official `@vscode/vsce` tool is the only direct development dependency. Its lockfile records transitive dependencies; none are shipped as runtime dependencies. Installing build dependencies initially needs network access. Packaging creates a local artifact; it does not publish or install anything.

See VS Code's official [packaging guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension), [extension installation guide](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace), and [remote extension guide](https://code.visualstudio.com/api/advanced-topics/remote-extensions).

The setup flow, sidebar, template picker, persistent preview, and PDF double-click gesture still need a final check in the VS Code interface. Command-line TeX and SyncTeX checks alone do not establish editor behavior.

MIT licensed. LaTeX Workshop is a separate extension with its own license.
