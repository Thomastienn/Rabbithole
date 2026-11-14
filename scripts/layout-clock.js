// Fixture init script: a controlled clock for the one-minute layout batch.
// One-minute timers wait until the fixture calls __layoutMinute(); /layout POSTs are counted.
(() => {
  const set = window.setTimeout,
    clear = window.clearTimeout,
    due = new Map();
  let next = 0;
  window.setTimeout = (fn, ms, ...args) =>
    ms === 60000 ? (due.set(--next, fn), next) : set(fn, ms, ...args);
  window.clearTimeout = (id) => (id < 0 ? due.delete(id) : clear(id));
  window.__layoutTimers = () => due.size;
  window.__layoutMinute = () => {
    const fns = [...due.values()];
    due.clear();
    fns.forEach((fn) => fn());
    return fns.length;
  };
  window.__layoutPosts = 0;
  window.__layoutInFlight = 0;
  const fetch = window.fetch;
  window.fetch = (url, options) => {
    if (!String(url).endsWith('/layout')) return fetch(url, options);
    window.__layoutPosts++;
    window.__layoutInFlight++;
    return fetch(url, options).finally(() => {
      window.__layoutInFlight--;
    });
  };
})();
