import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, checkTeacher } from './firebase';
import Login, { getLoginAs } from './Login';
import StudentHome from './StudentHome';
import TeacherHome from './TeacherHome';
import { Toast, Avatar } from './ui';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking
  const [teacher, setTeacher] = useState(null); // null = role not loaded yet
  const [toast, setToast] = useState(null);
  const [, rerender] = useState(0);

  // Re-read displayName after an email signup sets it.
  useEffect(() => {
    const bump = () => rerender((n) => n + 1);
    window.addEventListener('profile-updated', bump);
    return () => window.removeEventListener('profile-updated', bump);
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        setTeacher(null);
        setUser(u);
        if (u) {
          checkTeacher(u).then(setTeacher);
          // Keep a profile doc so the teacher can see who joined.
          await setDoc(
            doc(db, 'users', u.uid),
            {
              name: u.displayName || u.email.split('@')[0],
              email: u.email.toLowerCase(),
              photoURL: u.photoURL || null,
              lastSeen: serverTimestamp(),
            },
            { merge: true }
          ).catch((e) => console.warn('Profile save failed', e));
        }
      }),
    []
  );

  if (user === undefined || (user && teacher === null)) {
    return (
      <div className="splash">
        <img src="/icons/icon-192.png" alt="" width="72" height="72" />
      </div>
    );
  }
  if (!user) return <Login />;

  const name = user.displayName || user.email.split('@')[0];
  const loginAs = getLoginAs();
  const switchTo = (role) => { try { localStorage.setItem('loginAs', role); } catch {} rerender((n) => n + 1); };

  // Picked "Teacher" but the account isn't approved (or the email isn't verified yet).
  if (loginAs === 'teacher' && !teacher) {
    return (
      <TeacherGate user={user} onStudent={() => switchTo('student')}
        onRecheck={async () => {
          await user.reload();
          await user.getIdToken(true); // refresh so the rules see email_verified
          const ok = await checkTeacher(auth.currentUser);
          setTeacher(ok);
          return ok;
        }} />
    );
  }
  const asTeacher = teacher && loginAs === 'teacher';

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src="/icons/icon-192.png" alt="" width="28" height="28" />
          <span>BCNY Board</span>
          {asTeacher && <span className="role-pill">Teacher</span>}
          {teacher && !asTeacher && (
            <button className="role-pill role-switch" onClick={() => switchTo('teacher')}>Switch to teacher</button>
          )}
        </div>
        <button className="me" onClick={() => confirm('Sign out?') && signOut(auth)} aria-label="Sign out">
          <Avatar name={name} photo={user.photoURL} size={32} />
        </button>
      </header>
      {asTeacher ? <TeacherHome user={user} notify={setToast} /> : <StudentHome user={user} notify={setToast} />}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function TeacherGate({ user, onStudent, onRecheck }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const needsVerify = !user.emailVerified;

  const recheck = async () => {
    setBusy(true); setMsg('');
    const ok = await onRecheck().catch(() => false);
    if (!ok) setMsg(needsVerify && !auth.currentUser?.emailVerified
      ? 'Still not verified. Open the link in your email, then try again.'
      : 'This account still isn’t on the teacher list.');
    setBusy(false);
  };
  const resend = async () => {
    try { await sendEmailVerification(user); setMsg(`Link sent to ${user.email}. Check spam too.`); }
    catch { setMsg('Couldn’t send it. Wait a minute and try again.'); }
  };

  return (
    <main className="gate">
      <img src="/icons/icon-192.png" alt="" width="64" height="64" />
      {needsVerify ? (
        <>
          <h1>Verify your email</h1>
          <p>Teacher tools need a verified email. We sent a link to <b>{user.email}</b>. Open it, then come back here.</p>
        </>
      ) : (
        <>
          <h1>Not a teacher account yet</h1>
          <p><b>{user.email}</b> isn’t on the teacher list. Ask the program lead to add you, or continue as a student.</p>
        </>
      )}
      <div className="stack">
        <button className="btn btn-primary" onClick={recheck} disabled={busy}>
          {busy ? 'Checking…' : needsVerify ? 'I verified it' : 'Check again'}
        </button>
        {needsVerify && <button className="btn btn-ghost" onClick={resend}>Resend link</button>}
        <button className="btn btn-ghost" onClick={onStudent}>Continue as student</button>
        <button className="link" onClick={() => signOut(auth)}>Sign out</button>
        {msg && <p className="note">{msg}</p>}
      </div>
    </main>
  );
}
