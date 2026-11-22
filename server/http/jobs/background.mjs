// Background jobs: each records its kind, key, conversation, abort controller and done promise.
// Each kind keeps its own rule for sharing or replacing a running job at its call site.
export function backgroundJobs() {
    const jobs = new Map();
    const id = (kind, key) => JSON.stringify([kind, key]);
    // A job leaves only if no newer one replaced it.
    const remove = (job) => {
        if (jobs.get(id(job.kind, job.key)) === job) jobs.delete(id(job.kind, job.key));
    };
    return {
        // run(job) returns the job's whole promise; the job leaves when it settles unless a newer one replaced it.
        // A kept job stays after it settles, to be reused or retried, until remove(job).
        // A controller passed in lets a job take over work that is already running.
        start(
            kind,
            key,
            conversation,
            run,
            { keep = false, controller = new AbortController() } = {},
        ) {
            const job = { kind, key, conversation, controller };
            jobs.set(id(kind, key), job);
            job.done = run(job);
            if (!keep) job.done = job.done.finally(() => remove(job));
            return job;
        },
        get: (kind, key) => jobs.get(id(kind, key)),
        remove,
        // Every running or kept job, or those of one kind.
        list: (kind) => [...jobs.values()].filter((job) => !kind || job.kind === kind),
    };
}
