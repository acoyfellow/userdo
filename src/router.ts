import { UserDO } from './UserDO';

export interface RouterOptions {
  basePath?: string;
  corsOrigins?: string[];
  enableRefresh?: boolean;
}

export function createRouter(options: RouterOptions = {}) {
  const { basePath = '/auth', corsOrigins = ['*'], enableRefresh = true } = options;

  function corsHeaders() {
    return {
      'Access-Control-Allow-Origin': corsOrigins[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
  }

  return {
    async handle(this: UserDO, request: Request): Promise<Response | null> {
      const url = new URL(request.url);
      const method = request.method;
      const path = url.pathname;

      if (method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders() });
      }

      const route = `${method} ${path}`;
      try {
        let result: unknown;
        switch (route) {
          case `POST ${basePath}/signup`:
            result = await this.signup(await request.json() as any);
            break;
          case `POST ${basePath}/signin`:
            result = await this.login(await request.json() as any);
            break;
          case `POST ${basePath}/signout`:
            const signoutData = await request.json() as { refreshToken?: string };
            if (signoutData.refreshToken) {
              await this.revokeRefreshToken({ refreshToken: signoutData.refreshToken });
            }
            result = { ok: true };
            break;
          case `POST ${basePath}/change-password`:
            result = await this.changePassword(await request.json() as any);
            break;
          case `POST ${basePath}/refresh`:
            if (!enableRefresh) return null;
            result = await this.refreshToken(await request.json() as any);
            break;
          case `GET ${basePath}/me`:
            const auth = request.headers.get('Authorization');
            if (!auth?.startsWith('Bearer ')) {
              return new Response('Unauthorized', { status: 401, headers: corsHeaders() });
            }
            const verify = await this.verifyToken({ token: auth.slice(7) });
            if (!verify.ok || !verify.user) {
              return new Response('Unauthorized', { status: 401, headers: corsHeaders() });
            }
            result = { user: verify.user };
            break;
          default:
            return null;
        }

        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders() }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ error: message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() }
        });
      }
    }
  };
}
