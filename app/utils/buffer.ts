export function bufferWatchEvents<T extends unknown[]>(
  timeInMs: number,
  maxBufferSize: number,
  cb: (events: T[]) => unknown,
) {
  let timeoutId: number | undefined;
  let events: T[] = [];
  let processing: Promise<unknown> = Promise.resolve();

  const flush = async () => {
    // we wait until the previous batch is entirely processed so events are processed in order
    await processing;

    if (events.length > 0) {
      processing = Promise.resolve(cb(events));
    }

    timeoutId = undefined;
    events = [];
  };

  const scheduleBufferTick = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = self.setTimeout(flush, timeInMs);
  };

  return (...args: T) => {
    events.push(args);

    if (events.length >= maxBufferSize) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      void flush();
    } else {
      scheduleBufferTick();
    }
  };
}
