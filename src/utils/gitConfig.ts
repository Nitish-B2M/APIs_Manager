import { execSync } from 'child_process';

/**
 * Update the global git config user.name and user.email.
 */
export function updateGitConfig(name: string, email: string): { success: boolean; error?: string } {
    try {
        execSync(`git config --global user.name "${name}"`, { stdio: 'pipe' });
        execSync(`git config --global user.email "${email}"`, { stdio: 'pipe' });
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Store GitHub credentials so `git push` authenticates as this account.
 * Updates BOTH:
 *   1. git:https://github.com  (used by git CLI for push/pull)
 *   2. GitHub Desktop app credential (used by GitHub Desktop)
 *
 * Uses Windows Credential Manager via `cmdkey` + `git credential approve`.
 */
export function storeGitCredentials(username: string, token: string): { success: boolean; error?: string } {
    const errors: string[] = [];

    // ── 1. Update git CLI credential (git:https://github.com) ──
    try {
        // Reject old credential first
        try {
            const rejectInput = 'protocol=https\nhost=github.com\n\n';
            execSync('git credential reject', { input: rejectInput, stdio: 'pipe' });
        } catch {
            // OK if nothing to reject
        }

        // Store new credential
        const approveInput = `protocol=https\nhost=github.com\nusername=${username}\npassword=${token}\n\n`;
        execSync('git credential approve', { input: approveInput, stdio: 'pipe' });
    } catch (err: any) {
        errors.push(`git credential: ${err.message}`);
    }

    // ── 2. Update GitHub Desktop credential ──
    // GitHub Desktop stores credentials in Windows Credential Manager as:
    //   Target: "GitHub - https://api.github.com/{username}"
    // We need to remove old GitHub Desktop entries and add the new one.
    try {
        // Find and remove existing GitHub Desktop credentials
        const cmdkeyOutput = execSync('cmdkey /list', { stdio: 'pipe' }).toString();
        const ghDesktopTargets = cmdkeyOutput
            .split('\n')
            .filter(line => line.includes('Target:') && line.includes('GitHub - https://api.github.com'))
            .map(line => {
                const match = line.match(/Target:\s*(.+)/);
                return match ? match[1].trim() : null;
            })
            .filter(Boolean) as string[];

        for (const target of ghDesktopTargets) {
            try {
                execSync(`cmdkey /delete:"${target}"`, { stdio: 'pipe' });
            } catch {
                // May fail if target format differs slightly
            }
        }

        // Add new GitHub Desktop credential
        // GitHub Desktop expects: "GitHub - https://api.github.com/{username}"
        execSync(
            `cmdkey /generic:"GitHub - https://api.github.com/${username}" /user:"${username}" /pass:"${token}"`,
            { stdio: 'pipe' }
        );
    } catch (err: any) {
        errors.push(`GitHub Desktop credential: ${err.message}`);
    }

    // ── 3. Also update the gh CLI credential if present ──
    try {
        // gh:github.com entries are used by the `gh` CLI tool
        const cmdkeyOutput = execSync('cmdkey /list', { stdio: 'pipe' }).toString();
        const ghCliTargets = cmdkeyOutput
            .split('\n')
            .filter(line => line.includes('Target:') && line.includes('gh:github.com'))
            .map(line => {
                const match = line.match(/Target:\s*(.+)/);
                return match ? match[1].trim() : null;
            })
            .filter(Boolean) as string[];

        // Remove old gh CLI credentials
        for (const target of ghCliTargets) {
            try {
                execSync(`cmdkey /delete:"${target}"`, { stdio: 'pipe' });
            } catch {
                // OK
            }
        }

        // Add new gh CLI credential
        execSync(
            `cmdkey /generic:"gh:github.com:${username}" /user:"${username}" /pass:"${token}"`,
            { stdio: 'pipe' }
        );
    } catch (err: any) {
        // Non-critical — gh CLI may not be installed
    }

    if (errors.length > 0) {
        return { success: false, error: errors.join('; ') };
    }
    return { success: true };
}

/**
 * Read current global git config values.
 */
export function readGitConfig(): { name: string | null; email: string | null } {
    try {
        const name = execSync('git config --global user.name', { stdio: 'pipe' }).toString().trim();
        const email = execSync('git config --global user.email', { stdio: 'pipe' }).toString().trim();
        return { name, email };
    } catch {
        return { name: null, email: null };
    }
}

/**
 * Read which GitHub account is currently stored in Windows Credential Manager
 * for git push (git:https://github.com) and GitHub Desktop.
 */
export function readStoredCredentials(): { gitCli: string | null; githubDesktop: string | null } {
    let gitCli: string | null = null;
    let githubDesktop: string | null = null;

    try {
        const output = execSync('cmdkey /list', { stdio: 'pipe' }).toString();
        const lines = output.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // git CLI credential
            if (line.includes('git:https://github.com')) {
                const userLine = lines.slice(i + 1, i + 5).find(l => l.trim().startsWith('User:'));
                if (userLine) gitCli = userLine.split(':').slice(1).join(':').trim();
            }
            // GitHub Desktop credential
            if (line.includes('GitHub - https://api.github.com/')) {
                const match = line.match(/api\.github\.com\/(\S+)/);
                if (match) githubDesktop = match[1];
            }
        }
    } catch {
        // cmdkey not available or failed
    }

    return { gitCli, githubDesktop };
}
