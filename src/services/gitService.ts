import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface ExecResult {
    stdout: string;
    success: boolean;
    error?: string;
}

/** Safely execute a git command in a specific repo directory */
function execGit(repoPath: string, args: string): ExecResult {
    try {
        // Validate repo path exists
        if (!fs.existsSync(repoPath)) {
            return { stdout: '', success: false, error: 'Repository path does not exist' };
        }
        const stdout = execSync(`git ${args}`, {
            cwd: repoPath,
            stdio: 'pipe',
            timeout: 30000,
            encoding: 'utf8',
        });
        return { stdout: stdout.trim(), success: true };
    } catch (err: any) {
        return { stdout: err.stdout?.toString() || '', success: false, error: err.stderr?.toString()?.trim() || err.message };
    }
}

// ─── Repository Info ─────────────────────────────────────────────────

export function isGitRepo(repoPath: string): boolean {
    const result = execGit(repoPath, 'rev-parse --is-inside-work-tree');
    return result.success && result.stdout === 'true';
}

export function getRepoInfo(repoPath: string) {
    const branch = execGit(repoPath, 'rev-parse --abbrev-ref HEAD');
    const remote = execGit(repoPath, 'remote get-url origin');
    const repoName = path.basename(repoPath);
    const lastCommit = execGit(repoPath, 'log -1 --format="%H|%s|%an|%ae|%ar"');

    let lastCommitData = null;
    if (lastCommit.success && lastCommit.stdout) {
        const [hash, message, author, email, timeAgo] = lastCommit.stdout.split('|');
        lastCommitData = { hash, message, author, email, timeAgo };
    }

    return {
        name: repoName,
        path: repoPath,
        branch: branch.success ? branch.stdout : null,
        remote: remote.success ? remote.stdout : null,
        lastCommit: lastCommitData,
    };
}

// ─── Status ──────────────────────────────────────────────────────────

export interface FileChange {
    path: string;
    status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflict';
    staged: boolean;
    statusCode: string;
}

export function getStatus(repoPath: string): { files: FileChange[]; ahead: number; behind: number; branch: string | null } {
    const files: FileChange[] = [];

    // git status --porcelain=v1 format: "XY PATH" or "XY ORIG -> PATH" for renames
    // X = index status (col 0), Y = worktree status (col 1), space (col 2), path (col 3+)
    const result = execGit(repoPath, 'status --porcelain=v1 -u');
    if (result.success && result.stdout) {
        for (const line of result.stdout.split('\n')) {
            if (!line || line.length < 4) continue;

            // Use regex for bulletproof parsing: exactly 2 status chars, then space, then path
            const match = line.match(/^(.)(.) (.+)$/);
            if (!match) continue;

            const indexStatus = match[1];
            const workTreeStatus = match[2];
            let filePath = match[3].trim();

            // Handle renames: "R  old -> new"
            if (filePath.includes(' -> ')) {
                filePath = filePath.split(' -> ').pop()!.trim();
            }

            if (!filePath) continue;

            // Staged changes (index column has a real status letter)
            if (indexStatus !== ' ' && indexStatus !== '?') {
                files.push({
                    path: filePath,
                    status: mapStatus(indexStatus),
                    staged: true,
                    statusCode: indexStatus,
                });
            }

            // Unstaged/worktree changes
            if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
                files.push({
                    path: filePath,
                    status: mapStatus(workTreeStatus),
                    staged: false,
                    statusCode: workTreeStatus,
                });
            }

            // Untracked files
            if (indexStatus === '?' && workTreeStatus === '?') {
                files.push({
                    path: filePath,
                    status: 'untracked',
                    staged: false,
                    statusCode: '??',
                });
            }
        }
    }

    // Ahead/behind counts
    let ahead = 0, behind = 0;
    const abResult = execGit(repoPath, 'rev-list --left-right --count HEAD...@{upstream}');
    if (abResult.success && abResult.stdout) {
        const parts = abResult.stdout.split(/\s+/);
        ahead = parseInt(parts[0]) || 0;
        behind = parseInt(parts[1]) || 0;
    }

    const branchResult = execGit(repoPath, 'rev-parse --abbrev-ref HEAD');

    return {
        files,
        ahead,
        behind,
        branch: branchResult.success ? branchResult.stdout : null,
    };
}

function mapStatus(code: string): FileChange['status'] {
    switch (code) {
        case 'M': return 'modified';
        case 'A': return 'added';
        case 'D': return 'deleted';
        case 'R': return 'renamed';
        case 'U': return 'conflict';
        default: return 'modified';
    }
}

