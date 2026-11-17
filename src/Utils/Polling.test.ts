import { startPolling } from './Polling';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('waits for the first tick and skips ticks for the entire pending cycle', async () => {
    const pending = deferred();
    const poll = jest.fn(() => pending.promise);
    const stop = startPolling(poll, { current: false });
    jest.advanceTimersByTime(2499);
    expect(poll).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    jest.advanceTimersByTime(10000);
    expect(poll).toHaveBeenCalledTimes(1);
    pending.resolve();
    await flush();
    jest.advanceTimersByTime(2500);
    expect(poll).toHaveBeenCalledTimes(2);
    stop();
    await flush();
});

test('cleanup aborts the request and prevents future ticks', async () => {
    const pending = deferred();
    let signal!: AbortSignal;
    const poll = jest.fn((current: AbortSignal) => { signal = current; return pending.promise; });
    const stop = startPolling(poll, { current: false });
    jest.advanceTimersByTime(2500);
    stop();
    expect(signal.aborted).toBe(true);
    jest.advanceTimersByTime(10000);
    expect(poll).toHaveBeenCalledTimes(1);
    pending.resolve();
    await flush();
});

test('effect replacement shares the lock until the old callback settles', async () => {
    const pending = deferred();
    const lock = { current: false };
    const stopOld = startPolling(() => pending.promise, lock);
    jest.advanceTimersByTime(2500);
    stopOld();
    const next = jest.fn(async () => {});
    const stopNew = startPolling(next, lock);
    jest.advanceTimersByTime(5000);
    expect(next).not.toHaveBeenCalled();
    pending.resolve();
    await flush();
    jest.advanceTimersByTime(2500);
    expect(next).toHaveBeenCalledTimes(1);
    stopNew();
    await flush();
});

test('times out a stuck fetch and allows a later polling cycle', async () => {
    let signal!: AbortSignal;
    const poll = jest.fn((current: AbortSignal) => {
        signal = current;
        return new Promise<void>((_, reject) => {
            current.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
    });
    const stop = startPolling(poll, { current: false });
    jest.advanceTimersByTime(2500);
    jest.advanceTimersByTime(20000);
    expect(signal.aborted).toBe(true);
    await flush();
    jest.advanceTimersByTime(2500);
    expect(poll).toHaveBeenCalledTimes(2);
    stop();
    await flush();
});

test('a failed poll releases the lock and can recover on the next tick', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const poll = jest.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined);
    const stop = startPolling(poll, { current: false });
    jest.advanceTimersByTime(2500);
    await flush();
    jest.advanceTimersByTime(2500);
    await flush();
    expect(poll).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);
    stop();
    log.mockRestore();
});

test('different pollers remain independent and a completed session can stop polling', async () => {
    const pending = deferred();
    const first = startPolling(() => pending.promise, { current: false });
    const poll = jest.fn(async (_signal: AbortSignal, stop: () => void) => stop());
    const second = startPolling(poll, { current: false });
    jest.advanceTimersByTime(2500);
    await flush();
    jest.advanceTimersByTime(7500);
    expect(poll).toHaveBeenCalledTimes(1);
    first();
    second();
    pending.resolve();
    await flush();
});
