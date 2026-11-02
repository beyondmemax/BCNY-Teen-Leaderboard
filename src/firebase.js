import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Offline cache so the board still opens with no signal (subway, gym basement, etc).
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

/*
 * Students sign in with a username, not an email, so we never collect their real addresses.
 * Firebase Auth still needs an email-shaped id, so a username maps to an address under this
 * project's own Google-owned firebaseapp.com host, which has no mailboxes: nothing can ever be
 * delivered there, so nobody can use a "reset password" email to take over a student account.
 */
export const STUDENT_DOMAIN = `students.${import.meta.env.VITE_FB_PROJECT_ID || 'bcny-board'}.firebaseapp.com`;
export const USERNAME_RE = /^[a-z0-9._]{3,20}$/;
export const normalizeUsername = (u) => u.trim().toLowerCase().replace(/^@/, '');
export const usernameToEmail = (u) => `${normalizeUsername(u)}@${STUDENT_DOMAIN}`;
export const isStudentEmail = (email) => !!email && email.toLowerCase().endsWith(`@${STUDENT_DOMAIN}`);
/** What to show for an account: @username for students, the email for everyone else. */
export const handleOf = (email = '') => (isStudentEmail(email) ? `@${email.split('@')[0]}` : email);

/** True if this account has a /teachers/{email} doc. Decides which UI to show; firestore.rules enforces it. */
export async function checkTeacher(user) {
  if (!user?.email || !user.emailVerified) return false;
  try {
    return (await getDoc(doc(db, 'teachers', user.email.toLowerCase()))).exists();
  } catch {
    return false;
  }
}
