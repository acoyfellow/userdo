# UserDO

A simple, secure, and ergonomic Durable Object base class for user authentication, management, and per-user key-value (KV) storage on Cloudflare Workers.

- 🔐 Password hashing (PBKDF2, WebCrypto)
- 🪪 JWT-based authentication (Cloudflare-native)
- 🏷️ Hashed email as the Durable Object ID (prevents PII leaking in logs)
- 🛠️ Direct method calls (no HTTP fetch between objects)
- 🧩 Easy migration, password change, and reset
- 🗄️ Secure per-user KV store for arbitrary data
- 🧬 **Extend and build on top** - no separate bindings needed
- ⏱️ Basic rate limiting for authentication endpoints

> **Note:**
> - You extend `UserDO` with your own class and add your custom logic on top
> - You still need to set up a router (e.g., with Hono, Express, or native Workers routing) to expose endpoints to your client or other services
> - All authentication methods are available through inheritance - just call `this.signup()`, `this.login()`, etc. from your extended class
> - See the [examples](./examples/) folder for a full working integration
> - The `router-client` example shows the built-in router and browser client working together

## What is this for?

- User authentication, management, and secure per-user data storage in Cloudflare Workers, PartyKit, or any platform supporting Durable Objects
- Extend with your own business logic - add methods for your specific use case
- No separate authentication service needed - it's built into your existing Durable Object
- Secure, scalable, and easy to integrate with any backend

## Quickstart Example

```ts
import { UserDO, getUserDO } from "userdo";

export class MyAppDO extends UserDO {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  // Add your own methods on top of UserDO
  async createPost(title: string, content: string) {
    // Use this.set() and this.get() for user-specific data storage
    const posts = await this.get('posts') || [];
    const newPost = { id: Date.now(), title, content, createdAt: new Date().toISOString() };
    posts.push(newPost);
    await this.set('posts', posts);
    return newPost;
  }

  async getPosts() {
    return await this.get('posts') || [];
  }
}

// Usage in your worker:
// const myAppDO = await getUserDO(env.MY_APP_DO, email);
```

See [`examples/`](./examples/) for the full Hono integration. A minimal browser client is exported from `userdo/client`. An optional router is available from `userdo/router`. See `examples/router-client` for an end-to-end demo using both.

## Install
```bash
bun install userdo
```

## Wrangler Configuration

Add your extended Durable Object class to your `wrangler.jsonc`:

```jsonc
{
  // ...other config...
  "main": "src/index.ts", // or your entry file
  "vars": {
    "JWT_SECRET": "your-jwt-secret"
  },
  "durable_objects": {
    "bindings": [
      {
        "name": "MY_APP_DO",  // This is the variable you'll use in env.MY_APP_DO
        "class_name": "MyAppDO" // This must match your exported class name
      }
    ]
  }
}
```

- Make sure your entry file (e.g., `src/index.ts`) exports your extended Durable Object class:
  ```ts
  import { UserDO } from "userdo";
  
  export class MyAppDO extends UserDO {
    // your custom methods here
  }
  ```
- Use ES Module syntax (not service-worker style)

## Usage

### 1. Create or get your Durable Object instance

```ts
import { getUserDO } from "userdo";

// Almost the same API as before, but with automatic email hashing for security
const myAppDO = await getUserDO(env.MY_APP_DO, email);

// Compare to the old way (don't use this - exposes PII in logs):
// const myAppDO = env.MY_APP_DO.get(env.MY_APP_DO.idFromName(email));
```

### 2. Authentication Methods (inherited from UserDO)

#### Signup
```ts
const { user, token, refreshToken } = await myAppDO.signup({ email, password });
```

#### Login
```ts
const { user, token, refreshToken } = await myAppDO.login({ email, password });
```

#### Change Password
```ts
await myAppDO.changePassword({ oldPassword, newPassword });
```

#### Reset Password (after verifying a reset token)
```ts
await myAppDO.resetPassword({ newPassword });
```

#### Token Operations
```ts
// Verify an access token
const result = await myAppDO.verifyToken({ token });

// Refresh an access token
const { token: newToken } = await myAppDO.refreshToken({ refreshToken });

// Revoke a specific refresh token
await myAppDO.revokeRefreshToken({ refreshToken });

// Revoke all refresh tokens
await myAppDO.revokeAllRefreshTokens();

// Logout (clears all refresh tokens)
await myAppDO.logout();
```

### 3. User Data Management (inherited from UserDO)

#### Set Data
```ts
// Set a value for a key
const result = await myAppDO.set('preferences', { theme: 'dark', language: 'en' });
// result: { ok: true }
```

#### Get Data
```ts
// Retrieve the value for a key
const preferences = await myAppDO.get('preferences');
// returns: { theme: 'dark', language: 'en' }
```

### 4. Advanced Operations

#### Get Raw User Data
```ts
const user = await myAppDO.raw();
```

#### User Migration
```ts
import { migrateUserEmail } from "userdo";

const result = await migrateUserEmail({ env, oldEmail, newEmail });
if (!result.ok) {
  // handle error
}
```

- You can use any string as the key for `get`/`set`
- The value can be any serializable data (string, object, etc.)
- Returns `{ ok: true }` for set operations
- Keys starting with `__` are reserved for internal UserDO use

