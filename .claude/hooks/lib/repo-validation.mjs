import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const projectDir = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());

export async function readHookInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

export function toProjectRelative(filePath) {
  if (!filePath) return '';

  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(projectDir, filePath);

  return path.relative(projectDir, absolute).split(path.sep).join('/');
}

export function commandExists(filePath) {
  return fs.existsSync(filePath);
}

export function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function localBin(dir, name) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return path.join(projectDir, dir, 'node_modules', '.bin', `${name}${suffix}`);
}

export function buildAllChecks() {
  return ['client', 'server', 'tests'];
}

export function getTargetedChecks(relativePath) {
  if (!relativePath) return [];

  if (
    relativePath.startsWith('.claude/') ||
    relativePath.startsWith('docs/') ||
    [
      'CLAUDE.md',
      'CLAUDE.local.md',
      'README.md',
      '.gitignore',
      '.worktreeinclude'
    ].includes(relativePath)
  ) {
    return [];
  }

  const checks = new Set();

  if (relativePath.startsWith('client/')) {
    checks.add('client');
  }

  if (relativePath.startsWith('server/')) {
    checks.add('server');
  }

  if (relativePath.startsWith('shared/')) {
    checks.add('client');
    checks.add('server');
    checks.add('tests');
  }

  if (
    relativePath.startsWith('tests/') ||
    ['vitest.config.ts', 'tsconfig.test.json', 'package.json', 'package-lock.json'].includes(relativePath)
  ) {
    checks.add('tests');
  }

  return [...checks];
}

export function summarizeFailures(results) {
  const failed = results.find((result) => !result.ok);
  if (!failed) return '';
  return `${failed.label} failed.\n${failed.summary}`.trim();
}

export async function runChecks(checks) {
  const results = [];

  for (const check of checks) {
    const result = await runCheck(check);
    results.push(result);
    if (!result.ok) {
      break;
    }
  }

  return results;
}

export async function findUnstagedTrackedChanges() {
  const result = await runProcess('git', ['status', '--porcelain=v1', '--untracked-files=no'], {
    cwd: projectDir,
    label: 'git status',
    allowFailure: true
  });

  if (result.exitCode !== 0) {
    return [`Could not inspect git status: ${result.summary}`];
  }

  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => line.length >= 3 && line[1] !== ' ')
    .map((line) => line.slice(3));
}

function describeCheck(check) {
  switch (check) {
    case 'client':
      return 'client typecheck';
    case 'server':
      return 'server typecheck';
    case 'tests':
      return 'root test suite';
    default:
      return check;
  }
}

async function runCheck(check) {
  switch (check) {
    case 'client': {
      const command = localBin('client', 'tsc');
      if (!commandExists(command)) {
        return {
          ok: false,
          label: describeCheck(check),
          summary: 'Missing client TypeScript binary at client/node_modules/.bin/tsc.'
        };
      }

      return runProcess(command, ['--noEmit'], {
        cwd: path.join(projectDir, 'client'),
        label: describeCheck(check)
      });
    }

    case 'server': {
      const command = localBin('server', 'tsc');
      if (!commandExists(command)) {
        return {
          ok: false,
          label: describeCheck(check),
          summary: 'Missing server TypeScript binary at server/node_modules/.bin/tsc.'
        };
      }

      return runProcess(command, ['--noEmit', '-p', 'tsconfig.json'], {
        cwd: path.join(projectDir, 'server'),
        label: describeCheck(check)
      });
    }

    case 'tests':
      return runProcess(npmCommand(), ['test'], {
        cwd: projectDir,
        label: describeCheck(check)
      });

    default:
      return {
        ok: true,
        label: check,
        summary: 'Skipped unknown check.'
      };
  }
}

function runProcess(command, args, options) {
  const { cwd, label, allowFailure = false } = options;

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      resolve({
        ok: false,
        label,
        stdout,
        stderr,
        summary: error.message
      });
    });

    child.on('close', (code) => {
      const ok = code === 0;
      const output = (stderr || stdout).trim();

      resolve({
        ok: ok || allowFailure,
        label,
        stdout,
        stderr,
        exitCode: code ?? 1,
        summary: output ? tailLines(output, 30) : `${label} exited with code ${code ?? 1}.`
      });
    });
  });
}

function tailLines(text, count) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.slice(-count).join('\n');
}
