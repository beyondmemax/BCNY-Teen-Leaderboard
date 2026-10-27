import { useState } from 'react';
import {
  GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, sendPasswordResetEmail, sendEmailVerification,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { isStandalone } from './pwa';

const MESSAGES = {
  'auth/invalid-credential': 'That email and password don’t match. Check both and try again.',
  'auth/wrong-password': 'That email and password don’t match. Check both and try again.',
  'auth/user-not-found': 'No account with that email yet. Switch to “Sign up” to make one.',
  'auth/email-already-in-use': 'That email already has an account. Switch to “Log in” instead.',
  'auth/weak-password': 'Use at least 6 characters for your password.',
  'auth/invalid-email': 'That email doesn’t look right. Check for typos.',
  'auth/too-many-requests': 'Too many tries. Wait a minute, then try again.',
  'auth/network-request-failed': 'No internet connection. Connect and try again.',
};
const friendly = (e) => MESSAGES[e?.code] || 'Logging in didn’t work. Try again.';

export const getLoginAs = () => {
  try { return localStorage.getItem('loginAs') === 'teacher' ? 'teacher' : 'student'; } catch { return 'student'; }
};
const saveLoginAs = (role) => { try { localStorage.setItem('loginAs', role); } catch {} };

const COPY = {
  student: { head: 'Climb the board.', sub: 'Check your points and see where you stand with the crew.' },
  teacher: { head: 'Run the board.', sub: 'Hand out points, manage the roster, and post announcements.' },
};

/** Two-option switch with a thumb that slides between them. */
function Switch({ label, value, options, onChange }) {
  const i = Math.max(0, options.findIndex(([v]) => v === value));
  return (
    <div className="switch" role="radiogroup" aria-label={label} style={{ '--i': i }}>
      <span className="switch-thumb" aria-hidden="true" />
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v}
          className={value === v ? 'is-on' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** Shows the BCNY logo from /public/bcny-logo.png when that file exists; otherwise hides itself. */
function OrgLogo() {
  const [ok, setOk] = useState(true);
  if (!ok) return <span className="org-name">The Boys’ Club of New York</span>;
  return <img className="org-logo" src="/bcny-logo.png" alt="The Boys’ Club of New York" onError={() => setOk(false)} />;
}

function Podium() {
  return (
    <svg className="hero-podium" viewBox="0 0 120 92" aria-hidden="true">
      <path className="pod-star" d="M60 2l4.4 9 9.9 1.4-7.2 7 1.7 9.8L60 24.6l-8.8 4.6 1.7-9.8-7.2-7 9.9-1.4z" />
      <rect className="pod pod-2" x="6" y="46" width="32" height="46" rx="6" />
      <rect className="pod pod-1" x="44" y="34" width="32" height="58" rx="6" />
      <rect className="pod pod-3" x="82" y="58" width="32" height="34" rx="6" />
    </svg>
  );
}

export default function Login() {
  const [role, setRole] = useState(getLoginAs); // student | teacher
  const [mode, setMode] = useState('login'); // login | signup
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const signup = mode === 'signup';

  const pickRole = (r) => { setRole(r); saveLoginAs(r); setError(''); setNote(''); };
  const pickMode = (m) => { setMode(m); setError(''); setNote(''); };

  const google = async () => {
    setError(''); setBusy(true);
    saveLoginAs(role);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      // Popups are unreliable inside an installed home-screen app, so redirect there.
      if (isStandalone()) await signInWithRedirect(auth, provider);
      else await signInWithPopup(auth, provider);
    } catch (e) {
      if (e.code === 'auth/popup-blocked') return signInWithRedirect(auth, provider);
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setNote(''); setBusy(true);
    saveLoginAs(role);
    try {
      if (signup) {
        if (!name.trim()) throw { code: 'name' };
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: name.trim() });
        // The auth listener already saved a profile before the name was set, so fix it up.
        await setDoc(doc(db, 'users', cred.user.uid), { name: name.trim() }, { merge: true });
        // Teacher access requires a verified email; send the link right away.
        if (role === 'teacher') await sendEmailVerification(cred.user).catch(() => {});
        window.dispatchEvent(new Event('profile-updated'));
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      setError(err.code === 'name' ? 'Add your name so your teacher knows who you are.' : friendly(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError(''); setNote('');
    if (!email.trim()) return setError('Type your email above first, then tap “Forgot password?”.');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNote(`Reset link sent to ${email.trim()}. Check your inbox (and spam).`);
    } catch (err) {
      setError(friendly(err));
    }
  };

  return (
    <main className={`login is-${role}`}>
      <section className="login-hero">
        <svg className="court" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <circle cx="200" cy="300" r="120" />
          <circle cx="200" cy="300" r="40" />
          <line x1="0" y1="300" x2="400" y2="300" />
          <path d="M-20 0 Q200 160 420 0" />
        </svg>
        <div className="hero-inner">
          <div className="hero-brand">
            <img src="/icons/icon-192.png" alt="" width="40" height="40" />
            <span className="hero-x" aria-hidden="true">×</span>
            <OrgLogo />
          </div>
          <Podium />
          <h1 key={role} className="swap">{COPY[role].head}</h1>
          <p key={`${role}-sub`} className="swap">{COPY[role].sub}</p>
        </div>
      </section>

      <section className="login-card">
        <Switch label="I am a" value={role} onChange={pickRole}
          options={[['student', 'Student'], ['teacher', 'Teacher']]} />
        <Switch label="Account" value={mode} onChange={pickMode}
          options={[['login', 'Log in'], ['signup', 'Sign up']]} />

        <div className={`reveal ${role === 'teacher' && signup ? 'is-open' : ''}`}>
          <div><p className="login-hint">Teacher accounts need to be approved by the program lead before the teacher tools unlock.</p></div>
        </div>

        <button className="btn btn-google" onClick={google} disabled={busy}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
          </svg>
          <span key={mode} className="swap">{signup ? 'Sign up with Google' : 'Log in with Google'}</span>
        </button>

        <div className="or"><span>or with email</span></div>

        <form onSubmit={submit} className="stack" noValidate={false}>
          <div className={`reveal ${signup ? 'is-open' : ''}`} aria-hidden={!signup}>
            <div>
              <label>
                Your name
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
                  placeholder="First and last" tabIndex={signup ? 0 : -1} />
              </label>
            </div>
          </div>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
              required inputMode="email" placeholder="you@email.com" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
              placeholder={signup ? 'At least 6 characters' : ''}
              autoComplete={signup ? 'new-password' : 'current-password'} />
          </label>
          {error && <p className="error swap" role="alert">{error}</p>}
          {note && <p className="note swap">{note}</p>}
          <button className="btn btn-primary btn-go" disabled={busy}>
            <span key={busy ? 'busy' : mode} className="swap">{busy ? 'One sec…' : signup ? 'Sign up' : 'Log in'}</span>
          </button>
        </form>

        <div className={`reveal ${signup ? '' : 'is-open'}`}>
          <div>
            <div className="login-links">
              <button className="link" onClick={reset} tabIndex={signup ? -1 : 0}>Forgot password?</button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
