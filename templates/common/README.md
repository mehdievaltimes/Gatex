# {{ name }}

This is a standalone LaTeX {{ kind }} project. Its selected starter language is `{{ language }}` and its root document is `{{ source }}`. All text files are UTF-8. The source, bibliography, build helper, editor settings, and container definition are included here; the framework that created the project is no longer required.

## Open and write

Install VS Code 1.96+, its **Dev Containers** extension, and Docker with Linux containers enabled. Start Docker and use **File → Open Folder** to open this project. In Gatex's setup card, click **Start writing in container**. If VS Code shows **Folder contains a Dev Container configuration file**, its **Reopen in Container** button opens the same environment. You can also click the remote connection indicator in the bottom-left corner and choose **Reopen in Container**. Wait for setup to finish before writing. Initial setup downloads the container packages and LaTeX Workshop extension; later builds use those installed tools offline. The editor runs on the host and the TeX tools run inside the local container.

Install the **Gatex** companion extension (`gatex-local.gatex`) for its writing sidebar and persistent PDF. Gatex 0.1.2 is a local VSIX package, not a Marketplace listing. Obtain `gatex-0.1.2.vsix` separately from the framework's `dist/` directory; it is not copied into generated projects. In the connected container window, find the locally installed Gatex in Extensions and click **Install in Dev Container**, or click **Extensions → … → Install from VSIX…** and select the package. Click **Reload** if prompted, or close and reopen the window. If the picker shows only container files, place the package in this mounted project folder first. Both Gatex and LaTeX Workshop must be installed in the container. New or rebuilt containers may require reinstalling Gatex.

Gatex checks for `latexmk`, the selected TeX engine, and `biber` before its startup and manual build actions. If they are missing, **Build PDF** stays disabled and the setup card offers **Start writing in container** and **Check setup again**. An existing PDF can still be opened. A locally opened folder cannot use the TeX tools inside its container. For native TeX instead, install the requirements below, restart VS Code after changing `PATH`, and click **Check setup again**. Gatex does not install TeX or start Docker for you.

1. Click the **Gatex document icon** in the left activity bar. Choose this project from the dropdown if several are available.
2. Once setup is ready, click **Show PDF**. Gatex opens `{{ source }}` on the left and the compiled PDF on the right, and builds if the PDF is missing and the required tools are available. The writing view opens automatically on later visits.
3. Click a file under **Writing Files** and start writing. Auto Save saves after an 800 ms pause; the PDF refreshes after a successful compilation.
4. Click **Review changes** to review, stage, and commit your work.

Use **Build PDF** for a manual build, **Open folder** for an existing project, and **New project** to start another paper or notes document. No keyboard shortcut or Command Palette is needed for these actions.

**Writing Files** keeps source, bibliography, and figures within reach while hiding setup files. Expand **Advanced → Show setup files** to see them, then **Hide setup files** to return. Generated output stays hidden; **Build output** opens the compiler log, and VS Code's Explorer shows the complete folder. Advanced also contains **Project settings** and a control to pause or resume the persistent preview. To close the PDF deliberately, pause the preview first; **Show PDF** resumes it.

The **Writing Files** toolbar has **New File**, **New Folder**, and **Import Files** buttons; hover over an icon for its label. Imports go into `figures/` by default. Right-click a folder to add files there instead. Existing files are preserved. Include a new section in the root document using the usual LaTeX `\input` command. If compilation reports errors, click **Show errors** to see the affected source lines.

Without Gatex, the project still works with LaTeX Workshop's build and PDF view actions, or the terminal command below. The settings `gatex.autoOpenPreview` and `gatex.keepPreviewOpen` default to `true`. `autoOpenPreview` controls opening at startup and project switches. With `keepPreviewOpen` set to `false`, a manually closed PDF stays closed until an explicit open, a project switch, or a window restart.

