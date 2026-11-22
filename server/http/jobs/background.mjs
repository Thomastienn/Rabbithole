// Background jobs: each records its kind, key, conversation, abort controller and done promise.
// Each kind keeps its own rule for sharing or replacing a running job at its call site.
export function backgroundJobs() {
    const jobs = new Map();
    const id = (kind, key) => JSON.stringify([kind, key]);
    return {
        // run(job) returns the job's whole promise; the job leaves when it settles unless a newer one replaced it.
        start(kind, key, conversation, run) {
            const job = { kind, key, conversation, controller: new AbortController() };
            jobs.set(id(kind, key), job);
            job.done = run(job).finally(() => {
                if (jobs.get(id(kind, key)) === job) jobs.delete(id(kind, key));
            });
            return job;
        },
        get: (kind, key) => jobs.get(id(kind, key)),
        // Every running job, or those of one kind.
        list: (kind) => [...jobs.values()].filter((job) => !kind || job.kind === kind),
    };
}