// ─── Diff ────────────────────────────────────────────────────────────

export function getDiff(repoPath: string, filePath: string, staged: boolean): string {
    // Try git diff first
    if (staged) {
        // For staged files: try --cached, then --cached with HEAD
        const cached = execGit(repoPath, `diff --cached -- "${filePath}"`);
        if (cached.success && cached.stdout.length > 0) return cached.stdout;

        // For newly staged files (no previous commit or first add), diff against empty tree
        const emptyTree = execGit(repoPath, `diff --cached 4b825dc642cb6eb9a060e54bf899d69f82623715 -- "${filePath}"`);
        if (emptyTree.success && emptyTree.stdout.length > 0) return emptyTree.stdout;
    } else {
        const result = execGit(repoPath, `diff -- "${filePath}"`);
        if (result.success && result.stdout.length > 0) return result.stdout;
    }

    // Fallback: read the file content directly and show as new-file diff
    const fullPath = path.join(repoPath, filePath);
    if (fs.existsSync(fullPath)) {
        try {
            const stat = fs.statSync(fullPath);
            if (stat.size > 1024 * 512) return '(file too large to display)';

            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('\0')) return '(binary file)';

            const contentLines = content.split('\n');
            const lines = contentLines.map(l => `+${l}`).join('\n');
            return `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${contentLines.length} @@\n${lines}`;
        } catch {
            return '(binary or unreadable file)';
        }
    }

    return '(file not found or no changes)';
}

// ─── Stage / Unstage ─────────────────────────────────────────────────

export function stageFiles(repoPath: string, files: string[]): ExecResult {
    const escaped = files.map(f => `"${f}"`).join(' ');
    return execGit(repoPath, `add ${escaped}`);
}

export function stageAll(repoPath: string): ExecResult {
    return execGit(repoPath, 'add -A');
}

export function unstageFiles(repoPath: string, files: string[]): ExecResult {
    const escaped = files.map(f => `"${f}"`).join(' ');
    // Try reset HEAD first, fall back to rm --cached for initial commits
    const result = execGit(repoPath, `reset HEAD -- ${escaped}`);
    if (!result.success) {
        return execGit(repoPath, `rm --cached ${escaped}`);
    }
    return result;
}

export function unstageAll(repoPath: string): ExecResult {
    // Try reset HEAD first, fall back to rm --cached for initial commits (no HEAD)
    const result = execGit(repoPath, 'reset HEAD');
    if (!result.success) {
        return execGit(repoPath, 'rm -r --cached .');
    }
    return result;
}

export function discardChanges(repoPath: string, files: string[]): ExecResult {
    const escaped = files.map(f => `"${f}"`).join(' ');
    return execGit(repoPath, `checkout -- ${escaped}`);
}

// ─── Commit ──────────────────────────────────────────────────────────

export function commit(repoPath: string, message: string): ExecResult {
    // Use stdin to avoid shell escaping issues with special characters
    try {
        const stdout = execSync('git commit -F -', {
            cwd: repoPath,
            input: message,
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 30000,
            encoding: 'utf8',
        });
        return { stdout: stdout.trim(), success: true };
    } catch (err: any) {
        return { stdout: '', success: false, error: err.stderr?.toString()?.trim() || err.message };
    }
}

// ─── Push / Pull / Fetch ─────────────────────────────────────────────

export function push(repoPath: string, remote = 'origin', branch?: string): ExecResult {
    const branchArg = branch || '';
    return execGit(repoPath, `push ${remote} ${branchArg}`.trim());
}

export function pull(repoPath: string, remote = 'origin', branch?: string): ExecResult {
    const branchArg = branch || '';
    return execGit(repoPath, `pull ${remote} ${branchArg}`.trim());
}

export function fetch(repoPath: string, remote = 'origin'): ExecResult {
    return execGit(repoPath, `fetch ${remote}`);
}

// ─── Branches ────────────────────────────────────────────────────────

export interface BranchInfo {
    name: string;
    current: boolean;
    remote: boolean;
    lastCommit?: string;
}

