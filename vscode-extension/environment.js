'use strict';

const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

// Inspect PATH without starting TeX, running a shell, or installing anything.
async function findProgram(name) {
  const suffixes = process.platform === 'win32'
    ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';') : [''];
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    if (!directory) continue;
    for (const suffix of suffixes) {
      const filename = path.join(directory.replace(/^"|"$/gu, ''), name + suffix);
      try {
        await fs.access(filename, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
        if ((await fs.stat(filename)).isFile()) return filename;
      } catch { /* Continue to the next PATH entry. */ }
    }
  }
  return undefined;
}

async function containerFolder(project) {
  const workspace = vscode.workspace.getWorkspaceFolder(project.root)?.uri;
  for (const folder of [project.root, workspace].filter(Boolean)) {
    const config = vscode.Uri.joinPath(folder, '.devcontainer', 'devcontainer.json');
    try {
      if ((await vscode.workspace.fs.stat(config)).type & vscode.FileType.File) return folder;
    } catch (error) {
      if (error.code !== 'FileNotFound' && error.code !== 'ENOENT') throw error;
    }
  }
  return undefined;
}

async function inspectEnvironment(project) {
  const engine = project.settings.engine || 'pdflatex';
  if (!['pdflatex', 'lualatex', 'xelatex'].includes(engine)) {
    return { status: 'missing', canStartContainer: false, missing: [engine],
      message: 'Choose a supported engine in Advanced → Project settings, then check setup again.' };
  }
  const required = ['latexmk', engine, 'biber'];
  const found = await Promise.all(required.map(findProgram));
  const missing = required.filter((_, index) => !found[index]);
  const folder = await containerFolder(project);
  const canStartContainer = Boolean(folder && !vscode.env.remoteName);
  if (!missing.length) return { status: 'ready', missing: [], canStartContainer, message: '' };
  const message = canStartContainer
    ? 'Your writing tools are in the project’s container. Start it to build your PDF. The first setup may take a few minutes.'
    : vscode.env.remoteName === 'dev-container'
      ? 'The writing tools are missing from this container. Rebuild the container using its supplied configuration, then check setup again.'
      : 'The writing tools are not available here. Open the project’s container, or install the tools listed in Advanced → Build output, then check setup again.';
  return { status: 'missing', canStartContainer, missing, message };
}

async function openInContainer(folder) {
  if (!vscode.workspace.isTrusted) throw new Error('Trust this folder before starting its writing container.');
  if (vscode.env.remoteName) throw new Error('This window is already connected to a remote environment. Open the project locally to start its container.');
  const extension = vscode.extensions.getExtension('ms-vscode-remote.remote-containers');
  if (extension && !extension.isActive) await extension.activate();
  const commands = await vscode.commands.getCommands(true);
  if (!commands.includes('remote-containers.openFolder')) {
    const choice = await vscode.window.showInformationMessage(
      'Install Microsoft’s Dev Containers extension to use the included writing tools.', 'Install Dev Containers',
    );
    if (choice === 'Install Dev Containers') {
      await vscode.commands.executeCommand('workbench.extensions.installExtension', 'ms-vscode-remote.remote-containers');
      // The extension may need a window reload before its commands register.
      void vscode.window.showInformationMessage('Dev Containers installed. Reopen this window, then click Start writing in container.');
    }
    return false;
  }
  await vscode.commands.executeCommand('remote-containers.openFolder', folder, { forceReuseWindow: true });
  return true;
}

async function startContainer(project) {
  const folder = await containerFolder(project);
  if (!folder) throw new Error('This project has no container configuration. Open a project created by Gatex.');
  return openInContainer(folder);
}

module.exports = { inspectEnvironment, startContainer, openInContainer };
