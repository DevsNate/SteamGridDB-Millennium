// Millennium: Runs the first call straight away, then at most once per delay with the latest arguments.
const leadingDebounce = <Args extends unknown[]>(fn: (...args: Args) => unknown, delay: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Args | undefined;

  const run = (args: Args) => {
    timer = setTimeout(() => {
      timer = undefined;
      if (!pending) return;
      const next = pending;
      pending = undefined;
      run(next);
    }, delay);
    fn(...args);
  };

  return (...args: Args) => {
    if (timer) pending = args;
    else run(args);
  };
};

export default leadingDebounce;
