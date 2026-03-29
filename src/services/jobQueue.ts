/**
 * In-process background job queue.
 * Handles: email sending, webhook delivery, AI generation.
 * For production scale, replace with BullMQ + Redis.
 */

type JobHandler = (data: any) => Promise<void>;

interface QueuedJob {
    id: string;
    type: string;
    data: any;
    attempts: number;
    maxAttempts: number;
    status: 'pending' | 'running' | 'completed' | 'failed';
    error?: string;
    createdAt: Date;
    completedAt?: Date;
}

class JobQueue {
    private handlers = new Map<string, JobHandler>();
    private queue: QueuedJob[] = [];
    private processing = false;
    private completedJobs: QueuedJob[] = [];
    private maxCompleted = 100;

    /**
     * Register a handler for a job type.
     */
    register(type: string, handler: JobHandler): void {
        this.handlers.set(type, handler);
    }

    /**
     * Add a job to the queue. Returns immediately.
     */
    enqueue(type: string, data: any, maxAttempts = 3): string {
        const id = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        this.queue.push({
            id,
            type,
            data,
            attempts: 0,
            maxAttempts,
            status: 'pending',
            createdAt: new Date(),
        });
        this.processNext();
        return id;
    }

    /**
     * Process the next pending job.
     */
    private async processNext(): Promise<void> {
        if (this.processing) return;

        const job = this.queue.find(j => j.status === 'pending');
        if (!job) return;

        const handler = this.handlers.get(job.type);
        if (!handler) {
            job.status = 'failed';
            job.error = `No handler registered for job type: ${job.type}`;
            this.moveToCompleted(job);
            this.processNext();
            return;
        }

        this.processing = true;
        job.status = 'running';
        job.attempts++;

        try {
            await handler(job.data);
            job.status = 'completed';
            job.completedAt = new Date();
            this.moveToCompleted(job);
        } catch (err: any) {
            if (job.attempts < job.maxAttempts) {
                job.status = 'pending'; // Retry
                console.log(`[JobQueue] Job ${job.id} (${job.type}) failed, retrying (${job.attempts}/${job.maxAttempts}): ${err.message}`);
            } else {
                job.status = 'failed';
                job.error = err.message;
                job.completedAt = new Date();
                this.moveToCompleted(job);
                console.error(`[JobQueue] Job ${job.id} (${job.type}) permanently failed: ${err.message}`);
            }
        }

        this.processing = false;
        // Process next in queue
        setTimeout(() => this.processNext(), 100);
    }

    private moveToCompleted(job: QueuedJob): void {
        this.queue = this.queue.filter(j => j.id !== job.id);
        this.completedJobs.unshift(job);
        if (this.completedJobs.length > this.maxCompleted) {
            this.completedJobs = this.completedJobs.slice(0, this.maxCompleted);
        }
    }

    /**
     * Get queue stats for monitoring.
     */
    getStats(): { pending: number; running: number; completed: number; failed: number; recentJobs: QueuedJob[] } {
        return {
            pending: this.queue.filter(j => j.status === 'pending').length,
            running: this.queue.filter(j => j.status === 'running').length,
            completed: this.completedJobs.filter(j => j.status === 'completed').length,
            failed: this.completedJobs.filter(j => j.status === 'failed').length,
            recentJobs: this.completedJobs.slice(0, 20),
        };
    }
}

export const jobQueue = new JobQueue();
