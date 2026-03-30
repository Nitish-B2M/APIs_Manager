import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../utils/db';
import { ApiResponse } from '../utils/response';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';
import * as git from '../services/gitService';
import { logErrorReport } from '../utils/logger';
import { ERROR_CODES } from '../constants/errorCodes';

const router = Router();
const SERVICE_NAME = 'GitManagerService';

// ─── Repositories CRUD ───────────────────────────────────────────────

// List saved repositories
router.get('/repos', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { rows } = await query(
            'SELECT * FROM git_repositories WHERE "userId" = $1 ORDER BY "lastOpened" DESC',
            [req.user!.userId]
        );

        // Enrich with live git info
        const repos = rows.map((row: any) => {
            const isRepo = git.isGitRepo(row.path);
            const info = isRepo ? git.getRepoInfo(row.path) : null;
            return { ...row, valid: isRepo, branch: info?.branch, remote: info?.remote, lastCommit: info?.lastCommit };
        });

        res.json(ApiResponse.success({ message: 'Repositories fetched', data: repos }));
    } catch (error: any) {
        logErrorReport('listRepos', SERVICE_NAME, error, ERROR_CODES.GIT_COMMAND_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch repositories' }));
    }
}));

// Add a repository
router.post('/repos', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ path: z.string().min(1) });
        const { path: repoPath } = schema.parse(req.body);

        if (!git.isGitRepo(repoPath)) {
            res.status(400).json(ApiResponse.error({ message: 'Not a valid git repository' }));
            return;
        }

        const info = git.getRepoInfo(repoPath);

        // Check if already added
        const { rows: existing } = await query(
            'SELECT id FROM git_repositories WHERE "userId" = $1 AND path = $2',
            [req.user!.userId, repoPath]
        );
        if (existing.length > 0) {
            await query('UPDATE git_repositories SET "lastOpened" = NOW() WHERE id = $1', [existing[0].id]);
            res.json(ApiResponse.success({ message: 'Repository already exists, updated last opened', data: { id: existing[0].id, ...info } }));
            return;
        }

        const { rows } = await query(
            'INSERT INTO git_repositories ("userId", name, path) VALUES ($1, $2, $3) RETURNING *',
            [req.user!.userId, info.name, repoPath]
        );

        res.json(ApiResponse.success({ message: 'Repository added', data: { ...rows[0], ...info } }));
    } catch (error: any) {
        logErrorReport('addRepo', SERVICE_NAME, error, ERROR_CODES.GIT_COMMAND_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to add repository' }));
    }
}));

// Remove a repository (just removes from saved list, doesn't delete files)
router.delete('/repos/:id', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        await query('DELETE FROM git_repositories WHERE id = $1 AND "userId" = $2', [req.params.id, req.user!.userId]);
        res.json(ApiResponse.success({ message: 'Repository removed' }));
    } catch (error: any) {
        logErrorReport('removeRepo', SERVICE_NAME, error, ERROR_CODES.GIT_COMMAND_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to remove repository' }));
    }
}));

// ─── Status ──────────────────────────────────────────────────────────

router.post('/status', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { path: repoPath } = z.object({ path: z.string() }).parse(req.body);
        const status = git.getStatus(repoPath);
        const info = git.getRepoInfo(repoPath);
        res.json(ApiResponse.success({ message: 'Status fetched', data: { ...status, ...info } }));
    } catch (error: any) {
        logErrorReport('getStatus', SERVICE_NAME, error, ERROR_CODES.GIT_COMMAND_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch status' }));
    }
}));

// ─── Diff ────────────────────────────────────────────────────────────

router.post('/diff', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ path: z.string(), file: z.string(), staged: z.boolean().default(false) });
        const { path: repoPath, file, staged } = schema.parse(req.body);
        const diff = git.getDiff(repoPath, file, staged);
        res.json(ApiResponse.success({ message: 'Diff fetched', data: { diff } }));
    } catch (error: any) {
        logErrorReport('getDiff', SERVICE_NAME, error, ERROR_CODES.GIT_COMMAND_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch diff' }));
    }
}));

