# Gatex — LaTeX Writing Framework

Write LaTeX on the left and see the compiled PDF on the right. Click the **Gatex document icon** in VS Code's left activity bar to create a project, open its writing files, build the PDF, or review changes. Double-click PDF text to jump to its source. The framework includes English and Spanish paper and notes templates, a local Dev Container, and Git integration.

The default workflow runs TeX, Biber, Python, and Git inside a local container. VS Code supplies the editor, PDF viewer, and Git interface. Sources and history stay in the project folder on your computer. There is no account, online build service, custom editor, or proprietary document format. Projects also build with your own TeX installation and editor.

## Setup

Supported host platforms are Linux, macOS, and Windows with Linux containers. Install:

- **VS Code 1.96+** and its **Dev Containers** extension (`ms-vscode-remote.remote-containers`).
- **Docker** with its daemon running: Docker Engine on Linux, or Docker Desktop with Linux containers on macOS/Windows.
- **Python 3.9+** and **Git** on the host for creating projects through the local extension or CLI. The Python helper uses only the standard library; there is no package installation step.

Use the installable VSIX for the template picker, or clone/extract the framework for its CLI and examples. Creating a project copies its complete source, build helper, editor settings, and container definition. A generated project does not need this framework checkout afterward.

The first container setup downloads a Linux image, TeX packages, and LaTeX Workshop and can take several minutes and substantial disk space. Once that setup is complete, editing, committing, and PDF builds work offline with those installed packages. Container rebuilds and newly requested packages may require a connection. No TeX installation is needed on the host for this workflow.

Gatex 0.1.2 is distributed as a local extension package, [dist/gatex-0.1.2.vsix](dist/gatex-0.1.2.vsix), with extension ID `gatex-local.gatex`. It is not published on the VS Code Marketplace. The package includes a template picker and the complete project creator, plus persistent preview controls. LaTeX Workshop supplies editing, compilation, and PDF navigation. After installing the VSIX, creating projects does not require the framework checkout. Generated projects do not contain this VSIX: retain a copy separately to install in each new environment. To package it from a fresh source checkout, follow [CONTRIBUTING.md](CONTRIBUTING.md). Node.js is needed only to develop or package the extension.

## Create a project

### From VS Code

Install `gatex-0.1.2.vsix` through **Extensions → … → Install from VSIX…**. Click **Reload** if prompted, or close and reopen the VS Code window. Open a trusted local folder, or use the framework's Dev Container to get Python and Git without installing them on the host.

1. Click the **Gatex document icon** in the left activity bar, then **New project**.
2. Choose **Paper** or **Notes**, **English** or **Spanish**, and a project name.
3. Choose the parent folder. Gatex creates a new project folder and initializes Git. If the parent is already in a Git repository, choose whether to use that history or another location.
4. Click **Start writing in container** and wait for setup to finish. Docker must be running and Dev Containers installed. In an existing remote environment, the button is **Start writing**. Choose **Open locally** only when you have a working native TeX installation, or **Later** to leave the new project on disk.
5. In the connected container window, install Gatex if it is absent: in Extensions, find your locally installed Gatex and click **Install in Dev Container**, or use **Install from VSIX…** with the retained package.

The included starters use pdfLaTeX by default. To change the engine later, expand **Advanced** in Gatex and click **Project settings**.

Python 3.9+ and Git must be available where the extension runs; both are included in the supplied container. Inside a Dev Container, the picker restricts destinations to the opened workspace folders so files remain in the mounted project. Creating under the framework therefore normally uses its Git repository. Use a host folder outside an existing repository when you want independent history.

| Template | Included content | Languages |
| --- | --- | --- |
| Paper | Title, abstract, introduction, conclusion, sample bibliography | English (`en`), Spanish (`es`) |
| Notes | Title, editable note sections, sample bibliography | English (`en`), Spanish (`es`) |

The templates are editable starting points using the standard `article` class. Publisher-specific classes and other languages can be added as ordinary LaTeX files; v0.1 does not include a publisher template catalog. See [localization](docs/localization.md) and [contributing](CONTRIBUTING.md) to extend the starters.

## Write with the PDF beside the source

