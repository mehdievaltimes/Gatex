# Troubleshooting

## Missing tools when opening a project

The supplied `latexmk`, TeX engines, and `biber` run inside the writing container. Opening the folder locally does not expose those tools to the host. In Gatex, click **Start writing in container** and wait for setup. If VS Code shows **Folder contains a Dev Container configuration file**, click **Reopen in Container** in that notification; it is the expected setup prompt. Docker must be running.

Gatex checks the tools before its own initial and manual build requests. **Build PDF** stays disabled until setup is ready, while **Show PDF** can display existing output. For a native TeX installation, restart VS Code after changing `PATH`, then click **Check setup again**. Missing tools prevent TeX from starting, so there is no new compilation log. Complete setup before using automatic builds or direct LaTeX Workshop build actions.

Gatex must also be installed in the connected container. Use the local extension's **Install in Dev Container** button when available, or install the Gatex VSIX through **Extensions → … → Install from VSIX…** in that window.

## The container does not start

Start Docker and check that `docker info` succeeds in a host terminal. Windows requires Linux containers. In VS Code, install Dev Containers, open the project **folder**, click the remote connection indicator in the bottom-left corner, and choose **Reopen in Container**. The Dev Containers log identifies image download or setup failures; click its **Show Log** notification when available. Initial setup needs a network connection; ordinary builds use the installed tools offline.

If the Dockerfile changes, click the bottom-left remote connection indicator and choose **Rebuild Container**. The project files and `.git` are mounted from the host and survive a rebuild. Files created outside the mounted folder may not. When creating projects from inside the framework container, use a destination under the framework folder and `--no-git`, then move the project on the host if it needs its own repository.

## The Gatex sidebar is missing

Gatex 0.1.2 is a local extension package, `dist/gatex-0.1.2.vsix` in the framework checkout. It is not published on the Marketplace or bundled into generated projects. In the connected Dev Container window, click **Extensions → … → Install from VSIX…** and select the package. Click **Reload** if prompted, or close and reopen the window. If the picker shows container paths, copy the package into the mounted project first. Check that Gatex (`gatex-local.gatex`) and LaTeX Workshop are both installed in the container. New or rebuilt containers may require installing the VSIX again.

Click the **Gatex document icon** in the left activity bar. If it was hidden manually, right-click the activity bar and enable **Gatex**. Gatex requires VS Code 1.96+ and a trusted workspace. Open the whole project folder, rather than a single `.tex` file. Preview actions require a project containing `project.yml`. Use the project dropdown when a folder contains several documents; Gatex uses the root document recorded in that project's configuration.

## A file is missing from Writing Files

The default **Writing Files** view hides helper scripts and setup files. Expand **Advanced** and click **Show setup files** to reveal them; **Hide setup files** returns to the focused view. Generated output stays hidden even in this mode. **Build output** opens the compiler log; VS Code's Explorer shows the complete folder. These controls change the view without changing files on disk or Git tracking. **Project settings** opens `project.yml` directly.

## Creating a project fails

The sidebar's **New project** button includes the paper and notes templates and their English/Spanish locale files. It needs Python 3.9+ and Git available where the extension runs. The supplied Dev Container includes both. On a host, install them and restart VS Code if its `PATH` has changed. The CLI remains available from a framework checkout as `python3 scripts/lwf.py create` (`py -3 scripts/lwf.py create` on Windows).

Choose a new destination folder name: Gatex never overwrites an existing folder. For independent Git history, choose a parent outside an existing repository. If you deliberately want an existing repository to track the new document, choose the picker's parent-repository option; it uses the creator's `--no-git` mode.

In a Dev Container, the destination must be within an opened workspace folder so it remains in the mounted workspace. To create an independent project outside the current mount, use the host installation of Gatex or the host CLI. After creation, open the generated project folder so its `.vscode/settings.json` applies. A new container may need a separate Gatex VSIX installation; the generated folder does not include that package.

## The preview is missing or stale

