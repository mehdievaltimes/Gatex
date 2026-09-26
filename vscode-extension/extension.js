'use strict';

const path = require('node:path');
const vscode = require('vscode');
const { parseProject } = require('./project');
const { createProject } = require('./create-project');
const { WritingSidebar } = require('./sidebar');
const { newItem, importFiles, openFile } = require('./file-actions');
const { inspectEnvironment, startContainer } = require('./environment');

const VIEWER = 'latex-workshop-pdf-hook';
const EXCLUDES = '**/{.git,node_modules,build,templates,.venv}/**';
const same = (a, b) => a?.toString() === b?.toString();
const parent = uri => uri.with({ path: path.posix.dirname(uri.path) });

class WritingWorkspace {
  constructor(context) {
    this.context = context;
    this.disposed = false;
    this.project = undefined;
    this.sequence = Promise.resolve();
    this.attemptedBuilds = new Set();
    this.previewSuppressed = false;
    this.projects = [];
    this.building = new Set();
    this.message = 'Saved edits update the PDF automatically.';
    this.showAllFiles = false;
    this.environment = { status: 'checking', message: 'Checking your writing tools…', canStartContainer: false };
    this.environmentKey = undefined;
    this.output = vscode.window.createOutputChannel('Gatex');
    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5);
    this.status.command = 'gatex.showHome';
    context.subscriptions.push(this, this.output, this.status);
    const action = callback => (...args) => this.enqueue(() => callback(...args), true);
    this.sidebar = new WritingSidebar(context, {
      newProject: action(() => createProject(context, this.output)),
      openWorkspace: action(() => this.open(true)),
      build: action(() => this.buildSelected()),
      showPdf: action(() => this.open(true)),
      openSourceControl: () => vscode.commands.executeCommand('workbench.view.scm'),
      showProblems: () => vscode.commands.executeCommand('workbench.actions.view.problems'),
      togglePreview: action(() => this.toggle()),
      openFolder: action(() => this.openFolder()),
      showOutput: action(() => this.showOutput()),
      openSettings: action(() => this.project && this.openSettings()),
      openSource: action(uri => openFile(this.project, uri)),
      selectProject: action(uri => this.openProject(uri)),
      toggleFiles: action(() => { this.showAllFiles = !this.showAllFiles; this.updateStatus(); }),
      startContainer: action(() => this.project && startContainer(this.project)),
      checkEnvironment: action(async () => {
        if (await this.checkEnvironment(true)) await this.present(this.project, true);
      }),
    });
  }

  config() {
    return vscode.workspace.getConfiguration('gatex', this.project?.root);
  }

  paused() { return this.context.workspaceState.get('previewPaused', false); }

  persist() {
    return !this.paused() && this.config().get('keepPreviewOpen', true);
  }

  updateStatus() {
    if (this.disposed) return;
    this.status.text = this.paused() ? '$(book) Gatex: preview paused' : '$(book) Gatex';
    this.status.tooltip = 'Show Gatex writing controls';
    if (vscode.workspace.workspaceFolders?.length) this.status.show();
    else this.status.hide();
    void vscode.commands.executeCommand('setContext', 'gatex.hasProject', Boolean(this.project));
    void this.sidebar?.update({
      project: this.project && {
        name: this.project.settings.name || path.posix.basename(this.project.root.path),
        root: this.project.root, source: this.project.source, pdf: this.project.pdf,
        language: this.project.settings.language, engine: this.project.settings.engine,
      },
      projects: this.projects.map(item => ({
        name: item.settings.name || vscode.workspace.asRelativePath(item.root, true),
        configUri: item.configUri,
      })),
      paused: this.paused(), building: this.building.has(this.project?.configUri.toString()),
      message: this.project ? this.message : '', showAllFiles: this.showAllFiles,
      errors: this.errorCount(),
      environment: this.environment,
    });
  }

  errorCount() {
    if (!this.project) return 0;
    const root = this.project.root;
    return vscode.languages.getDiagnostics().reduce((total, [uri, diagnostics]) => {
      if (uri.scheme !== root.scheme || uri.authority !== root.authority || !uri.path.startsWith(root.path + '/')) return total;
      return total + diagnostics.filter(item => item.severity === vscode.DiagnosticSeverity.Error).length;
    }, 0);
  }

  async refreshProjects() {
    const candidates = await vscode.workspace.findFiles('**/project.yml', EXCLUDES, 200);
    const found = await Promise.all(candidates.map(async uri => {
      try { return await this.readProject(uri); }
      catch (error) { this.output.appendLine(`${uri.fsPath}: ${error.message}`); return undefined; }
    }));
    this.projects = found.filter(Boolean).sort((a, b) => a.root.path.localeCompare(b.root.path));
    if (this.project) {
      const selected = this.projects.find(item => same(item.configUri, this.project.configUri));
      if (selected) await this.select(selected);
      else {
        this.project = undefined;
        this.watcher?.dispose();
      }
    }
    this.updateStatus();
  }

  async openFolder() {
    const folders = await vscode.window.showOpenDialog({
      canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
      title: 'Open a writing project', openLabel: 'Open project',
    });
    if (folders?.length) await vscode.commands.executeCommand('vscode.openFolder', folders[0], false);
  }

  async showOutput() {
    if (this.environment.status !== 'ready') {
      this.output.show(true);
      return;
    }
    const log = this.project && vscode.Uri.joinPath(this.project.root, 'build', 'lwf-build.log');
    if (log && await this.exists(log)) {
      await vscode.window.showTextDocument(log, { viewColumn: vscode.ViewColumn.One, preview: false });
    } else this.output.show(true);
  }

  async openSettings() {
    await vscode.window.showTextDocument(this.project.configUri, { viewColumn: vscode.ViewColumn.One, preview: false });
  }

  async openProject(configUri) {
    // The sidebar supplies URIs from the discovered project list only.
    if (!this.projects.some(item => same(item.configUri, configUri))) return;
    await this.present(await this.readProject(configUri), true);
  }

  async buildSelected() {
    const project = this.project ? await this.readProject(this.project.configUri) : await this.choose(true);
    if (!project) return;
    await this.select(project);
    this.previewSuppressed = false;
    await this.build(project);
  }

  async checkEnvironment(force = false) {
    if (!this.project) return false;
    const project = this.project;
    const key = `${project.configUri.toString()}:${project.settings.engine || 'pdflatex'}`;
    if (!force && this.environmentKey === key) return this.environment.status === 'ready';
    this.environment = { status: 'checking', message: 'Checking your writing tools…', canStartContainer: false };
    this.updateStatus();
    this.environment = await inspectEnvironment(project);
    this.environmentKey = key;
    if (this.environment.status !== 'ready') {
      this.output.appendLine(`Writing setup: missing ${this.environment.missing.join(', ')} on this environment's PATH.`);
      this.output.appendLine(this.environment.message);
      this.message = '';
    } else this.message = 'Saved edits update the PDF automatically.';
    this.updateStatus();
    return this.environment.status === 'ready';
  }

  // Serialize layout operations; compilation remains LaTeX Workshop's job.
  enqueue(action, report = false) {
    this.sequence = this.sequence.then(async () => {
      if (!this.disposed && vscode.workspace.isTrusted) await action();
    }).catch(error => {
      this.output.appendLine(String(error.stack || error));
      this.message = 'Something needs attention. Open Advanced → Build output for details.';
      this.updateStatus();
      if (report) void vscode.window.showErrorMessage(`Gatex: ${error.message || error}`);
    });
    return this.sequence;
  }

  schedulePreview() {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      void this.enqueue(() => this.ensurePreview());
    }, 350);
  }

  async exists(uri) {
    try { return Boolean((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.File); }
    catch (error) {
      if (error.code === 'FileNotFound' || error.code === 'ENOENT') return false;
      throw error;
    }
  }

  async readProject(configUri) {
    const folder = vscode.workspace.getWorkspaceFolder(configUri);
    if (!folder) throw new Error('Open the project folder before using Gatex.');
    const data = await vscode.workspace.fs.readFile(configUri);
    const settings = parseProject(Buffer.from(data).toString('utf8'));
    const root = parent(configUri);
    const source = vscode.Uri.joinPath(root, settings.source);
    if (!(await this.exists(source))) throw new Error(`Missing source: ${source.fsPath}`);
    return {
      settings, root, source, configUri,
      pdf: vscode.Uri.joinPath(root, 'build', settings.source.replace(/\.tex$/u, '.pdf')),
    };
  }

  async nearest(uri) {
    const folder = uri && vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) return undefined;
    let dir = parent(uri);
    while (dir.path === folder.uri.path || dir.path.startsWith(folder.uri.path.replace(/\/$/u, '') + '/')) {
      const config = vscode.Uri.joinPath(dir, 'project.yml');
      if (await this.exists(config)) return this.readProject(config);
      if (same(dir, folder.uri)) break;
      dir = parent(dir);
    }
    return undefined;
  }

  async choose(interactive) {
    const active = await this.nearest(vscode.window.activeTextEditor?.document.uri);
    if (active) return active;
    const saved = this.context.workspaceState.get('lastProject');
    const candidates = await vscode.workspace.findFiles('**/project.yml', EXCLUDES);
    const remembered = candidates.find(uri => vscode.workspace.asRelativePath(uri, true) === saved);
    if (remembered) return this.readProject(remembered);
    if (candidates.length === 1) return this.readProject(candidates[0]);
    if (!interactive) return undefined;
    if (!candidates.length) {
      await vscode.commands.executeCommand('workbench.view.extension.gatex');
      return undefined;
    }
    const choice = await vscode.window.showQuickPick(candidates.map(uri => ({
      label: path.posix.basename(parent(uri).path), description: vscode.workspace.asRelativePath(parent(uri), true), uri,
    })), { title: 'Open a document', placeHolder: 'Choose what you want to write' });
    return choice ? this.readProject(choice.uri) : undefined;
  }

  async select(project) {
    if (same(this.project?.pdf, project.pdf)) {
      this.project = project;
      return;
    }
    const previousPreview = this.previewTab();
    this.watcher?.dispose();
    this.project = project;
    this.environmentKey = undefined;
    this.message = 'Saved edits update the PDF automatically.';
    this.previewSuppressed = false;
    if (previousPreview) await vscode.window.tabGroups.close(previousPreview.tab, true);
    await this.context.workspaceState.update('lastProject', vscode.workspace.asRelativePath(project.configUri, true));
    this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(project.root, 'build/*.pdf'));
    const ready = uri => {
      if (same(uri, this.project?.pdf) && !this.paused() && !this.previewSuppressed) this.schedulePreview();
    };
    this.watcher.onDidCreate(ready);
    this.watcher.onDidChange(ready);
    this.updateStatus();
  }

  previewTab() {
    for (const group of vscode.window.tabGroups.all) {
      const tab = group.tabs.find(item => item.input instanceof vscode.TabInputCustom &&
        item.input.viewType === VIEWER && same(item.input.uri, this.project?.pdf));
      if (tab) return { group, tab };
    }
    return undefined;
  }

  async ensurePreview(force = false) {
    if (!this.project || (!force && (this.paused() || this.previewSuppressed))) return;
    const existing = this.previewTab();
    if (existing?.tab.isActive && !force) return;
    if (!(await this.exists(this.project.pdf))) return;
    await vscode.commands.executeCommand('vscode.openWith', this.project.pdf, VIEWER, {
      viewColumn: vscode.ViewColumn.Two, preserveFocus: true, preview: false,
    });
    // Explicitly opening a workspace may move a manually relocated viewer back.
    if (existing && existing.group.viewColumn !== vscode.ViewColumn.Two) {
      await vscode.window.tabGroups.close(existing.tab, true);
    }
  }

  async showSource(project, explicit) {
    const editor = vscode.window.activeTextEditor;
    const current = editor && await this.nearest(editor.document.uri);
    const keepSection = editor?.document.languageId === 'latex' && same(current?.configUri, project.configUri);
    const document = keepSection ? editor.document : await vscode.workspace.openTextDocument(project.source);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.One, preserveFocus: !explicit,
      preview: false, ...(keepSection ? { selection: editor.selection } : {}),
    });
  }

  async build(project) {
    if (!(await this.checkEnvironment(true))) {
      await vscode.commands.executeCommand('workbench.view.extension.gatex');
      return;
    }
    // Workshop needs the root in the active editor when it resolves a manual build.
    await vscode.window.showTextDocument(project.source, { viewColumn: vscode.ViewColumn.One, preview: false });
    const key = project.configUri.toString();
    if (this.building.has(key)) return;
    this.building.add(key);
    this.message = 'Building your PDF…';
    this.updateStatus();
    // Leave layout controls responsive while Workshop drains its build queue.
    // A completion for an old project must never reopen its PDF after a switch.
    void vscode.commands.executeCommand('latex-workshop.build').then(() => {
      void this.enqueue(async () => {
        this.building.delete(key);
        if (same(project.configUri, this.project?.configUri)) {
          this.message = this.errorCount() ? 'Fix the marked errors to update your PDF.' : 'Saved edits update the PDF automatically.';
          await this.ensurePreview();
        }
        this.updateStatus();
      });
    }, error => {
      if (this.disposed) return;
      this.building.delete(key);
      this.message = 'The PDF could not be built. Open Advanced → Build output for details.';
      this.updateStatus();
      this.output.appendLine(String(error.stack || error));
      void vscode.window.showErrorMessage(`Gatex build: ${error.message || error}`);
    });
  }

  async open(interactive = false) {
    if (!interactive && this.paused()) return;
    const project = await this.choose(interactive);
    if (!project) return;
    if (!interactive && !vscode.workspace.getConfiguration('gatex', project.root).get('autoOpenPreview', true)) return;
    await this.present(project, interactive);
  }

  async present(project, interactive) {
    if (interactive) {
      await this.context.workspaceState.update('previewPaused', false);
      this.previewSuppressed = false;
    }
    await this.select(project);
    this.updateStatus();
    const ready = await this.checkEnvironment();
    if (!ready) {
      // Do not discover a TeX root or request compilation before setup is ready.
      // Existing output remains useful and can be viewed without a TeX install.
      if (await this.exists(project.pdf)) await this.ensurePreview(true);
      await vscode.commands.executeCommand('workbench.view.extension.gatex');
      return;
    }
    await this.showSource(project, interactive);
    if (await this.exists(project.pdf)) {
      await this.ensurePreview(true);
    } else if (interactive || !this.attemptedBuilds.has(project.pdf.toString())) {
      // Failed builds remain visible in Workshop. Never enter an automatic retry loop.
      this.attemptedBuilds.add(project.pdf.toString());
      await this.build(project);
    }
  }

  async toggle() {
    await this.context.workspaceState.update('previewPaused', !this.paused());
    this.updateStatus();
    if (!this.paused()) await this.open(true);
    else {
      this.message = 'Preview paused. You can close the PDF; click Show PDF to return.';
      this.updateStatus();
    }
  }

  start() {
    const sub = this.context.subscriptions;
    const command = (name, action) => sub.push(vscode.commands.registerCommand(name, (...args) => this.enqueue(() => action(...args), true)));
    command('gatex.showHome', () => vscode.commands.executeCommand('workbench.view.extension.gatex'));
    command('gatex.openWorkspace', () => this.open(true));
    command('gatex.newProject', () => createProject(this.context, this.output));
    command('gatex.togglePreview', () => this.toggle());
    command('gatex.build', () => this.buildSelected());
    command('gatex.startContainer', () => this.project && startContainer(this.project));
    command('gatex.openFile', input => openFile(this.project, input));
    command('gatex.newFile', input => newItem(this.project, input));
    command('gatex.newFolder', input => newItem(this.project, input, true));
    command('gatex.importFiles', input => importFiles(this.project, input));
    command('gatex.revealFile', input => {
      const uri = input?.uri || input?.resourceUri;
      if (vscode.Uri.isUri(uri)) return vscode.commands.executeCommand('revealInExplorer', uri);
    });
    sub.push(vscode.commands.registerCommand('gatex.openSourceControl', () => vscode.commands.executeCommand('workbench.view.scm')));
    sub.push(vscode.languages.onDidChangeDiagnostics(() => this.updateStatus()));
    sub.push(vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor?.document.languageId !== 'latex') return;
      void this.enqueue(async () => {
        if (this.paused()) return;
        const project = await this.nearest(editor.document.uri);
        if (!project || !vscode.workspace.getConfiguration('gatex', project.root).get('autoOpenPreview', true)) return;
        if (!same(project.configUri, this.project?.configUri)) await this.open();
        else await this.ensurePreview();
      });
    }));
    sub.push(vscode.window.tabGroups.onDidChangeTabs(event => {
      if (this.project && event.closed.some(tab =>
        tab.input instanceof vscode.TabInputCustom && same(tab.input.uri, this.project.pdf))) {
        if (this.persist()) this.schedulePreview();
        else this.previewSuppressed = true;
      }
    }));
    sub.push(vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('gatex')) {
        this.previewSuppressed = false;
        this.updateStatus();
        void this.enqueue(() => this.open());
      }
    }));
    sub.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.project = undefined;
      this.environmentKey = undefined;
      this.watcher?.dispose();
      this.updateStatus();
      void this.enqueue(async () => { await this.refreshProjects(); await this.open(); });
    }));
    const projectsWatcher = vscode.workspace.createFileSystemWatcher('**/project.yml');
    const refresh = () => {
      clearTimeout(this.projectsTimer);
      this.projectsTimer = setTimeout(() => void this.enqueue(() => this.refreshProjects()), 200);
    };
    sub.push(projectsWatcher, projectsWatcher.onDidCreate(refresh), projectsWatcher.onDidChange(refresh), projectsWatcher.onDidDelete(refresh));
    this.updateStatus();
    void this.enqueue(async () => {
      await this.refreshProjects();
      await this.open();
      if (this.projects.length && !this.context.workspaceState.get('writingSidebarShown')) {
        await vscode.commands.executeCommand('workbench.view.extension.gatex');
        await this.context.workspaceState.update('writingSidebarShown', true);
      }
    });
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.previewTimer);
    clearTimeout(this.projectsTimer);
    this.watcher?.dispose();
    this.sidebar?.dispose();
  }
}

function activate(context) {
  const workspace = new WritingWorkspace(context);
  workspace.start();
}

module.exports = { activate };
