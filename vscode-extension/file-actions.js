'use strict';

const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

function contains(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function uriFrom(input) {
  const uri = input?.uri || input?.resourceUri || input;
  if (!uri || typeof uri.fsPath !== 'string' || typeof uri.path !== 'string' ||
      typeof uri.scheme !== 'string' || typeof uri.with !== 'function') {
    throw new Error('Choose a file or folder from your writing project.');
  }
  return uri;
}

async function requireProject(project) {
  if (!vscode.workspace.isTrusted) throw new Error('Trust this folder in VS Code before working with project files.');
  if (!project?.root) throw new Error('Open a writing project first.');
  const root = uriFrom(project.root);
  const realRoot = await fs.realpath(root.fsPath);
  if (!(await fs.stat(realRoot)).isDirectory()) throw new Error('Your project folder is no longer available.');
  return { root, realRoot };
}

async function checkedUri(project, input) {
  const { root, realRoot } = await requireProject(project);
  const uri = input ? uriFrom(input) : root;
  if (uri.scheme !== root.scheme || uri.authority !== root.authority ||
      !contains(path.resolve(root.fsPath), path.resolve(uri.fsPath))) {
    throw new Error('Choose a file or folder inside your writing project.');
  }
  const real = await fs.realpath(uri.fsPath);
  if (!contains(realRoot, real)) throw new Error('This link points outside your writing project. Choose a location inside the project.');
  return uri;
}

async function parentFolder(project, input) {
  const uri = await checkedUri(project, input);
  const stat = await fs.stat(uri.fsPath);
  if (stat.isDirectory()) return uri;
  if (!stat.isFile()) throw new Error('Choose a regular file or folder.');
  return checkedUri(project, uri.with({ path: path.posix.dirname(uri.path) }));
}

function nameError(value) {
  if (!value || value !== value.trim() || value === '.' || value === '..' || value.endsWith('.') ||
      /[<>:"/\\|?*\x00-\x1f\x7f]/u.test(value) ||
      /^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/iu.test(value)) {
    return 'Choose a name without slashes or special filename characters. Avoid reserved names such as CON, and trailing dots or spaces.';
  }
  return undefined;
}

async function newItem(project, input, directory = false) {
  const parent = await parentFolder(project, input);
  while (true) {
    const name = await vscode.window.showInputBox({
      title: directory ? 'New folder' : 'New file',
      prompt: `Create it in ${path.relative(project.root.fsPath, parent.fsPath) || 'your project folder'}.`,
      placeHolder: directory ? 'sections' : 'methods.tex',
      ignoreFocusOut: true,
      validateInput: nameError,
    });
    if (name === undefined) return undefined;
    if (nameError(name)) throw new Error(nameError(name));
    const destination = vscode.Uri.joinPath(parent, name);
    // Recheck the parent after the name dialog; exclusive creation preserves existing files and links.
    await checkedUri(project, parent);
    try {
      if (directory) await fs.mkdir(destination.fsPath);
      else await fs.writeFile(destination.fsPath, '', { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      await vscode.window.showWarningMessage(`“${name}” already exists here. Choose another name.`);
      continue;
    }
    if (!directory) {
      await openFile(project, destination);
      if (/\.tex$/iu.test(name) && project.source && destination.toString() !== project.source.toString()) {
        const relative = path.relative(project.root.fsPath, destination.fsPath).split(path.sep).join('/').replace(/\.tex$/iu, '');
        void vscode.window.showInformationMessage(`To include this section in your PDF, add \\input{${relative}} to ${path.basename(project.source.fsPath)}.`);
      }
    }
    return destination;
  }
}

async function importFiles(project, input) {
  await requireProject(project);
  let destination;
  if (input) {
    destination = await parentFolder(project, input);
  } else {
    const root = await checkedUri(project, project.root);
    destination = vscode.Uri.joinPath(root, 'figures');
    // Create only the standard figures folder, and never replace an existing entry.
    try { await fs.mkdir(destination.fsPath); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    destination = await checkedUri(project, destination);
    if (!(await fs.stat(destination.fsPath)).isDirectory()) throw new Error('“figures” is a file. Choose a folder in the file list to import into.');
  }
  const selected = await vscode.window.showOpenDialog({
    title: 'Add files to your project', openLabel: 'Add files',
    canSelectFiles: true, canSelectFolders: false, canSelectMany: true,
    defaultUri: destination,
  });
  if (!selected?.length) return [];
  const imported = [];
  let skipped = 0;
  const failures = [];
  for (const entry of selected) {
    try {
      await checkedUri(project, destination);
      const source = uriFrom(entry);
      if (source.scheme !== project.root.scheme || source.authority !== project.root.authority) {
        throw new Error('The file must be available in this workspace’s environment.');
      }
      const name = path.basename(source.fsPath);
      if (nameError(name)) throw new Error(`“${name}” needs a name that works across operating systems.`);
      if (!(await fs.stat(source.fsPath)).isFile()) throw new Error(`“${name}” is not a regular file.`);
      const target = vscode.Uri.joinPath(destination, name);
      await fs.copyFile(source.fsPath, target.fsPath, constants.COPYFILE_EXCL);
      imported.push(target);
    } catch (error) {
      if (error.code === 'EEXIST') skipped += 1;
      else failures.push(error.message || String(error));
    }
  }
  const summary = [
    `${imported.length} ${imported.length === 1 ? 'file' : 'files'} added`,
    ...(skipped ? [`${skipped} already ${skipped === 1 ? 'exists' : 'exist'} and ${skipped === 1 ? 'was' : 'were'} kept`] : []),
    ...(failures.length ? [`${failures.length} could not be added`] : []),
  ].join('; ') + '.';
  if (failures.length) await vscode.window.showWarningMessage(`${summary} ${failures[0]}`);
  else void vscode.window.showInformationMessage(summary);
  return imported;
}

async function openFile(project, input) {
  const uri = await checkedUri(project, input);
  if (!(await fs.stat(uri.fsPath)).isFile()) throw new Error('Choose a file to open.');
  const options = { viewColumn: vscode.ViewColumn.One, preview: false };
  const extension = path.extname(uri.fsPath).toLowerCase();
  const binaryExtensions = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tif', '.tiff', '.avif', '.zip', '.gz', '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.mp4', '.mov']);
  let binary = binaryExtensions.has(extension);
  if (!binary) {
    const handle = await fs.open(uri.fsPath, 'r');
    try {
      const buffer = Buffer.alloc(1024);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      binary = buffer.subarray(0, bytesRead).includes(0);
    } finally { await handle.close(); }
  }
  if (binary) await vscode.commands.executeCommand('vscode.open', uri, options);
  else await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), options);
  return uri;
}

module.exports = { newItem, importFiles, openFile };
