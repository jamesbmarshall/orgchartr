import { execFile } from 'child_process';
import path from 'path';

// The repo root as checked out on the host and bind-mounted into the container.
// REPO_DIR env var wins (set in docker-compose); otherwise assume local dev layout
// (server/src/lib -> ../../../ = repo root).
const REPO_DIR = process.env.REPO_DIR
  ? path.resolve(process.env.REPO_DIR)
  : path.resolve(__dirname, '../../../');

function git(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: REPO_DIR }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function gitStatus(): Promise<{ clean: boolean; files: string[] }> {
  const out = await git(['status', '--porcelain', '--', 'data']);
  const files = out ? out.split('\n').filter(Boolean) : [];
  return { clean: files.length === 0, files };
}

export async function gitCommit(message: string): Promise<{ committed: boolean; output: string }> {
  const status = await gitStatus();
  if (status.clean) {
    return { committed: false, output: 'Nothing to commit - working tree clean.' };
  }
  await git(['add', '-A', '--', 'data']);
  const output = await git(['commit', '-m', message]);
  return { committed: true, output };
}

export async function gitPush(): Promise<string> {
  return git(['push']);
}