1. Open your project folder in VS Code and click the **Gatex document icon**. If the sidebar shows a setup card, click **Start writing in container** and wait for setup to finish. VS Code's notification **Folder contains a Dev Container configuration file** is expected: its **Reopen in Container** button opens the same environment. Docker must be running.
2. In the connected container window, install Gatex if absent: click **Install in Dev Container** for the locally installed extension, or install `gatex-0.1.2.vsix` through **Extensions → … → Install from VSIX…**. Click **Reload** if prompted, or close and reopen the window. If the picker shows container paths, place the VSIX in the mounted project folder first.
3. Click the **Gatex document icon**. Select your project from the dropdown if several are available. Once setup is ready, click **Show PDF** to open the writing view: source on the left, PDF on the right. A missing PDF starts a build automatically when the required tools are available.
4. Click a file in **Writing Files** and edit. Auto Save saves after an 800 ms pause; the PDF refreshes after a successful build.

The writing view opens automatically when you return to a project. The sidebar keeps routine actions visible:

| Control | What it does |
| --- | --- |
| **New project** | Choose a paper or notes template and language. |
| **Open folder** | Open an existing project. |
| **Build PDF** | Request a build now. Ordinary edits build automatically. |
| **Show PDF** | Restore the source and PDF layout. |
| **Review changes** | Open Git diffs, staging, and commits. |
| **Writing Files** | Browse document sources, bibliography, and figures. |

Gatex checks for `latexmk`, the project's selected TeX engine, and `biber` before its startup and manual build actions. If any are missing, **Build PDF** is disabled and the sidebar presents **Start writing in container** and **Check setup again**. An existing PDF can still be opened. The TeX tools supplied by this project live inside its container; opening the folder locally does not make them available on the host. Finish setup before starting the edit-and-build workflow. If you supply native TeX tools instead, restart VS Code after changing its `PATH`, then click **Check setup again**.

Helper scripts and setup files stay out of the default **Writing Files** view. Expand **Advanced → Show setup files** when you need them, then choose **Hide setup files** to return. Generated output stays hidden; use **Build output** for the compiler log or VS Code's Explorer for the complete folder. Advanced also contains **Project settings** and a control to pause or resume the persistent preview. No keyboard shortcut or Command Palette is needed for the normal writing workflow.

Use the **New File**, **New Folder**, and **Import Files** buttons beside **Writing Files** to add content. Hover over an icon to see its label. Imported files go into `figures/` by default; right-click a folder to add files there instead. Existing files are preserved. Add new section files to your root document with the usual LaTeX `\input` command. When the compiler reports errors, **Show errors** opens the list so you can click the affected source line.

