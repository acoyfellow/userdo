import type { AuthUser, AuthConfig } from './types';
export type TokenStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export interface ClientOptions extends Partial<AuthConfig> {
  /** Storage for tokens (defaults to localStorage) */
  storage?: TokenStore;
}

export function createClient(options: ClientOptions = {}) {
  const base = options.baseUrl || '';
  const memory: TokenStore = {
    getItem: key => (memory as any)[key] || null,
    setItem: (key, value) => { (memory as any)[key] = value },
    removeItem: key => { delete (memory as any)[key] }
  };
  const store: TokenStore = options.storage || (typeof (globalThis as any).localStorage === 'undefined' ? memory : (globalThis as any).localStorage);
  let token: string | null = store.getItem('token');
  let refresh: string | null = store.getItem('refresh');
  let user: AuthUser | null = null;

  async function request<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<T>;
  }

  function save(t: string, r: string) {
    token = t;
    refresh = r;
    store.setItem('token', t);
    store.setItem('refresh', r);
  }

  async function signUp(email: string, password: string) {
    const r = await request<{ user: AuthUser; token: string; refreshToken: string }>(
      '/signup',
      { email, password },
    );
    save(r.token, r.refreshToken);
    user = r.user;
    return r.user;
  }

  async function signIn(email: string, password: string) {
    const r = await request<{ user: AuthUser; token: string; refreshToken: string }>(
      '/login',
      { email, password },
    );
    save(r.token, r.refreshToken);
    user = r.user;
    return r.user;
  }

  async function refreshSession() {
    if (!refresh) return null;
    const r = await request<{ token: string }>('/refresh', { refreshToken: refresh });
    save(r.token, refresh);
    return r.token;
  }

  async function checkAuth() {
    if (!token) return false;
    try {
      const r = await request<{ ok: boolean; user?: AuthUser }>('/verify', { token });
      user = r.user || null;
      return r.ok;
    } catch {
      await refreshSession();
      return false;
    }
  }

  function signOut() {
    token = null;
    refresh = null;
    user = null;
    store.removeItem('token');
    store.removeItem('refresh');
  }

  function currentUser() {
    return user;
  }

  function accessToken() {
    return token;
  }

  async function initialize() {
    await checkAuth();
  }

  return {
    signUp,
    signIn,
    signOut,
    refreshSession,
    checkAuth,
    currentUser,
    accessToken,
    initialize,
  };
}