Click **Show PDF** in the Gatex sidebar to arrange source on the left and PDF on the right. It starts a build when the PDF is missing; **Build PDF** requests another build. Without Gatex, open `paper.tex` or `notes.tex`, run **LaTeX Workshop: Build LaTeX project**, then **LaTeX Workshop: View LaTeX PDF file**. LaTeX Workshop must be installed in the container; a host-only installation does not provide the container's build command. Click **Advanced → Build output** and inspect the VS Code Problems panel when setup or compilation fails. The existing PDF may show the last successful build until errors are fixed.

Open the generated project as the workspace folder so its `.vscode/settings.json` applies. Auto Save is configured for 800 ms after an editing pause. Automatic builds react to saved dependency changes; the build interval is zero because LaTeX Workshop drops changes inside a nonzero interval instead of scheduling a later build. The extension runs builds sequentially and keeps the latest pending request. TeX still needs time to compile. Save manually if you have disabled Auto Save. Changing `project.yml` requires a manual build. If you correct an error while a previous build is still failing, click **Build PDF** again: the extension clears pending requests when a build fails.

For a section not recognized as part of the paper, check its `% !TeX root = ../paper.tex` comment (or `../notes.tex`) and keep `latex-workshop.latex.build.enableMagicComments` enabled. Ensure the root includes the section with `\input` or `\include`. Avoid adding `% !TeX program` comments unless you intend to replace the configured build recipe. If automatic preview opening was disabled, click **Show PDF**, or restore `gatex.autoOpenPreview` in settings. See LaTeX Workshop's [build](https://github.com/James-Yu/LaTeX-Workshop/wiki/Compile) and [preview](https://github.com/James-Yu/LaTeX-Workshop/wiki/View) documentation for additional controls.

## The preview reopens when I close it

Gatex restores a closed PDF by default while its writing workspace is active. Expand **Advanced** and pause the preview before closing its tab. You can also set `gatex.keepPreviewOpen` to `false`: a manually closed PDF then stays closed until an explicit open, a project switch, or a window restart. `gatex.autoOpenPreview` controls automatic opening at startup and when switching projects. Click **Show PDF** whenever you want the writing view again; it also resumes paused preview behavior.

## Clicking the PDF does not open the source

Use **double-click** in LaTeX Workshop's internal PDF tab. The framework sets `latex-workshop.view.pdf.internal.synctex.keybinding` to `double-click`; a single click retains ordinary PDF selection and links. LaTeX Workshop also supports `ctrl-click` (Cmd-click on macOS), but no unmodified single-click setting. Close and reopen an existing PDF tab after changing the gesture setting.