**Double-click text in the PDF to jump to its source**, including text from a section file. SyncTeX maps the rendered position to a nearby source line; it is not always an exact word match. Single clicks retain the viewer's normal selection and link behavior. Close and reopen an existing PDF tab once after updating the gesture setting. See LaTeX Workshop's [build](https://github.com/James-Yu/LaTeX-Workshop/wiki/Compile) and [SyncTeX](https://github.com/James-Yu/LaTeX-Workshop/wiki/View#synctex) documentation.

Automatic opening and preview restoration are enabled by default. To close the preview deliberately, expand **Advanced**, pause the preview, then close its tab. **Show PDF** resumes it. New or rebuilt containers may require installing Gatex again.

The settings `gatex.autoOpenPreview` and `gatex.keepPreviewOpen` control automatic opening and restoration. With `keepPreviewOpen` set to `false`, a manually closed PDF stays closed until an explicit open, a project switch, or a window restart. The Gatex commands remain available in the Command Palette for users who prefer them. Without Gatex, LaTeX Workshop's build and PDF view actions and the CLI below work independently.

Builds use `latexmk` to run the necessary TeX and bibliography passes. Intermediate files remain in `build/` for reuse. Auto Save waits for the 800 ms editing pause; `latex-workshop.latex.autoBuild.interval` is `0`, so it adds no further delay. LaTeX Workshop runs builds one at a time and keeps the latest build request when changes arrive during compilation. Document size, graphics, bibliography changes, and container file access still determine compilation time. The first build is generally slower than later edits. A small English paper rebuilt in approximately 0.6 seconds with pdfLaTeX in our running container, plus the Auto Save delay; this is a sample measurement, not a guarantee for larger documents. Adjust `files.autoSaveDelay` in `.vscode/settings.json` if your document needs a longer pause between edits and builds.

## Git in the editor

Click **Review changes** in the Gatex sidebar, or open **Source Control** directly in VS Code. Select a changed file to review its diff, use **+** to stage it, enter a message, and choose **Commit**. The branch indicator in the status bar lets you create or switch branches. These actions are local; a Git hosting account is unnecessary. VS Code documents these controls in its [Source Control guide](https://code.visualstudio.com/docs/sourcecontrol/overview).

Dev Containers can reuse your host Git configuration. If Git asks for your identity, run these commands in the project terminal, replacing the values with your own; they apply only to this repository:

```sh
git config user.name "Your Name"
git config user.email "you@example.com"
```

The equivalent terminal workflow is:

```sh
git status
git diff
git add .
git commit -m "Start paper"
git switch -c revise-introduction
```

Commit the source, bibliography, figures, helper, documentation, `.vscode/`, `.devcontainer/`, and `project.yml` so collaborators receive the same setup. Review the staged files before committing. Build outputs and auxiliary files are ignored; PDFs used as figures can be tracked normally. To intentionally record a final paper PDF, run `git add -f build/paper.pdf`. Once tracked, later changes to that PDF will appear in Git even though `build/` is ignored. There are no mandatory hooks or automatic commits.

## Create from a terminal

From a framework checkout, on Linux/macOS:

```sh
python3 scripts/lwf.py create paper --name "My Paper" --language en --output "../My Paper"
python3 scripts/lwf.py create notes --name "Reading Notes" --language es --output "../Reading Notes"
```

On Windows, in PowerShell:

```powershell
py -3 scripts/lwf.py create paper --name "My Paper" --language en --output "../My Paper"
py -3 scripts/lwf.py create notes --name "Reading Notes" --language es --output "../Reading Notes"
```

Each project starts as a Git repository on `main`, ready for its first commit. Creation does not commit files or choose your Git identity. Existing destinations are never overwritten. Choose a location outside another Git repository; use `--no-git` when you deliberately want the project tracked by an existing repository. Type, name, and language can also be entered interactively with `python3 scripts/lwf.py create`.

To avoid installing Python and Git on the host, open the framework itself in its included Dev Container and create under its mounted folder:

```sh
python3 scripts/lwf.py create paper --name "My Paper" --language en --output "projects/My Paper" --no-git
```

This project belongs to the framework's Git repository. Only the opened folder is mounted into the container; a sibling created outside it would be stored in the container rather than your host project folder. For an independent repository, prefer the host commands above. Alternatively move the generated folder outside the framework on the host, open that folder in its container, and run `python3 scripts/lwf.py init-git` there.

## Build from a terminal

From the generated project, inside its container:

```sh
python3 scripts/lwf.py build
```

This is also the build path used by the editor. Output is `build/paper.pdf` or `build/notes.pdf`; TeX logs and SyncTeX files are beside it. Compilation errors return a failing exit code, print a useful summary, and identify the log to inspect.

To build outside the container, provide Python 3.9+, `latexmk`, the selected TeX engine, and `biber` on `PATH` using your own TeX Live, MacTeX, or MiKTeX installation. The helper does not download packages or install TeX. There is no single-pass fallback: `latexmk` is required so citations and references receive the passes they need. On Windows, replace `python3` with `py -3`.

pdfLaTeX is the default for responsive previews of the included English and Spanish documents. Use `--engine lualatex` or `--engine xelatex` when creating a project, or change `engine:` in `project.yml` for both editor and CLI builds. Temporarily override a terminal build with:

```sh
python3 scripts/lwf.py build --engine xelatex
```

From the framework directory, build the included examples with:

```sh
python3 scripts/lwf.py build examples/english
python3 scripts/lwf.py build examples/spanish
```

Each build runs at least one TeX pass (`latexmk -gt`) so stale container-mount timestamps cannot skip saved text; bibliography and auxiliary files are still reused. The helper ignores `latexmk` configuration files and disables shell escape; a document requiring custom build steps needs an explicitly maintained alternative recipe.

## Project files and configuration

```text
my-project/
├── .git/                  # local repository history
├── .devcontainer/         # Linux image and TeX environment
├── .vscode/               # build, preview, and editor settings
├── .gitignore
├── README.md              # standalone project instructions
├── project.yml
├── paper.tex              # notes.tex in notes projects
├── references.bib
├── sections/              # editable paper or notes sections
├── figures/
├── scripts/lwf.py         # copied build and Git helper
└── build/                 # generated and ignored
```

`project.yml` uses a small YAML subset: one flat scalar value per line, with fields `name`, `type`, `language`, `engine`, and `source`. Values may be JSON-style double-quoted strings, YAML single-quoted strings (double an internal apostrophe), or plain text containing letters, numbers, spaces, dots, underscores, and hyphens. Full-line comments are allowed; nested YAML, lists, and inline comments are unsupported. `source` names the root `.tex` file in the project directory. `language` records the creation choice; changing it does not translate an existing document or alter its Babel setup. Edit the `.tex` source directly for those changes.

The project folder is mounted into the container, so files and `.git` persist when the container is rebuilt or removed. Move or share the folder with its hidden configuration files to preserve the workflow. A plain source checkout remains buildable using standard LaTeX tools. Sharing the Dockerfile and TeX requirements improves reproducibility; an unpinned package repository, different engine versions, or custom fonts can still change the resulting PDF.

## Language examples

| Example | Script and language package | Engines |
| --- | --- | --- |
| English (`en`) | Latin; Babel `english` | pdfLaTeX (default), LuaLaTeX, XeLaTeX |
| Spanish (`es`) | Latin with accents; Babel `spanish` | pdfLaTeX (default), LuaLaTeX, XeLaTeX |

Both language examples have been compiled with all three engines, with networking disabled, in the Linux arm64 container on macOS Docker. The English PDF has been opened beside its source in VS Code on macOS, and a SyncTeX command-line check resolves a PDF position to its section source. The new Gatex sidebar, template picker, persistent-preview behavior, and double-click gesture still require verification in the editor. Live refresh and staging through the interface, and the native Windows interface, have not been independently verified.

Both templates are UTF-8 and localize starter text, metadata, abstract headings, and Babel's `\today` date. They use `article`, `babel`, `iftex`, `geometry`, `csquotes`, `hyperref`, and `biblatex` with Biber. LuaLaTeX/XeLaTeX use `fontspec` and TeX-supplied Latin Modern Roman fonts. pdfLaTeX uses Latin Modern vector fonts (`lmodern`), T1 font encoding and UTF-8 input support; it does not support arbitrary Unicode scripts or system-font selection. The container supplies the included examples' tools and packages.

No proprietary fonts are bundled. Custom system fonts must be installed **inside the container**, or on the machine running TeX when using local builds. Right-to-left scripts are an extension point with no included RTL example or universal language claim. See [adding a language](docs/localization.md) for the locale files, package requirements, and limitations.

## Troubleshooting and maintenance

For a setup card or a **Missing tools on PATH** message, click **Start writing in container** and wait for setup; the native **Reopen in Container** notification is another entry point. No new TeX log exists when a build stops before running TeX. Once setup is ready, use **Show PDF**, then **Build PDF** if needed, and check **Advanced → Build output** for compilation errors. If the Gatex sidebar is absent, install its VSIX in the connected container window and reopen that window. Package/font errors appear in `build/<document>.log`; add dependencies to the Dockerfile and rebuild the container, or use your own distribution's package manager. An unavailable Docker daemon affects container startup, while a missing Git identity affects commits. Detailed remedies are in [troubleshooting](docs/troubleshooting.md).

The framework has no Python library dependencies, and Gatex has no Node runtime package dependencies. It relies on Docker/Dev Containers for the shared environment, LaTeX Workshop for TeX editing and PDF display, `latexmk` for incremental multi-pass compilation, Biber for the supplied bibliography style, and Git for history. The extension packaging tool is a development dependency only. See [CONTRIBUTING.md](CONTRIBUTING.md) for maintenance guidance and [LICENSE](LICENSE) for the MIT license.
