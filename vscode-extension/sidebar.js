'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const vscode = require('vscode');

const key = uri => uri?.toString() || '';
const NEVER_SHOW = new Set(['.git', 'build', 'node_modules', '.venv', '__pycache__']);
const SUPPORT_DIRECTORIES = new Set(['.devcontainer', '.vscode', 'scripts']);
const WRITING_EXTENSIONS = new Set(['.tex', '.bib', '.sty', '.cls', '.bst']);
const ACTIONS = new Set([
  'newProject', 'openWorkspace', 'build', 'showPdf', 'openSourceControl',
  'togglePreview', 'openFolder', 'showOutput', 'openSettings', 'toggleFiles', 'showProblems',
  'startContainer', 'checkEnvironment',
]);

class WritingFiles {
  constructor() {
    this.changed = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changed.event;
    this.root = undefined;
    this.showAllFiles = false;
  }

  update(project, showAllFiles) {
    const root = project?.root;
    const rootChanged = key(root) !== key(this.root);
    const modeChanged = this.showAllFiles !== Boolean(showAllFiles);
    if (rootChanged) {
      this.watcher?.dispose();
      this.root = root;
      if (root) {
        this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '**/*'));
        const refresh = uri => {
          const relative = path.posix.relative(root.path, uri.path);
          if (relative.split('/').some(part => NEVER_SHOW.has(part))) return;
          clearTimeout(this.refreshTimer);
          this.refreshTimer = setTimeout(() => this.changed.fire(), 120);
        };
        this.watcher.onDidCreate(refresh);
        this.watcher.onDidDelete(refresh);
        // Contents do not change the tree; renames arrive as create/delete events.
      }
    }
    this.showAllFiles = Boolean(showAllFiles);
    if (rootChanged || modeChanged) this.changed.fire();
  }

  getTreeItem(entry) {
    const item = new vscode.TreeItem(entry.uri, entry.directory
      ? (entry.name === 'sections' ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed)
      : vscode.TreeItemCollapsibleState.None);
    item.label = entry.name;
    item.id = entry.uri.toString();
    item.resourceUri = entry.uri;
    item.contextValue = entry.directory ? 'gatex.folder' : 'gatex.file';
    if (!entry.directory) {
      item.command = { command: 'gatex.openFile', title: 'Open file', arguments: [entry.uri] };
    }
    return item;
  }

  async getChildren(entry) {
    const uri = entry?.uri || this.root;
    if (!uri) return [];
    try {
      const children = await vscode.workspace.fs.readDirectory(uri);
      return children.flatMap(([name, type]) => {
        if (NEVER_SHOW.has(name)) return [];
        const directory = Boolean(type & vscode.FileType.Directory);
        if (!this.showAllFiles) {
          if (name.startsWith('.')) return [];
          if (directory && SUPPORT_DIRECTORIES.has(name)) return [];
          // Keep the project root focused on sources. Assets inside figures and
          // other author-created folders remain visible, including PDF figures.
          if (!entry && !directory && !WRITING_EXTENSIONS.has(path.posix.extname(name).toLowerCase())) return [];
        }
        return [{ uri: vscode.Uri.joinPath(uri, name), name, directory, isDirectory: directory }];
      }).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
    } catch (error) {
      if (error.code === 'FileNotFound' || error.code === 'ENOENT') return [];
      throw error;
    }
  }

  dispose() {
    clearTimeout(this.refreshTimer);
    this.watcher?.dispose();
    this.changed.dispose();
  }
}

/** A small writing dashboard and native file tree; it never runs webview input. */
class WritingSidebar {
  constructor(context, actions) {
    this.actions = actions;
    this.state = { projects: [], paused: false, building: false, message: '', showAllFiles: false, errors: 0 };
    this.revision = 0;
    this.disposed = false;
    this.files = new WritingFiles();
    this.disposables = [
      this.files,
      vscode.window.registerWebviewViewProvider('gatex.home', this),
      vscode.window.registerTreeDataProvider('gatex.files', this.files),
    ];
  }

