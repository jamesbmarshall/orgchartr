import { execFile } from 'child_process';
import { DATA_DIR } from './dataStore';

// data/ is its own independent git repo (separate from the app code repo), so
// partner/sponsor data never has to live in the same remote as the app source.
// Git commands run with DATA_DIR as the repo root - no pathspec scoping needed
// since the whole repo IS the data.
function git(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: DATA_DIR }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function gitStatus(): Promise<{ clean: boolean; files: string[] }> {
  const out = await git(['status', '--porcelain']);
  const files = out ? out.split('\n').filter(Boolean) : [];
  return { clean: files.length === 0, files };
}

export async function gitCommit(message: string): Promise<{ committed: boolean; output: string }> {
  const status = await gitStatus();
  if (status.clean) {
    return { committed: false, output: 'Nothing to commit - working tree clean.' };
  }
  await git(['add', '-A']);
  const output = await git(['commit', '-m', message]);
  return { committed: true, output };
}

export async function gitPush(): Promise<string> {
  return git(['push']);
}
