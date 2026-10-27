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
  'auth/user-not-found': 'No account with that email yet. Tap “Create account” to make one.',
  'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
  'auth/weak-password': 'Use at least 6 characters for your password.',
  'auth/invalid-email': 'That email doesn’t look right. Check for typos.',
  'auth/too-many-requests': 'Too many tries. Wait a minute, then try again.',
  'auth/network-request-failed': 'No internet connection. Connect and try again.',
};
const friendly = (e) => MESSAGES[e?.code] || 'Sign-in didn’t work. Try again.';

export const getLoginAs = () => {
  try { return localStorage.getItem('loginAs') === 'teacher' ? 'teacher' : 'student'; } catch { return 'student'; }
};
const saveLoginAs = (role) => { try { localStorage.setItem('loginAs', role); } catch {} };

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v}
          className={value === v ? 'is-on' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export default function Login() {
  const [role, setRole] = useState(getLoginAs); // student | teacher
  const [mode, setMode] = useState('signin'); // signin | signup
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

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
      if (mode === 'signup') {
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
    if (!email.trim()) return setError('Type your email above first, then tap “Forgot password”.');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNote(`Reset link sent to ${email.trim()}. Check your inbox (and spam).`);
    } catch (err) {
      setError(friendly(err));
    }
  };

  return (
    <main className="login">
      <section className="login-hero">
        <img src="/icons/icon-192.png" alt="" width="64" height="64" />
        <h1>BCNY Board</h1>
        <p>{role === 'teacher' ? 'Run the board: hand out points and post announcements.' : 'See your points and where you stand with the crew.'}</p>
      </section>

      <section className="login-card">
        <Segmented label="I am a" value={role} onChange={pickRole}
          options={[['student', 'Student'], ['teacher', 'Teacher']]} />
        <Segmented label="Account" value={mode} onChange={pickMode}
          options={[['signin', 'Sign in'], ['signup', 'Create account']]} />
        {role === 'teacher' && mode === 'signup' && (
          <p className="muted login-hint">Teacher accounts need to be approved by the program lead before the teacher tools unlock.</p>
        )}

        <button className="btn btn-google" onClick={google} disabled={busy}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
          </svg>
          {mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}
        </button>

        <div className="or"><span>or use email</span></div>

        <form onSubmit={submit} className="stack">
          {mode === 'signup' && (
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="First and last" />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required inputMode="email" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          {note && <p className="note">{note}</p>}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'One sec…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {mode === 'signin' && (
          <div className="login-links">
            <button className="link" onClick={reset}>Forgot password</button>
          </div>
        )}
      </section>
    </main>
  );
}