// ─── Stage / Unstage ─────────────────────────────────────────────────

router.post('/stage', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ path: z.string(), files: z.array(z.string()).optional(), all: z.boolean().default(false) });
        const { path: repoPath, files, all } = schema.parse(req.body);

        const result = all ? git.stageAll(repoPath) : git.stageFiles(repoPath, files || []);
        if (!result.success) {
            res.status(400).json(ApiResponse.error({ message: result.error || 'Failed to stage' }));
            return;
        }
        res.json(ApiResponse.success({ message: 'Files staged' }));
    } catch (error: any) {
        logErrorReport('stageFiles', SERVICE_NAME, error, ERROR_CODES.GIT_COMMAND_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to stage files' }));
    }
}));

router.post('/unstage', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ path: z.string(), files: z.array(z.string()).optional(), all: z.boolean().default(false) });
        const { path: repoPath, files, all } = schema.parse(req.body);

        const result = all ? git.unstageAll(repoPath) : git.unstageFiles(repoPath, files || []);
        if (!result.success) {
            res.status(400).json(ApiResponse.error({ message: result.error || 'Failed to unstage' }));
            return;
        }
        res.json(ApiResponse.success({ message: 'Files unstaged' }));
    } catch (error: any) {
        logErrorReport('unstageFiles', SERVICE_NAME, error, ERROR_CODES.GIT_COMMAND_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to unstage files' }));
    }
}));

router.post('/discard', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ path: z.string(), files: z.array(z.string()) });
        const { path: repoPath, files } = schema.parse(req.body);

        const result = git.discardChanges(repoPath, files);
        if (!result.success) {
            res.status(400).json(ApiResponse.error({ message: result.error || 'Failed to discard' }));
            return;
        }
        res.json(ApiResponse.success({ message: 'Changes discarded' }));
    } catch (error: any) {
        logErrorReport('discardChanges', SERVICE_NAME, error, ERROR_CODES.GIT_COMMAND_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to discard changes' }));
    }
}));

// ─── Commit ──────────────────────────────────────────────────────────

router.post('/commit', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ path: z.string(), message: z.string().min(1, 'Commit message required') });
        const { path: repoPath, message } = schema.parse(req.body);

        const result = git.commit(repoPath, message);
        if (!result.success) {
            res.status(400).json(ApiResponse.error({ message: result.error || 'Commit failed' }));
            return;
        }
        res.json(ApiResponse.success({ message: 'Committed successfully', data: { output: result.stdout } }));
    } catch (error: any) {
        logErrorReport('commit', SERVICE_NAME, error, ERROR_CODES.GIT_COMMAND_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to commit' }));
    }
}));

// ─── Push / Pull / Fetch ─────────────────────────────────────────────

router.post('/push', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ path: z.string(), remote: z.string().default('origin'), branch: z.string().optional() });
        const { path: repoPath, remote, branch } = schema.parse(req.body);

        const result = git.push(repoPath, remote, branch);
        if (!result.success) {
            res.status(400).json(ApiResponse.error({ message: result.error || 'Push failed' }));
            return;
        }
        res.json(ApiResponse.success({ message: 'Pushed successfully', data: { output: result.stdout } }));
    } catch (error: any) {
        logErrorReport('push', SERVICE_NAME, error, ERROR_CODES.GIT_PUSH_PULL_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to push' }));
    }
}));

router.post('/pull', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ path: z.string(), remote: z.string().default('origin'), branch: z.string().optional() });
        const { path: repoPath, remote, branch } = schema.parse(req.body);

        const result = git.pull(repoPath, remote, branch);
        if (!result.success) {
            res.status(400).json(ApiResponse.error({ message: result.error || 'Pull failed' }));
            return;
        }
        res.json(ApiResponse.success({ message: 'Pulled successfully', data: { output: result.stdout } }));
    } catch (error: any) {
        logErrorReport('pull', SERVICE_NAME, error, ERROR_CODES.GIT_PUSH_PULL_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to pull' }));
    }
}));