Build successfully using the supplied recipe, which includes `-synctex=1`, and keep `build/<document>.synctex.gz` beside the PDF. Open the whole project folder in the same container where it was built; a PDF viewed in a separate system viewer does not use these settings. Rebuild after moving a project so its SyncTeX paths refer to the new location. SyncTeX locates a nearby source line, so generated text, macros, and citations can map to their containing command rather than an exact word. See the [LaTeX Workshop SyncTeX guide](https://github.com/James-Yu/LaTeX-Workshop/wiki/View#synctex).

## Builds feel slow

Keep `build/` between edits: `latexmk` reuses its dependency state and intermediate files. The first build, a bibliography change, or a font cache rebuild can be slower than a text edit. Large raster images, complex diagrams, and large documents also cost time. Increase `files.autoSaveDelay` to compile less often while typing. To pause automatic compilation, set `latex-workshop.latex.autoBuild.run` to `never` and use manual builds; restore `onFileChange` afterward. The extension's **Save without Building** command cannot suppress a build when the build interval is zero.

On Windows, projects kept in the WSL Linux filesystem can have faster container file access than projects mounted from a Windows drive. Open such folders through VS Code's WSL integration. The [VS Code container performance guide](https://code.visualstudio.com/remote/advancedcontainers/improve-performance) covers mount options. No fixed compile-time guarantee applies to arbitrary documents.

## TeX, latexmk, or Biber is missing

The default container supplies all three. Confirm the VS Code status bar shows a container connection, and run the command in that window's terminal. Outside the container, install the selected engine, `latexmk`, and `biber` through your own TeX distribution and add them to `PATH`. On Windows, reopen the terminal after changing `PATH`; use `py -3` if `python3` is unavailable. The helper requires `latexmk` and does not attempt an incomplete single-pass fallback.

The build script never installs tools or fetches packages. If using MiKTeX outside the container, disable its automatic package installation if you need a strictly offline build; provision the required packages beforehand.

For VS Code builds directly on Windows outside the container, the supplied LaTeX Workshop recipe expects `python3`. If only the Windows `py` launcher is installed, edit `.vscode/settings.json`: change the `lwf` tool's `command` from `python3` to `py`, and insert `-3` as the first item in its `args` array. The supplied VS Code terminal task already has a Windows launcher override. Container builds always use `python3`.

## A package, class, or font is missing

Click **Advanced → Build output**, then read the first error in `build/<document>.log` if needed. The build command reports that location and prints an error summary. A `.sty` or `.cls` error normally means a required package is absent. Extend the package list in `.devcontainer/Dockerfile` and rebuild, or install the package through your own TeX distribution for local builds. Record custom dependencies so collaborators can reproduce the environment.

Host fonts are not automatically available inside a container. Install a suitably licensed font in the build environment or use the TeX-supplied defaults. LuaLaTeX and XeLaTeX support `fontspec`; pdfLaTeX does not. The supplied English and Spanish examples use Latin scripts and do not establish support for other scripts.

The helper passes `-norc` to `latexmk` and disables shell escape. A custom `.latexmkrc` or package that runs external programs will need a separately maintained build recipe; merely adding such a file does not alter the framework build.

## Citations or cross-references are unresolved

Use the supplied build command and let `latexmk` complete its repeated TeX/Biber passes. Check that citation keys match `references.bib`, and that `biber` and `biblatex` come from a compatible TeX installation. Inspect both `build/<document>.log` and the Biber `.blg` file. After switching engines or bibliography versions, deleting only the generated `build/` folder and rebuilding can clear stale state; this also discards any final PDFs stored there.

## Git creation or commits fail

Creation initializes Git by default and needs Git available in the environment running the creator. Use a destination outside an existing repository for independent history. For a document inside an existing repository, pass `--no-git`; the parent repository tracks it. Existing destinations are never overwritten. After moving an uninitialized project outside another repository, run `python3 scripts/lwf.py init-git` from its root.

For **Author identity unknown**, set your own local identity inside the project:

```sh
git config user.name "Your Name"
git config user.email "you@example.com"
```

Click **Review changes** in Gatex to open VS Code's Source Control panel. It shows untracked files before the first commit. Stage the intended files, enter a commit message, then commit. If a repository is not detected, open the folder containing its `.git` and refresh Source Control. `git status` in the terminal provides the underlying Git error if one remains.

For Docker bind-mount ownership differences, the Dev Container setup trusts only the opened workspace path in the container user's Git configuration. If the post-create step was skipped, run `python3 scripts/lwf.py init-git . --trust-workspace` inside the container to repeat it. This does not set your commit identity.

Normal builds are ignored. If a PDF or auxiliary file was already committed, `.gitignore` will not stop tracking it; use `git rm --cached` on that specific file if you intend to retain the local file but remove it from future repository snapshots. Avoid broad removal commands.

## Paths, names, and configuration

Quote paths containing spaces in your shell. Generated projects support spaces and non-ASCII paths; subprocess commands use argument arrays. Project names must be valid portable folder names, and creation rejects an existing destination. Keep the project configuration, hidden folders, source, and copied `scripts/` together when moving the project.

**Advanced → Project settings** opens `project.yml`, which supports flat scalar fields only: `name`, `type`, `language`, `engine`, and `source`. Use a supported engine (`lualatex`, `xelatex`, or `pdflatex`) and a root-level `.tex` source filename. Editing `language` alone does not rewrite the document; update Babel and the text in the source as well.
