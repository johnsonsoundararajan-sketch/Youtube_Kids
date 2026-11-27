import { getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import type { YouTubeChannelInfo } from '../types/story';

export const TARGET_CHANNEL_HANDLE = '@A-VerseForYou';
export const TARGET_CHANNEL_URL = 'https://www.youtube.com/@A-VerseForYou';

export const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

let isSigningIn = false;
// Access token is cached strictly in memory (never in localStorage or sessionStorage).
let cachedAccessToken: string | null = null;

function buildProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  for (const scope of SCOPES) {
    provider.addScope(scope);
  }
  provider.setCustomParameters({
    prompt: 'select_account',
    include_granted_scopes: 'true',
  });
  return provider;
}

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const provider = buildProvider();
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'Could not obtain a YouTube OAuth access token from Google sign-in.'
      );
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async (): Promise<void> => {
  await auth.signOut();
  cachedAccessToken = null;
};

export async function fetchConnectedYouTubeChannel(
  accessToken: string
): Promise<YouTubeChannelInfo | null> {
  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `Failed to inspect YouTube channel (HTTP ${res.status}).`
    );
  }
  const data = await res.json();
  const channel = data?.items?.[0];
  if (!channel) return null;

  const customUrl: string = channel.snippet?.customUrl || '';
  const normalizedTarget = TARGET_CHANNEL_HANDLE.toLowerCase();
  const normalizedCustom = customUrl.toLowerCase();
  const matchesTargetChannel =
    normalizedCustom === normalizedTarget ||
    normalizedCustom === normalizedTarget.replace('@', '') ||
    (channel.snippet?.title || '').toLowerCase().includes('verseforyou');

  return {
    id: channel.id,
    title: channel.snippet?.title || 'Connected Channel',
    customUrl: customUrl || channel.id,
    thumbnailUrl: channel.snippet?.thumbnails?.default?.url,
    subscriberCount: channel.statistics?.subscriberCount,
    matchesTargetChannel,
  };
}
