import { describe, test, assert, assertEqual } from './harness.js';
import { resolveSignedInUser } from '../src/firebase.js';
import { hasLostPairedIdentity } from '../src/stats.js';

// Minimal stand-in for Firebase Auth's cold-launch behavior: currentUser is null until the
// persisted user finishes restoring (authStateReady), exactly like the real SDK. A user
// restored from a pairing (signInWithCustomToken) is NOT anonymous — the real SDK's
// signInAnonymously would replace such a user, which was the bug.
function fakeAuth(persistedUser) {
  const auth = {
    currentUser: null,
    signUps: 0,
    async authStateReady() {
      auth.currentUser = persistedUser;
    },
  };
  const mod = {
    async signInAnonymously(a) {
      await a.authStateReady();
      if (a.currentUser?.isAnonymous) return { user: a.currentUser };
      a.signUps++;
      a.currentUser = { uid: `anon-new-${a.signUps}`, isAnonymous: true };
      return { user: a.currentUser };
    },
  };
  return { auth, mod };
}

describe('resolveSignedInUser (paired identity must survive a cold launch)', () => {
  test('keeps a restored paired (non-anonymous) user instead of signing up a new one', async () => {
    const { auth, mod } = fakeAuth({ uid: 'WEB-UID', isAnonymous: false });
    const user = await resolveSignedInUser(auth, mod);
    assertEqual(user.uid, 'WEB-UID');
    assertEqual(auth.currentUser.uid, 'WEB-UID');
    assertEqual(auth.signUps, 0);
  });

  test('keeps a restored anonymous user', async () => {
    const { auth, mod } = fakeAuth({ uid: 'anon-1', isAnonymous: true });
    assertEqual((await resolveSignedInUser(auth, mod)).uid, 'anon-1');
    assertEqual(auth.signUps, 0);
  });

  test('signs in anonymously when nothing was persisted (fresh or evicted storage)', async () => {
    const { auth, mod } = fakeAuth(null);
    const user = await resolveSignedInUser(auth, mod);
    assert(user.isAnonymous, 'expected a fresh anonymous user');
    assertEqual(auth.signUps, 1);
  });
});

describe('hasLostPairedIdentity', () => {
  test('never-paired device is never flagged', () => {
    assertEqual(hasLostPairedIdentity(null, 'anon-1'), false);
  });
  test('same uid as when paired is fine', () => {
    assertEqual(hasLostPairedIdentity('WEB-UID', 'WEB-UID'), false);
  });
  test('different uid than when paired is flagged', () => {
    assertEqual(hasLostPairedIdentity('WEB-UID', 'anon-7'), true);
  });
  test('not signed in (offline) is not flagged', () => {
    assertEqual(hasLostPairedIdentity('WEB-UID', null), false);
  });
});