The automatic-build interval is `0`, so there is no additional delay after Auto Save. LaTeX Workshop runs builds one at a time and keeps the latest request when changes arrive during compilation. Actual compilation time depends on the document; the first build and bibliography changes can take longer. Keep `build/` so `latexmk` can reuse its intermediate files. Adjust `files.autoSaveDelay` in `.vscode/settings.json` if you want a longer editing pause before saving and building. LaTeX Workshop's **SyncTeX from cursor** action also navigates from source to PDF.

**Double-click text in the PDF to jump to its source**, including section files. SyncTeX finds a nearby source line rather than guaranteeing an exact word match. Single clicks keep normal selection and link behavior; the supplied settings use LaTeX Workshop's [double-click reverse sync](https://github.com/James-Yu/LaTeX-Workshop/wiki/View#synctex). If updating an already-open project, close and reopen the PDF once to apply the gesture setting.

Edit the `.tex` files and `references.bib` directly, and put figures in `figures/`. Your files and `.git` live in the mounted project folder and survive a container rebuild. Move the entire project folder, including its hidden files, to retain this setup.

## Commit changes in VS Code

Click **Review changes** in the Gatex sidebar, or open **Source Control** directly. Select a changed file to review its diff, click **+** to stage it, enter a message, and choose **Commit**. Use the branch name in the status bar to create or switch branches. Commits stay local unless you deliberately configure a remote and push them.

Creation normally initializes a repository on `main`, without making a first commit. If this project was created with `--no-git` inside another repository, that parent repository tracks it. If you moved an uninitialized project outside a repository, run:

```sh
python3 scripts/lwf.py init-git
```

Dev Containers can use your host Git configuration. If Git requests an identity, configure your own name and email in this project's terminal:

```sh
git config user.name "Your Name"
git config user.email "you@example.com"
```

You can also use Git directly:

```sh
git status
git diff
git add .
git commit -m "Start writing"
git switch -c revise-draft
```

Commit source, bibliography, figures, `project.yml`, `scripts/`, `.vscode/`, `.devcontainer/`, and documentation. Review staged files first. `build/` and common auxiliary/swap files are ignored; figure PDFs can be tracked. To intentionally version a final PDF, use `git add -f build/paper.pdf` (or `build/notes.pdf`). After that first commit, changes to the tracked PDF appear in Git despite the ignore rule. Share the configuration and container definition with collaborators; exact output can still vary if package versions or custom fonts change. There are no mandatory hooks or automatic commits.

## Build and configuration

From this directory in the container terminal:

```sh
python3 scripts/lwf.py build
```

The PDF and logs appear in `build/`, named after the root document. The editor uses the same helper. `latexmk` runs the required TeX and Biber passes, keeps intermediate files for later builds, and returns a failing exit code on errors. Check the log location printed by the command if compilation fails.

Open **Advanced → Project settings** to edit `project.yml`. It records `name`, `type`, `language`, `engine`, and `source` as flat scalar values, one per line. It is deliberately a small YAML subset; nested objects, lists, and advanced YAML syntax are unsupported. The source must be a `.tex` file at the project root. pdfLaTeX is the default engine for fast English/Spanish previews; set `engine: lualatex` or `engine: xelatex` to change both editor and CLI builds, or override one terminal build with:

```sh
python3 scripts/lwf.py build --engine xelatex
```

The `language` setting records the original choice. Changing it does not translate the source or change the language passed to Babel; edit those in `{{ source }}` yourself. Click **Build PDF** after changing configuration. Each build runs at least one TeX pass (`latexmk -gt`) so stale container-mount timestamps cannot skip saved text; bibliography and auxiliary files are still reused. The helper ignores `latexmk` configuration files and disables shell escape; documents requiring custom build steps need a separate recipe.

Configuration values can be JSON-style double-quoted strings, YAML single-quoted strings (double an internal apostrophe), or simple unquoted text containing letters, numbers, spaces, dots, underscores, and hyphens. Full-line comments are supported; inline comments are not.