  async update(state) {
    if (this.disposed) return;
    this.state = { ...state, projects: state.projects || [] };
    this.revision += 1;
    this.files.update(this.state.project, this.state.showAllFiles);
    this.sendState();
  }

  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    const messages = view.webview.onDidReceiveMessage(message => {
      void this.receive(message).catch(error => {
        if (!this.disposed) void vscode.window.showErrorMessage(`Gatex: ${error.message || error}`);
      });
    });
    const closed = view.onDidDispose(() => {
      messages.dispose();
      closed.dispose();
      if (this.view === view) this.view = undefined;
    });
    this.disposables.push(messages, closed);
    view.webview.html = html();
  }

  sendState() {
    if (!this.view || this.disposed) return;
    const { project, projects, paused, building, message, showAllFiles, errors, environment } = this.state;
    const selectedConfig = project && vscode.Uri.joinPath(project.root, 'project.yml');
    void this.view.webview.postMessage({
      type: 'state', revision: this.revision,
      project: project ? { name: project.name || path.posix.basename(project.root.path) } : null,
      projects: projects.map(item => ({ name: item.name })),
      selected: projects.findIndex(item => key(item.configUri) === key(selectedConfig)),
      paused: Boolean(paused), building: Boolean(building),
      message: typeof message === 'string' ? message : '', showAllFiles: Boolean(showAllFiles),
      errors: Number.isSafeInteger(errors) && errors > 0 ? errors : 0,
      environment: {
        status: ['ready', 'missing'].includes(environment?.status) ? environment.status : 'checking',
        message: typeof environment?.message === 'string' ? environment.message : '',
        canStartContainer: Boolean(environment?.canStartContainer),
      },
    });
  }

  async receive(message) {
    if (this.disposed || !message || typeof message !== 'object') return;
    if (message.type === 'ready') {
      this.sendState();
      return;
    }
    if (message.type !== 'action') return;
    if (message.action === 'selectProject') {
      // Webview messages contain an index, never an arbitrary URI or command.
      if (message.revision !== this.revision) return;
      if (!Number.isInteger(message.index) || message.index < 0) return;
      const selected = this.state.projects[message.index];
      if (selected) await this.actions.selectProject?.(selected.configUri);
    } else if (ACTIONS.has(message.action)) {
      await this.actions[message.action]?.();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables = [];
    this.view = undefined;
  }
}

function html() {
  const nonce = crypto.randomBytes(24).toString('base64');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<title>Gatex</title>
<style nonce="${nonce}">
:root { color-scheme: light dark; }
body { margin: 0; padding: 14px 16px 18px; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font: var(--vscode-font-size)/1.5 var(--vscode-font-family); }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
h1 { margin: 0 0 6px; font-size: 17px; line-height: 1.3; font-weight: 600; overflow-wrap: anywhere; }
p { margin: 0 0 12px; }
.muted { color: var(--vscode-descriptionForeground); }
.eyebrow { margin: 0 0 5px; color: var(--vscode-descriptionForeground); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.actions { display: grid; gap: 7px; }
button, select { font: inherit; min-height: 30px; width: 100%; }
button { cursor: pointer; border: 1px solid var(--vscode-button-border, transparent); border-radius: 3px; padding: 5px 9px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
button:hover { background: var(--vscode-button-hoverBackground); }
button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
button:disabled { cursor: default; opacity: .6; }
button:focus-visible, select:focus-visible, summary:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
select { margin: 5px 0 13px; padding: 4px; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, transparent); border-radius: 3px; }
.tip { margin-top: 11px; font-size: 12px; color: var(--vscode-descriptionForeground); }
.divider { border-top: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-widget-border, transparent)); margin: 14px 0; }
details { margin-top: 14px; }
summary { color: var(--vscode-descriptionForeground); cursor: pointer; width: fit-content; margin-bottom: 8px; }
.status { min-height: 1.5em; margin: 9px 0 0; color: var(--vscode-descriptionForeground); overflow-wrap: anywhere; }
.setup { margin: 0 0 13px; padding: 12px; border: 1px solid var(--vscode-widget-border, var(--vscode-sideBarSectionHeader-border, transparent)); border-radius: 4px; }
.setup h2 { margin: 0 0 6px; font-size: 13px; font-weight: 600; }
.setup p { overflow-wrap: anywhere; }
@media (max-width: 230px) { .pair { grid-template-columns: 1fr; } body { padding: 12px; } }
</style>
</head>
<body>
  <section id="empty">
    <h1>Start writing</h1>
    <p class="muted">Choose a template or open a project you already have.</p>
  </section>
  <section id="current" hidden>
    <p class="eyebrow">Your document</p>
    <h1 id="projectName"></h1>
  </section>
  <div id="projectPicker" hidden>
    <label for="projects" class="muted">Document</label>
    <select id="projects" aria-label="Choose document"></select>
  </div>
  <section id="setup" class="setup" aria-labelledby="setupTitle" hidden>
    <h2 id="setupTitle">Preparing your workspace</h2>
    <p id="setupMessage" class="muted" role="status" aria-live="polite"></p>
    <div class="actions">
      <button id="startContainer" data-action="startContainer" hidden>Start writing in container</button>
      <button id="checkEnvironment" class="secondary" data-action="checkEnvironment" hidden>Check setup again</button>
    </div>
  </section>
  <div id="writingActions" class="actions" hidden>
    <div class="pair">
      <button id="build" data-action="build">Build PDF</button>
      <button class="secondary" data-action="showPdf">Show PDF</button>
    </div>
    <button class="secondary" data-action="openSourceControl">Review changes</button>
    <p id="writingTip" class="tip" hidden>Edits compile automatically. Double-click text in the PDF to jump to its source.</p>
  </div>
  <div id="separator" class="divider" hidden></div>
  <div class="actions">
    <button id="newProject" data-action="newProject">New project</button>
    <button class="secondary" data-action="openFolder">Open folder</button>
  </div>
  <p id="status" class="status" role="status" aria-live="polite"></p>
  <button id="errors" class="secondary" data-action="showProblems" hidden>Show errors</button>
  <details id="advanced" hidden>
    <summary>Advanced</summary>
    <div class="actions">
      <button id="preview" class="secondary" data-action="togglePreview">Pause automatic preview</button>
      <button id="files" class="secondary" data-action="toggleFiles">Show setup files</button>
      <button class="secondary" data-action="openSettings">Project settings</button>
      <button class="secondary" data-action="showOutput">Build output</button>
    </div>
  </details>
