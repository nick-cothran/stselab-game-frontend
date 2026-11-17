export type PollingLock = { current: boolean };

// Share the lock across effect restarts; stopping an old effect must not unlock its request.
export const startPolling = (
    poll: (signal: AbortSignal, stop: () => void) => Promise<void>,
    lock: PollingLock,
    intervalMs = 2500,
    timeoutMs = 20000,
) => {
    let controller: AbortController | undefined;
    const stop = () => clearInterval(interval);
    const interval = setInterval(async () => {
        if (lock.current) return;
        lock.current = true;
        controller = new AbortController();
        const signal = controller.signal;
        const timeout = setTimeout(() => controller?.abort(), timeoutMs);
        try {
            await poll(signal, stop);
        } catch (error) {
            if (!signal.aborted) console.error('Polling failed:', error);
        } finally {
            clearTimeout(timeout);
            lock.current = false;
        }
    }, intervalMs);

    return () => {
        stop();
        controller?.abort();
    };
};
