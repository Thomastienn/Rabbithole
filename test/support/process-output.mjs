// Child output is the readiness signal; the timer only bounds a broken startup.
export function processOutput(child) {
  let output = '';
  for (const pipe of [child.stdout, child.stderr])
    pipe.on('data', (chunk) => {
      output += chunk;
    });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const waitFor = (pattern) =>
    new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        for (const pipe of [child.stdout, child.stderr]) pipe.removeListener('data', check);
        child.removeListener('exit', failed);
        child.removeListener('error', failed);
      };
      const failed = () => {
        cleanup();
        reject(new Error(`Startup failed: ${output}`));
      };
      const check = () => {
        const match = output.match(pattern);
        if (match) {
          cleanup();
          resolve(match);
        } else if (child.exitCode !== null) failed();
      };
      const timer = setTimeout(failed, 60000); // CI runs slow tests 8-way parallel; 20s starved cold startups.
      for (const pipe of [child.stdout, child.stderr]) pipe.on('data', check);
      child.once('exit', failed);
      child.once('error', failed);
      check();
    });
  return { exited, waitFor, output: () => output };
}