## Browser Client

Use a lightweight client directly in the browser:

```html
<script type="module">
  import { createClient } from 'https://cdn.jsdelivr.net/npm/userdo/dist/client.js';
  const auth = createClient({ baseUrl: '/api' });
  await auth.initialize();
  // auth.signIn(email, password)
</script>
```

The client exposes `signUp`, `signIn`, `signOut`, `refreshSession`, `checkAuth`,
`currentUser`, and `accessToken` helpers.

## HTTP Router

Expose REST endpoints automatically from your Durable Object:

```ts
import { createRouter, UserDO } from 'userdo';

export class MyAppDO extends UserDO {
  router = createRouter();

  async fetch(request: Request) {
    const res = await this.router.handle.call(this, request);
    if (res) return res;
    return new Response('not found', { status: 404 });
  }
}
```

## API

### Inherited UserDO Methods

| Function                                      | Input                                                                 | Output                                  | Description                                      |
|------------------------------------------------|-----------------------------------------------------------------------|-----------------------------------------|--------------------------------------------------|
| `signup({ email, password })`                  | `{ email: string, password: string }`                                 | `{ user, token, refreshToken }`         | Create a new user. Throws if email exists or input is invalid. |
| `login({ email, password })`                   | `{ email: string, password: string }`                                 | `{ user, token, refreshToken }`         | Authenticate a user. Throws if credentials are invalid.        |
| `changePassword({ oldPassword, newPassword })` | `{ oldPassword: string, newPassword: string }`                        | `{ ok: true }`                          | Change the user's password. Throws if old password is wrong or new password is invalid. |
| `resetPassword({ newPassword })`               | `{ newPassword: string }`                                             | `{ ok: true }`                          | Reset the user's password (after verifying a reset token). Throws if new password is invalid. |
| `verifyToken({ token })`                      | `{ token: string }`                                                   | `{ ok: boolean, user?, error? }`        | Verify a JWT access token. Returns user data if valid.         |
| `refreshToken({ refreshToken })`              | `{ refreshToken: string }`                                            | `{ token: string }`                     | Generate a new access token from a refresh token.             |
| `revokeRefreshToken({ refreshToken })`        | `{ refreshToken: string }`                                            | `{ ok: true }`                          | Revoke a specific refresh token.                               |
| `revokeAllRefreshTokens()`                    | –                                                                     | `{ ok: true }`                          | Revoke all refresh tokens for the user.                       |
| `logout()`                                    | –                                        | `{ ok: true }`  | Clear all refresh tokens (logout).                            |
| `raw()`                                       | –                                                                     | `user`                                  | Get the raw user data. Throws if user does not exist.           |
| `init(user)`                                  | `user` (full user object, see below)                                  | `{ ok: true }`                          | Seed user data (for migration). Throws if input is invalid.     |
| `deleteUser()`                                | –                                                                     | `{ ok: true }`                          | Delete the user data.                                           |
| `get(key)`                                    | `key: string`                                                         | `unknown`                               | Get a value from user's KV store.                             |
| `set(key, value)`                             | `key: string, value: unknown`                                         | `{ ok: true }`                          | Set a value in user's KV store.                               |

### Utility Functions

| Function                                      | Input                                                                 | Output                                  | Description                                      |
|------------------------------------------------|-----------------------------------------------------------------------|-----------------------------------------|--------------------------------------------------|
| `migrateUserEmail({ env, oldEmail, newEmail })`| `{ env, oldEmail: string, newEmail: string }`                         | `{ ok: true }` or `{ ok: false, error }`| Atomically migrate a user to a new email. Returns error on failure. |

**User object shape:**
```ts
{
  id: string,
  email: string,
  passwordHash: string,
  salt: string,
  createdAt: string,
  refreshTokens: string[]
}
```

- All methods throw on error unless otherwise noted
- `token` is a JWT string for authentication (15 minutes expiry)
- `refreshToken` is a JWT string for token refresh (7 days expiry)
- `user` is the user object as above

---

**Extend once. Use everywhere. No separate auth service needed.**

## Security & Production Deployment

## ⚡️ JWT_SECRET: Dev vs Production (TL;DR)

- **For local dev:**  
  Add to `wrangler.jsonc`:
  ```jsonc
  "vars": { "JWT_SECRET": "your-jwt-secret-here" }
  ```
- **For production:**  
  1. Remove/comment out the `JWT_SECRET` line from `wrangler.jsonc`.
  2. Run:
     ```sh
     wrangler secret put JWT_SECRET
     ```
  3. Deploy.

> **Note:**  
> You can't have both a var and a secret with the same name at once.

---

**Security:**  
Never use the example secret in production. Always set a strong, random secret for live deployments.

## Potential Roadmap

- [x] Rate limiting for authentication endpoints
- [ ] Email verification flow
- [ ] Password reset with secure, time-limited tokens
- [ ] Configurable JWT expiration and refresh tokens
- [ ] Admin/user roles and permissions
- [ ] Webhooks or event hooks for user actions (signup, login, etc.)
- [ ] Multi-factor authentication (MFA)
- [ ] Usage analytics and audit logging

Have a feature request? Open an issue or PR!