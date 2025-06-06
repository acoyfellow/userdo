import { Hono, Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { Env, UserDO } from './UserDO'

export { UserDO }

type User = {
  id: string;
  email: string;
}

const getUserDO = (c: Context, email: string) => {
  const userDOID = c.env.USERDO.idFromName(email);
  return c.env.USERDO.get(userDOID) as unknown as UserDO;
}

const app = new Hono<{ Bindings: Env, Variables: { user: User } }>()

// --- AUTH ENDPOINTS ---
app.post('/signup', async (c) => {
  const formData = await c.req.formData()
  const email = (formData.get('email') as string)?.toLowerCase();
  const password = formData.get('password') as string
  if (!email || !password) {
    return c.json({ error: "Missing fields" }, 400)
  }
  const userDO = getUserDO(c, email);
  try {
    const { user, token, refreshToken } = await userDO.signup({ email, password })
    setCookie(c, 'token', token, {
      httpOnly: true,
      secure: true,
      path: '/',
      sameSite: 'Strict'
    })
    setCookie(c, 'refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      path: '/',
      sameSite: 'Strict'
    })
    return c.redirect('/');
  } catch (e: any) {
    return c.json({ error: e.message || "Signup error" }, 400)
  }
})

app.post('/login', async (c) => {
  const formData = await c.req.formData()
  const email = (formData.get('email') as string)?.toLowerCase();
  const password = formData.get('password') as string
  if (!email || !password) {
    return c.json({ error: "Missing fields" }, 400)
  }
  const userDO = getUserDO(c, email);
  try {
    const { user, token, refreshToken } = await userDO.login({ email, password })
    setCookie(c, 'token', token, {
      httpOnly: true,
      secure: true,
      path: '/',
      sameSite: 'Strict'
    })
    setCookie(c, 'refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      path: '/',
      sameSite: 'Strict'
    })
    return c.redirect('/');
  } catch (e: any) {
    return c.json({ error: e.message || "Login error" }, 400)
  }
})

// logout
app.post('/logout', async (c) => {
  deleteCookie(c, 'token');
  deleteCookie(c, 'refreshToken');
  return c.redirect('/');
})

// --- AUTH MIDDLEWARE ---
app.use('/*', async (c, next) => {
  try {
    const token = getCookie(c, 'token') || '';
    const refreshToken = getCookie(c, 'refreshToken') || '';
    const accessPayload = JSON.parse(atob(token.split('.')[1]));
    const refreshPayload = JSON.parse(atob(refreshToken.split('.')[1]));
    let email = accessPayload.email?.toLowerCase() || refreshPayload.email?.toLowerCase();
    const userDO = getUserDO(c, email);
    const result = await userDO.verifyToken({ token: token });
    if (!result.ok) {
      const refreshResult = await userDO.refreshToken({ refreshToken });
      if (!refreshResult.token) return c.json({ error: 'Unauthorized' }, 401);
      setCookie(c, 'token', refreshResult.token, {
        httpOnly: true,
        secure: true,
        path: '/',
        sameSite: 'Strict'
      })
    }
    if (result.ok && result.user) {
      c.set('user', result.user ?? undefined);
    };
    await next();
  } catch (e) {
    console.error(e);
    await next();
  };
});

app.get("/data", async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const userDO = getUserDO(c, user.email);
  const result = await userDO.get('data');
  return c.json({ ok: true, data: result });
});

app.post("/data", async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const formData = await c.req.formData();
  const key = formData.get('key') as string;
  const value = formData.get('value') as string;
  const userDO = getUserDO(c, user.email);
  const result = await userDO.set(key, value);
  if (!result.ok) return c.json({ error: 'Failed to set data' }, 400);
  return c.json({ ok: true, data: { key, value } });
});

// Example protected endpoint
app.get('/protected/profile', (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  return c.json({ ok: true, user });
});

// --- Minimal Frontend (JSX) ---
app.get('/', async (c) => {
  const user = c.get('user') || undefined;
  const userDO = getUserDO(c, user?.email || '');
  const data = await userDO.get("data");

  return c.html(
    <html>
      <head>
        <title>UserDO Demo</title>
        <style>{`
          body {
            font-family: Avenir, Inter, Helvetica, Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          fieldset {
            margin: 20px 0;
            padding: 15px;
          }
          details {
            margin: 10px 0;
          }
          input, textarea, select {
            display: block;
            margin: 5px 0 10px 0;
            padding: 8px;
            width: 100%;
            box-sizing: border-box;
            font-size: 16px;
          }
          button {
            padding: 10px 15px;
            margin: 5px 5px 5px 0;
            font-size: 16px;
          }
          .post {
            border: 1px solid #ddd;
            margin: 10px 0;
            padding: 15px;
            border-radius: 5px;
          }
        `}</style>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>
        <h1>UserDO Demo</h1>

        <p>View extended demo <a href="https://userdo-hono-example.coey.dev">here</a></p>

        <a href="https://github.com/acoyfellow/userdo">GitHub</a>
        &nbsp;•&nbsp;
        <a href="https://www.npmjs.com/package/userdo">NPM</a>
        &nbsp;•&nbsp;
        <a href="https://x.com/acoyfellow.com">@acoyfellow</a>

        {!user && <section>
          <form method="post" action="/signup">
            <fieldset>
              <legend><h2>Sign Up</h2></legend>
              <label for="signup-email">Email:</label>
              <input id="signup-email" name="email" type="email" placeholder="Email" required /><br />
              <label for="signup-password">Password:</label>
              <input id="signup-password" name="password" type="password" placeholder="Password" required /><br />
              <button type="submit">Sign Up</button>
            </fieldset>
          </form>
          <form method="post" action="/login">
            <fieldset>
              <legend><h2>Login</h2></legend>
              <label for="login-email">Email:</label>
              <input id="login-email" name="email" type="email" placeholder="Email" required /><br />
              <label for="login-password">Password:</label>
              <input id="login-password" name="password" type="password" placeholder="Password" required /><br />
              <button type="submit">Login</button>
            </fieldset>
          </form>
        </section>}

        {user && <section>
          <h2>Welcome {user.email}</h2>
          <form method="post" action="/logout">
            <button type="submit">Logout</button>
          </form>
          <a href="/protected/profile">View Profile (protected)</a><br /><br />

          <details open>
            <summary>User Info</summary>
            <pre>{JSON.stringify(user, null, 2)}</pre>
          </details>

          <form method="post" action="/data">
            <fieldset>
              <legend><h2>Set Data</h2></legend>
              <label for="data-key">Key:</label>
              <input id="data-key" name="key" type="text" placeholder="Key" value="data" readonly required /><br />
              <label for="data-value">Value:</label>
              <input id="data-value" name="value" type="text" placeholder="Value" required /><br />
              <button type="submit">Set Data</button>
              <hr />
              {data && (
                <details open>
                  <summary>Data</summary>
                  <pre>{JSON.stringify(data, null, 2)}</pre>
                </details>
              )}
            </fieldset>
          </form>
        </section>}


      </body>
    </html>
  )
})

export default app