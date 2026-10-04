import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

describe('API requests', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends bodyless DELETE requests without a JSON content type and accepts 204', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    await expect(api.delete('/api/flows/1')).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith('/api/flows/1', expect.objectContaining({ method: 'DELETE' }));
    const options = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(options.body).toBeUndefined();
    expect(new Headers(options.headers).has('Content-Type')).toBe(false);
  });

  it('sends a JSON content type only for requests containing JSON', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await api.post('/api/flows', { name: 'Test' });
    await api.post('/api/demo');
    const [withBody, withoutBody] = fetch.mock.calls.map((call) => call[1] as RequestInit);
    expect(new Headers(withBody?.headers).get('Content-Type')).toBe('application/json');
    expect(withBody?.body).toBe('{"name":"Test"}');
    expect(new Headers(withoutBody?.headers).has('Content-Type')).toBe(false);
  });
});