To build without a container, install Python 3.9+, `latexmk`, the selected engine, and `biber` through your own TeX Live, MacTeX, or MiKTeX installation and put them on `PATH`. The helper has no third-party Python dependencies and does not install TeX or download packages. On Windows, the corresponding command is:

```powershell
py -3 scripts/lwf.py build
```

For LaTeX Workshop builds directly on Windows outside the container, if only `py` is installed, change the `lwf` tool's `command` in `.vscode/settings.json` from `python3` to `py` and insert `-3` as the first item in its `args` array. The supplied terminal task already includes this Windows override. Leave `python3` in place for container builds.

The included English (`en`) and Spanish (`es`) starters cover Latin scripts. Both use `article`, `babel` with English or Spanish support, `iftex`, `geometry`, `csquotes`, `hyperref`, and `biblatex` with Biber. LuaLaTeX/XeLaTeX also use `fontspec` with TeX-supplied Latin Modern Roman fonts; pdfLaTeX uses Latin Modern vector fonts (`lmodern`), T1 encoding and UTF-8 input support. The included Dockerfile supplies these dependencies. No proprietary fonts are bundled. Custom system fonts must be available where TeX runs, including inside the container. pdfLaTeX does not offer arbitrary Unicode-script or system-font support. Right-to-left scripts require additional language/font work and are not covered by these examples. Babel provides localized abstract headings and `\today` dates.

## Troubleshooting

- **No container:** start Docker, confirm Linux containers are enabled, then click **Start writing in container** or the native notification's **Reopen in Container** button. Use the setup notification's **Show Log** action if startup fails. First setup requires a connection.
- **Missing Gatex sidebar:** install its VSIX in the connected container window, then click **Reload** if prompted or close and reopen the window. The package is distributed separately and may need reinstalling after a container rebuild.
- **Missing preview:** click **Show PDF**, then **Build PDF** if needed. Confirm Gatex and LaTeX Workshop are installed in the container.
- **Preview reopens when closed:** expand **Advanced** and pause the preview before closing its tab.
- **PDF does not jump to source:** double-click in LaTeX Workshop's PDF tab. Reopen the tab once after changing settings and rebuild to regenerate `build/<document>.synctex.gz` after moving the project.
- **Stale PDF:** click **Advanced → Build output** and check the Problems panel and `build/<document>.log`; the viewer may still show the last successful PDF after an error. Save manually if Auto Save is disabled.
- **Missing tools on PATH:** finish container setup using **Start writing in container**, or install the tools yourself for local builds, restart VS Code, and click **Check setup again**. The supplied tools live inside the container. No new build log is created when TeX never starts; there is no single-pass fallback.
- **Missing package/font:** add it to `.devcontainer/Dockerfile` and run **Dev Containers: Rebuild Container**, or use your own TeX distribution's package manager for host builds. Host fonts are not automatically visible inside the container.
- **Unresolved citations:** verify the keys in `references.bib` and let `latexmk` finish its Biber and TeX passes. Inspect the `.blg` and `.log` files.
- **Git cannot commit:** configure your own `user.name` and `user.email`, stage files, and supply a message. `git status` shows repository errors.
- **Spaces or accents in paths:** quote paths in the terminal and keep the complete project together when moving it.

For all helper options, run `python3 scripts/lwf.py --help`. The copied helper builds this project and can initialize Git. To create another paper or notes project, click **New project** in the Gatex sidebar with the separately installed extension, which includes English/Spanish templates, or use the creator from a framework checkout. After local creation, choose **Start writing in container**, **Open locally** for a native TeX installation, or **Later**; in an existing remote environment, choose **Start writing**. The picker requires Python 3.9+ and Git where it runs; both are included in this container. Inside a container, create only under an opened workspace folder so the files remain mounted. If a parent repository is detected, explicitly choose whether to use its history or pick another location.