export function listBranches(repoPath: string): BranchInfo[] {
    const branches: BranchInfo[] = [];

    // Local branches
    const local = execGit(repoPath, 'branch --format="%(HEAD)|%(refname:short)|%(subject)"');
    if (local.success && local.stdout) {
        for (const line of local.stdout.split('\n')) {
            if (!line) continue;
            const [head, name, ...msgParts] = line.split('|');
            branches.push({
                name,
                current: head.trim() === '*',
                remote: false,
                lastCommit: msgParts.join('|'),
            });
        }
    }

    // Remote branches
    const remote = execGit(repoPath, 'branch -r --format="%(refname:short)|%(subject)"');
    if (remote.success && remote.stdout) {
        for (const line of remote.stdout.split('\n')) {
            if (!line || line.includes('HEAD')) continue;
            const [name, ...msgParts] = line.split('|');
            branches.push({
                name,
                current: false,
                remote: true,
                lastCommit: msgParts.join('|'),
            });
        }
    }

    return branches;
}

export function switchBranch(repoPath: string, branchName: string): ExecResult {
    return execGit(repoPath, `checkout "${branchName}"`);
}

export function createBranch(repoPath: string, branchName: string, checkout = true): ExecResult {
    if (checkout) {
        return execGit(repoPath, `checkout -b "${branchName}"`);
    }
    return execGit(repoPath, `branch "${branchName}"`);
}

export function deleteBranch(repoPath: string, branchName: string, force = false): ExecResult {
    const flag = force ? '-D' : '-d';
    return execGit(repoPath, `branch ${flag} "${branchName}"`);
}

export function mergeBranch(repoPath: string, branchName: string): ExecResult {
    return execGit(repoPath, `merge "${branchName}"`);
}

// ─── Log / History ───────────────────────────────────────────────────

export interface CommitLog {
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    email: string;
    date: string;
    timeAgo: string;
}

export function getLog(repoPath: string, limit = 50, skip = 0): CommitLog[] {
    const format = '%H|%h|%s|%an|%ae|%aI|%ar';
    const result = execGit(repoPath, `log --format="${format}" -n ${limit} --skip=${skip}`);
    if (!result.success || !result.stdout) return [];

    return result.stdout.split('\n').filter(Boolean).map(line => {
        const [hash, shortHash, message, author, email, date, timeAgo] = line.split('|');
        return { hash, shortHash, message, author, email, date, timeAgo };
    });
}

// ─── Stash ───────────────────────────────────────────────────────────

export function stash(repoPath: string, message?: string): ExecResult {
    const msg = message ? `push -m "${message}"` : 'push';
    return execGit(repoPath, `stash ${msg}`);
}

export function stashPop(repoPath: string): ExecResult {
    return execGit(repoPath, 'stash pop');
}

export function stashList(repoPath: string): string[] {
    const result = execGit(repoPath, 'stash list');
    if (!result.success || !result.stdout) return [];
    return result.stdout.split('\n').filter(Boolean);
}

// ─── Clone ───────────────────────────────────────────────────────────

export function clone(url: string, targetDir: string): ExecResult {
    try {
        const parentDir = path.dirname(targetDir);
        const dirName = path.basename(targetDir);
        const stdout = execSync(`git clone "${url}" "${dirName}"`, {
            cwd: parentDir,
            stdio: 'pipe',
            timeout: 120000,
            encoding: 'utf8',
        });
        return { stdout: stdout.trim(), success: true };
    } catch (err: any) {
        return { stdout: '', success: false, error: err.stderr?.toString()?.trim() || err.message };
    }
}

// ─── Remotes ─────────────────────────────────────────────────────────

export interface RemoteInfo {
    name: string;
    fetchUrl: string;
    pushUrl: string;
}

export function listRemotes(repoPath: string): RemoteInfo[] {
    const result = execGit(repoPath, 'remote -v');
    if (!result.success || !result.stdout) return [];

    const remotes = new Map<string, RemoteInfo>();
    for (const line of result.stdout.split('\n')) {
        if (!line) continue;
        const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)/);
        if (match) {
            const [, name, url, type] = match;
            if (!remotes.has(name)) {
                remotes.set(name, { name, fetchUrl: '', pushUrl: '' });
            }
            const remote = remotes.get(name)!;
            if (type === 'fetch') remote.fetchUrl = url;
            if (type === 'push') remote.pushUrl = url;
        }
    }
    return Array.from(remotes.values());
}

export function addRemote(repoPath: string, name: string, url: string): ExecResult {
    return execGit(repoPath, `remote add "${name}" "${url}"`);
}

export function removeRemote(repoPath: string, name: string): ExecResult {
    return execGit(repoPath, `remote remove "${name}"`);
}
