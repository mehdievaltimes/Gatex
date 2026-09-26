'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const vscode = require('vscode');
const { openInContainer } = require('./environment');

function nameError(value) {
  if (!value || value !== value.trim() || value === '.' || value === '..' || value.endsWith('.') ||
      /[<>:"/\\|?*\x00-\x1f\x7f]/u.test(value) ||
      /^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/iu.test(value)) {
    return 'Choose a name without slashes or special filename characters. Avoid reserved names such as CON, and trailing dots or spaces.';
  }
  return undefined;
}

async function exists(filename) {
  try { await fs.lstat(filename); return true; }
  catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function run(program, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: options.cwd, env: options.env || process.env,
      shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timer;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', text => {
      stdout = (stdout + text).slice(-16384);
      options.output?.append(text);
    });
    child.stderr.on('data', text => {
      stderr = (stderr + text).slice(-16384);
      options.output?.append(text);
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
    if (options.timeout) timer = setTimeout(() => child.kill(), options.timeout);
  });
}

async function python() {
  const candidates = process.platform === 'win32'
    ? [{ command: 'py', args: ['-3'] }, { command: 'python', args: [] }]
    : [{ command: 'python3', args: [] }, { command: 'python', args: [] }];
  for (const candidate of candidates) {
    try {
      const result = await run(candidate.command, [
        ...candidate.args, '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)',
      ], { timeout: 10000 });
      if (result.code === 0) return candidate;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Gatex needs Python 3.9 or newer to create projects. Open the writing container, or install Python, then try again.');
}

async function repository(parent) {
  // Match the creator's filesystem checks, including worktrees and bare repos.
  let directory = parent;
  while (true) {
    if (await exists(path.join(directory, '.git'))) return directory;
    if (await exists(path.join(directory, 'HEAD')) && await exists(path.join(directory, 'objects')) &&
        await exists(path.join(directory, 'refs'))) return directory;
    const next = path.dirname(directory);
    if (next === directory) break;
    directory = next;
  }
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE']) delete env[key];
  try {
    const result = await run('git', ['-C', parent, 'rev-parse', '--show-toplevel'], { env, timeout: 10000 });
    return result.code === 0 ? result.stdout.trim() : undefined;
  } catch (error) {
    if (error.code === 'ENOENT') return undefined; // The creator gives the missing-Git guidance.
    throw error;
  }
}

async function insideWorkspace(directory) {
  const candidate = await fs.realpath(directory);
  for (const folder of vscode.workspace.workspaceFolders || []) {
    const root = await fs.realpath(folder.uri.fsPath);
    const relative = path.relative(root, candidate);
    if (relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))) {
      return true;
    }
  }
  return false;
}

async function pick(title, items) {
  const choice = await vscode.window.showQuickPick(items, { title, ignoreFocusOut: true });
  return choice?.value;
}

async function createProject(context, output) {
  try {
    if (!vscode.workspace.isTrusted) {
      throw new Error('Trust this folder in VS Code before creating a project. Gatex needs permission to create files and set up Git history.');
    }
    const kind = await pick('New project · 1 of 4 · Choose a template', [
      { label: 'Research paper', description: 'Abstract, sections, citations, and bibliography', value: 'paper' },
      { label: 'Notes', description: 'A compact document for research notes and references', value: 'notes' },
    ]);
    if (!kind) return;
    const language = await pick('New project · 2 of 4 · Choose a language', [
      { label: 'English', description: 'English headings and date conventions', value: 'en' },
      { label: 'Español', description: 'Spanish headings and date conventions', value: 'es' },
    ]);
    if (!language) return;
    const name = await vscode.window.showInputBox({
      title: 'New project · 3 of 4 · Name your project', prompt: 'Your project will be saved in a new folder with this name.',
      placeHolder: 'My research paper', ignoreFocusOut: true, validateInput: nameError,
    });
    if (name === undefined) return;
    if (nameError(name)) throw new Error(nameError(name));

    const container = /container/iu.test(vscode.env.remoteName || '') || await exists('/.dockerenv');
    if (container && !vscode.workspace.workspaceFolders?.length) {
      throw new Error('Open your writing folder before creating a project. Gatex will save your work there so it stays safe when the container is replaced.');
    }
    let destination;
    let noGit = false;
    while (!destination) {
      const selected = await vscode.window.showOpenDialog({
        title: container ? 'New project · 4 of 4 · Choose a location in your writing folder' : 'New project · 4 of 4 · Choose where to save it',
        openLabel: 'Create here', canSelectFiles: false, canSelectFolders: true,
        canSelectMany: false, defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
      });
      if (!selected?.length) return;
      const parent = selected[0];
      if (!(await fs.stat(parent.fsPath)).isDirectory()) throw new Error('Choose an existing folder to save your project in.');
      if (container && !(await insideWorkspace(parent.fsPath))) {
        await vscode.window.showWarningMessage('Choose a location inside your open writing folder. Files outside it may disappear when the container is replaced.');
        continue;
      }
      const candidate = vscode.Uri.joinPath(parent, name);
      if (await exists(candidate.fsPath)) {
        await vscode.window.showWarningMessage(`A folder named “${name}” already exists here. Choose another location.`);
        continue;
      }
      const existing = await repository(parent.fsPath);
      if (existing) {
        const choice = await vscode.window.showQuickPick([
          { label: 'Keep it in this repository', description: 'Save changes alongside the files already here', value: 'existing' },
          { label: 'Choose another location', description: 'Give this project its own Git history', value: 'another' },
        ], {
          title: 'This folder already has Git history',
          placeHolder: 'Where would you like to keep your project’s changes?',
          ignoreFocusOut: true,
        });
        if (!choice) return;
        if (choice.value === 'another') continue;
        noGit = true;
      }
      destination = candidate;
    }

    const interpreter = await python();
    const helper = path.join(context.extensionPath, 'assets', 'scripts', 'lwf.py');
    if (!(await exists(helper))) throw new Error('Gatex’s templates are missing. Reinstall the Gatex extension and try again.');
    const args = [
      ...interpreter.args, helper, 'create', kind, `--name=${name}`,
      '--language', language, '--engine', 'pdflatex', '--output', destination.fsPath,
      ...(noGit ? ['--no-git'] : []),
    ];
    output.appendLine(`Creating ${language} ${kind} at ${destination.fsPath}`);
    const result = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification, title: 'Creating your writing project…', cancellable: false,
    }, () => run(interpreter.command, args, { cwd: path.dirname(destination.fsPath), output }));
    if (result.code !== 0) {
      const detail = result.stderr.trim().split(/\r?\n/u).pop() || `Creator exited with ${result.signal || result.code}.`;
      throw new Error(detail.replace(/^Error:\s*/u, ''));
    }
    const start = vscode.env.remoteName ? 'Start writing' : 'Start writing in container';
    const choice = await vscode.window.showInformationMessage(
      `“${name}” is ready. Open it to start writing.`,
      start, ...(!vscode.env.remoteName ? ['Open locally'] : []), 'Later',
    );
    if (choice === 'Start writing in container') await openInContainer(destination);
    else if (choice === 'Start writing' || choice === 'Open locally') await vscode.commands.executeCommand('vscode.openFolder', destination, false);
    return destination;
  } catch (error) {
    output.appendLine(String(error.stack || error));
    const choice = await vscode.window.showErrorMessage(`Gatex: ${error.message || error}`, 'Details');
    if (choice === 'Details') output.show(true);
    return undefined;
  }
}

module.exports = { createProject };