router.post('/fetch', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ path: z.string(), remote: z.string().default('origin') });
        const { path: repoPath, remote } = schema.parse(req.body);

        const result = git.fetch(repoPath, remote);
        if (!result.success) {
            res.status(400).json(ApiResponse.error({ message: result.error || 'Fetch failed' }));
            return;
        }
        res.json(ApiResponse.success({ message: 'Fetched successfully' }));
    } catch (error: any) {
        logErrorReport('fetch', SERVICE_NAME, error, ERROR_CODES.GIT_PUSH_PULL_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch' }));
    }
}));

// ─── Branches ────────────────────────────────────────────────────────

router.post('/branches', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { path: repoPath } = z.object({ path: z.string() }).parse(req.body);
        const branches = git.listBranches(repoPath);
        res.json(ApiResponse.success({ message: 'Branches fetched', data: branches }));
    } catch (error: any) {
        logErrorReport('listBranches', SERVICE_NAME, error, ERROR_CODES.GIT_BRANCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to list branches' }));
    }
}));

router.post('/branches/switch', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ path: z.string(), branch: z.string() });
        const { path: repoPath, branch } = schema.parse(req.body);

        const result = git.switchBranch(repoPath, branch);
        if (!result.success) {
            res.status(400).json(ApiResponse.error({ message: result.error || 'Switch failed' }));
            return;
        }
        res.json(ApiResponse.success({ message: `Switched to ${branch}` }));
    } catch (error: any) {
        logErrorReport('switchBranch', SERVICE_NAME, error, ERROR_CODES.GIT_BRANCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to switch branch' }));
    }
}));

router.post('/branches/create', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ path: z.string(), branch: z.string(), checkout: z.boolean().default(true) });
        const { path: repoPath, branch, checkout } = schema.parse(req.body);

        const result = git.createBranch(repoPath, branch, checkout);
        if (!result.success) {
            res.status(400).json(ApiResponse.error({ message: result.error || 'Create branch failed' }));
            return;
        }
        res.json(ApiResponse.success({ message: `Branch ${branch} created` }));
    } catch (error: any) {
        logErrorReport('createBranch', SERVICE_NAME, error, ERROR_CODES.GIT_BRANCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to create branch' }));
    }
}));

router.post('/branches/delete', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ path: z.string(), branch: z.string(), force: z.boolean().default(false) });
        const { path: repoPath, branch, force } = schema.parse(req.body);

        const result = git.deleteBranch(repoPath, branch, force);
        if (!result.success) {
            res.status(400).json(ApiResponse.error({ message: result.error || 'Delete branch failed' }));
            return;
        }
        res.json(ApiResponse.success({ message: `Branch ${branch} deleted` }));
    } catch (error: any) {
        logErrorReport('deleteBranch', SERVICE_NAME, error, ERROR_CODES.GIT_BRANCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to delete branch' }));
    }
}));

router.post('/branches/merge', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ path: z.string(), branch: z.string() });
        const { path: repoPath, branch } = schema.parse(req.body);

        const result = git.mergeBranch(repoPath, branch);
        if (!result.success) {
            res.status(400).json(ApiResponse.error({ message: result.error || 'Merge failed' }));
            return;
        }
        res.json(ApiResponse.success({ message: `Merged ${branch}`, data: { output: result.stdout } }));
    } catch (error: any) {
        logErrorReport('mergeBranch', SERVICE_NAME, error, ERROR_CODES.GIT_BRANCH_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to merge branch' }));
    }
}));

// ─── Log / History ───────────────────────────────────────────────────

router.post('/log', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ path: z.string(), limit: z.number().default(50), skip: z.number().default(0) });
        const { path: repoPath, limit, skip } = schema.parse(req.body);
        const log = git.getLog(repoPath, limit, skip);
        res.json(ApiResponse.success({ message: 'Log fetched', data: log }));
    } catch (error: any) {
        logErrorReport('getLog', SERVICE_NAME, error, ERROR_CODES.GIT_COMMAND_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to fetch log' }));
    }
}));

// ─── Stash ───────────────────────────────────────────────────────────

