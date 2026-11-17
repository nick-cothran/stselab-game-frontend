import { postRequest } from './Api';

afterEach(() => jest.restoreAllMocks());

test('passes cancellation to fetch and rejects a late response after cancellation', async () => {
    let finish!: (data: object) => void;
    const json = new Promise(resolve => { finish = resolve; });
    const fetchMock = jest.fn().mockResolvedValue({ json: () => json });
    const original = global.fetch;
    global.fetch = fetchMock;
    try {
        const controller = new AbortController();
        const request = postRequest('session/status', '{}', controller.signal);
        const outcome = request.catch(error => error);
        await Promise.resolve();
        controller.abort();
        finish({ success: true });
        expect(await outcome).toMatchObject({ name: 'AbortError' });
        expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    } finally {
        global.fetch = original;
    }
});

test('already cancelled polls never start a fetch; ordinary POST callers still work', async () => {
    const original = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({ json: async () => ({ success: true }) });
    global.fetch = fetchMock;
    try {
        const controller = new AbortController();
        controller.abort();
        await expect(postRequest('session/status', '{}', controller.signal))
            .rejects.toMatchObject({ name: 'AbortError' });
        expect(fetchMock).not.toHaveBeenCalled();
        await expect(postRequest('player/roundResult', '{}')).resolves.toEqual({ success: true });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
        global.fetch = original;
    }
});
