// Background jobs: each records its kind, key, conversation, abort controller and done promise.
// Each kind keeps its own rule for sharing or replacing a running job at its call site.
export function backgroundJobs() {
    const jobs = new Map();
    const id = (kind, key) => JSON.stringify([kind, key]);
    // A job leaves only if no newer one replaced it.
    const remove = (job) => {
        if (jobs.get(id(job.kind, job.key)) === job) jobs.delete(id(job.kind, job.key));
    };
    const list = (kind) => [...jobs.values()].filter((job) => !kind || job.kind === kind);
    return {
        // run(job) returns the job's whole promise; the job leaves when it settles unless a newer one replaced it.
        // A kept job stays after it settles, to be reused or retried, until remove(job).
        // A controller passed in lets a job take over work that is already running.
        // settled() skips a job started with settle: false, one that ends with its request or waits for the learner.
        start(
            kind,
            key,
            conversation,
            run,
            { keep = false, controller = new AbortController(), settle = true } = {},
        ) {
            const job = { kind, key, conversation, controller, settle };
            jobs.set(id(kind, key), job);
            job.done = run(job);
            if (!keep) job.done = job.done.finally(() => remove(job));
            return job;
        },
        get: (kind, key) => jobs.get(id(kind, key)),
        remove,
        // Every running or kept job, or those of one kind.
        list,
        // Awaits every job, or those keyed by one artifact.
        settled: (key) =>
            Promise.allSettled(
                list()
                    .filter((job) => job.settle && (!key || job.key === key))
                    .map((job) => job.done),
            ),
        // Aborts and removes every job, or those of the given conversations; resolves once each has ended.
        stop(conversations) {
            const ending = list().filter(
                (job) => !conversations || conversations.includes(job.conversation),
            );
            for (const job of ending) {
                job.controller.abort();
                remove(job);
            }
            return Promise.allSettled(ending.map((job) => job.done));
        },
    };
}
