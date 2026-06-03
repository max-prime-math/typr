import {
  type FormEvent,
  type ReactNode,
  useMemo,
  useState
} from "react";

const AUTH_SESSION_KEY = "typr:auth:unlocked";
const AUTH_USERS_RAW = import.meta.env.VITE_TYPR_AUTH_USERS_SHA256 ?? "";

type AuthUser = {
  username: string;
  hash: string;
};

function parseAuthUsers(raw: string): AuthUser[] {
  return raw
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const separatorIndex = entry.indexOf(":");
      if (separatorIndex <= 0) {
        return [];
      }

      const username = entry.slice(0, separatorIndex).trim();
      const hash = entry.slice(separatorIndex + 1).trim().toLowerCase();
      if (!username || !/^[a-f0-9]{64}$/.test(hash)) {
        return [];
      }

      return [{ username, hash }];
    });
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}

function sessionIsUnlocked(): boolean {
  try {
    return sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function unlockSession() {
  try {
    sessionStorage.setItem(AUTH_SESSION_KEY, "1");
  } catch {
    // If sessionStorage is blocked, keep the in-memory unlock for this render tree.
  }
}

export function AuthGate({ children }: { children: ReactNode }) {
  const authUsers = useMemo(() => parseAuthUsers(AUTH_USERS_RAW), []);
  const authIsConfigured = authUsers.length > 0;
  const authIsRequired = import.meta.env.PROD && authIsConfigured;
  const [unlocked, setUnlocked] = useState(() => !authIsRequired || sessionIsUnlocked());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (unlocked) {
    return children;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!crypto.subtle) {
      setMessage("This browser does not support the required sign-in check.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const credentialHash = await sha256Hex(`${username}:${password}`);
      const matchedUser = authUsers.some(
        (authUser) =>
          authUser.username === username && timingSafeEqual(authUser.hash, credentialHash)
      );

      if (!matchedUser) {
        setMessage("The username or password is incorrect.");
        setPassword("");
        return;
      }

      unlockSession();
      setUnlocked(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell" aria-labelledby="auth-title">
      <section className="auth-panel">
        <div className="auth-panel__brand" aria-hidden="true">
          Typr
        </div>
        <h1 id="auth-title">Sign in</h1>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Username</span>
            <input
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect="off"
              disabled={submitting || !authIsConfigured}
              inputMode="text"
              name="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              type="text"
              value={username}
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              autoComplete="current-password"
              disabled={submitting || !authIsConfigured}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button
            className="auth-submit"
            disabled={submitting || !authIsConfigured}
            type="submit"
          >
            {submitting ? "Signing in" : "Sign in"}
          </button>
          {message ? <p className="auth-message">{message}</p> : null}
        </form>
      </section>
    </main>
  );
}
