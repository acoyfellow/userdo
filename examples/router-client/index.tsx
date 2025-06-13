import { Hono } from 'hono'
import { UserDO, createRouter, hashEmailForId } from 'userdo'

export class AuthDO extends UserDO {
  router = createRouter()
  async fetch(request: Request) {
    const res = await this.router.handle.call(this, request)
    if (res) return res
    return new Response('not found', { status: 404 })
  }
}

interface Env {
  AUTH_DO: DurableObjectNamespace
  JWT_SECRET: string
}

const getDO = async (env: Env, email: string) => {
  const id = await hashEmailForId(email)
  return env.AUTH_DO.get(env.AUTH_DO.idFromName(id))
}

const app = new Hono<{ Bindings: Env }>()

app.post('/auth/signup', async c => {
  const body = await c.req.json()
  const stub = await getDO(c.env, body.email)
  return stub.fetch('/auth/signup', { method: 'POST', body: JSON.stringify(body) })
})

app.post('/auth/signin', async c => {
  const body = await c.req.json()
  const stub = await getDO(c.env, body.email)
  return stub.fetch('/auth/signin', { method: 'POST', body: JSON.stringify(body) })
})

app.post('/auth/refresh', async c => {
  const { refreshToken } = await c.req.json()
  const payload = JSON.parse(atob(refreshToken.split('.')[1]))
  const stub = await getDO(c.env, payload.email)
  return stub.fetch('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) })
})

app.post('/auth/signout', async c => {
  const { refreshToken } = await c.req.json()
  const payload = JSON.parse(atob(refreshToken.split('.')[1]))
  const stub = await getDO(c.env, payload.email)
  return stub.fetch('/auth/signout', { method: 'POST', body: JSON.stringify({ refreshToken }) })
})

app.get('/auth/me', async c => {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401)
  const token = auth.slice(7)
  const payload = JSON.parse(atob(token.split('.')[1]))
  const stub = await getDO(c.env, payload.email)
  return stub.fetch('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
})

// Serve the ES module client
app.get('/client.js', async c => {
  const clientCode = `// src/client.ts
function createClient(options = {}) {
  const base = options.baseUrl || "";
  const memory = {
    getItem: (key) => memory[key] || null,
    setItem: (key, value) => {
      memory[key] = value;
    },
    removeItem: (key) => {
      delete memory[key];
    }
  };
  const store = options.storage || (typeof globalThis.localStorage === "undefined" ? memory : globalThis.localStorage);
  let token = store.getItem("token");
  let refresh = store.getItem("refresh");
  let user = null;
  async function request(path, body) {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok)
      throw new Error(await res.text());
    return res.json();
  }
  function save(t, r) {
    token = t;
    refresh = r;
    store.setItem("token", t);
    store.setItem("refresh", r);
  }
  async function signUp(email, password) {
    const r = await request(
      "/signup",
      { email, password }
    );
    save(r.token, r.refreshToken);
    user = r.user;
    return r.user;
  }
  async function signIn(email, password) {
    const r = await request(
      "/login",
      { email, password }
    );
    save(r.token, r.refreshToken);
    user = r.user;
    return r.user;
  }
  async function refreshSession() {
    if (!refresh)
      return null;
    const r = await request("/refresh", { refreshToken: refresh });
    save(r.token, refresh);
    return r.token;
  }
  async function checkAuth() {
    if (!token)
      return false;
    try {
      const r = await request("/verify", { token });
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
    store.removeItem("token");
    store.removeItem("refresh");
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
    initialize
  };
}
export {
  createClient
};`

  return new Response(clientCode, {
    headers: { 'Content-Type': 'application/javascript' }
  })
})

app.get('/', c =>
  c.html(
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>UserDO Router Client Example</title>
      </head>
      <body>
        <h1>UserDO Router + Client</h1>
        <form id="signup">
          <input id="su-email" placeholder="Email" />
          <input id="su-pass" type="password" placeholder="Password" />
          <button>Sign Up</button>
        </form>
        <form id="signin">
          <input id="si-email" placeholder="Email" />
          <input id="si-pass" type="password" placeholder="Password" />
          <button>Sign In</button>
        </form>
        <button id="signout" style="display:none">Sign Out</button>
        <pre id="user"></pre>
        <script type="module" dangerouslySetInnerHTML={{
          __html: `
          import { createClient } from 'https://cdn.jsdelivr.net/npm/userdo/dist/client.js';
          const auth = createClient({ baseUrl: '/auth' });
          await auth.initialize();
          const userEl = document.getElementById('user');
          function update() {
            const user = auth.currentUser();
            userEl.textContent = user ? JSON.stringify(user, null, 2) : 'No user';
            document.getElementById('signout').style.display = user ? 'block' : 'none';
          }
          document.getElementById('signup').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('su-email').value;
            const password = document.getElementById('su-pass').value;
            await auth.signUp(email, password);
            update();
          });
          document.getElementById('signin').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('si-email').value;
            const password = document.getElementById('si-pass').value;
            await auth.signIn(email, password);
            update();
          });
          document.getElementById('signout').addEventListener('click', async () => {
            await auth.signOut();
            update();
          });
          update();
          `
        }}></script>
      </body>
    </html>
  )
)

export default app