<script nonce="${nonce}">
(() => {
  const vscode = acquireVsCodeApi();
  let revision = -1;
  let projectsKey = '';
  const el = id => document.getElementById(id);
  document.querySelectorAll('button[data-action]').forEach(button => {
    button.addEventListener('click', () => {
      vscode.postMessage({ type: 'action', action: button.dataset.action, revision });
    });
  });
  el('projects').addEventListener('change', () => {
    const index = Number(el('projects').value);
    if (Number.isInteger(index) && index >= 0) {
      vscode.postMessage({ type: 'action', action: 'selectProject', index, revision });
    }
  });
  window.addEventListener('message', event => {
    const state = event.data;
    if (!state || state.type !== 'state') return;
    revision = state.revision;
    const active = Boolean(state.project);
    const environment = state.environment || { status: 'checking' };
    const ready = environment.status === 'ready';
    const missing = environment.status === 'missing';
    el('empty').hidden = active;
    el('current').hidden = !active;
    el('writingActions').hidden = !active;
    el('separator').hidden = !active;
    el('advanced').hidden = !active;
    el('projectName').textContent = state.project?.name || '';
    el('newProject').classList.toggle('secondary', active);
    el('setup').hidden = !active || ready;
    el('setupTitle').textContent = missing ? 'One step before writing' : 'Preparing your workspace';
    el('setupMessage').textContent = environment.message || (missing
      ? 'Open the writing container to prepare PDF builds for this project.'
      : 'Checking that your workspace is ready to build PDFs…');
    el('startContainer').hidden = !active || ready || !environment.canStartContainer;
    el('checkEnvironment').hidden = !active || !missing;
    el('writingTip').hidden = !active || !ready;
    el('build').disabled = state.building || !ready;
    el('build').textContent = state.building ? 'Building…' : 'Build PDF';
    el('preview').textContent = state.paused ? 'Resume automatic preview' : 'Pause automatic preview';
    el('files').textContent = state.showAllFiles ? 'Hide setup files' : 'Show setup files';
    el('status').textContent = active ? state.message || (state.building ? 'Building PDF…' : state.paused ? 'Automatic preview is paused.' : '') : '';
    el('errors').hidden = !active || !state.errors;
    el('errors').textContent = 'Show errors (' + state.errors + ')';
    const projects = Array.isArray(state.projects) ? state.projects : [];
    el('projectPicker').hidden = projects.length < 2 && (active || !projects.length);
    const nextKey = JSON.stringify(projects);
    if (nextKey !== projectsKey) {
      projectsKey = nextKey;
      const options = projects.map((project, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = project.name;
        return option;
      });
      const placeholder = document.createElement('option');
      placeholder.value = '-1';
      placeholder.textContent = 'Choose a document';
      placeholder.disabled = true;
      el('projects').replaceChildren(placeholder, ...options);
    }
    el('projects').value = String(state.selected ?? -1);
  });
  vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
}

module.exports = { WritingSidebar };