router.post('/stash', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ path: z.string(), message: z.string().optional() });
        const { path: repoPath, message } = schema.parse(req.body);

        const result = git.stash(repoPath, message);
        if (!result.success) {
            res.status(400).json(ApiResponse.error({ message: result.error || 'Stash failed' }));
            return;
        }
        res.json(ApiResponse.success({ message: 'Changes stashed' }));
    } catch (error: any) {
        logErrorReport('stash', SERVICE_NAME, error, ERROR_CODES.GIT_COMMAND_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to stash changes' }));
    }
}));

router.post('/stash/pop', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { path: repoPath } = z.object({ path: z.string() }).parse(req.body);
        const result = git.stashPop(repoPath);
        if (!result.success) {
            res.status(400).json(ApiResponse.error({ message: result.error || 'Stash pop failed' }));
            return;
        }
        res.json(ApiResponse.success({ message: 'Stash popped' }));
    } catch (error: any) {
        logErrorReport('stashPop', SERVICE_NAME, error, ERROR_CODES.GIT_COMMAND_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to pop stash' }));
    }
}));

router.post('/stash/list', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { path: repoPath } = z.object({ path: z.string() }).parse(req.body);
        const list = git.stashList(repoPath);
        res.json(ApiResponse.success({ message: 'Stash list fetched', data: list }));
    } catch (error: any) {
        logErrorReport('stashList', SERVICE_NAME, error, ERROR_CODES.GIT_COMMAND_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to list stashes' }));
    }
}));

// ─── Clone ───────────────────────────────────────────────────────────

router.post('/clone', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ url: z.string().url(), targetDir: z.string() });
        const { url, targetDir } = schema.parse(req.body);

        const result = git.clone(url, targetDir);
        if (!result.success) {
            res.status(400).json(ApiResponse.error({ message: result.error || 'Clone failed' }));
            return;
        }

        // Auto-save to repos
        const info = git.getRepoInfo(targetDir);
        await query(
            'INSERT INTO git_repositories ("userId", name, path) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [req.user!.userId, info.name, targetDir]
        );

        res.json(ApiResponse.success({ message: 'Cloned successfully', data: info }));
    } catch (error: any) {
        logErrorReport('clone', SERVICE_NAME, error, ERROR_CODES.GIT_COMMAND_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to clone repository' }));
    }
}));

// ─── Remotes ─────────────────────────────────────────────────────────

router.post('/remotes', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const { path: repoPath } = z.object({ path: z.string() }).parse(req.body);
        const remotes = git.listRemotes(repoPath);
        res.json(ApiResponse.success({ message: 'Remotes fetched', data: remotes }));
    } catch (error: any) {
        logErrorReport('listRemotes', SERVICE_NAME, error, ERROR_CODES.GIT_COMMAND_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to list remotes' }));
    }
}));

router.post('/remotes/add', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ path: z.string(), name: z.string(), url: z.string() });
        const { path: repoPath, name, url } = schema.parse(req.body);

        const result = git.addRemote(repoPath, name, url);
        if (!result.success) {
            res.status(400).json(ApiResponse.error({ message: result.error || 'Add remote failed' }));
            return;
        }
        res.json(ApiResponse.success({ message: `Remote ${name} added` }));
    } catch (error: any) {
        logErrorReport('addRemote', SERVICE_NAME, error, ERROR_CODES.GIT_COMMAND_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to add remote' }));
    }
}));

router.post('/remotes/remove', authMiddleware, catchAsync(async (req: AuthRequest, res: Response) => {
    try {
        const schema = z.object({ path: z.string(), name: z.string() });
        const { path: repoPath, name } = schema.parse(req.body);

        const result = git.removeRemote(repoPath, name);
        if (!result.success) {
            res.status(400).json(ApiResponse.error({ message: result.error || 'Remove remote failed' }));
            return;
        }
        res.json(ApiResponse.success({ message: `Remote ${name} removed` }));
    } catch (error: any) {
        logErrorReport('removeRemote', SERVICE_NAME, error, ERROR_CODES.GIT_COMMAND_FAILED);
        res.status(500).json(ApiResponse.error({ message: 'Failed to remove remote' }));
    }
}));

export default router;
