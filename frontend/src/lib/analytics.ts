import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, logEvent, setUserId, type Analytics } from "firebase/analytics";

import { env, firebaseConfigured } from "./env";

let app: FirebaseApp | null = null;
let analytics: Analytics | null = null;
let ready: Promise<void> | null = null;

/** Initialise once, lazily. No-ops entirely when Firebase keys are absent. */
export function initAnalytics(): Promise<void> {
  if (!firebaseConfigured) return Promise.resolve();
  if (ready) return ready;

  ready = (async () => {
    try {
      if (!(await isSupported())) return;
      app = initializeApp(env.firebase);
      analytics = getAnalytics(app);
    } catch (error) {
      console.warn("Firebase Analytics unavailable:", error);
    }
  })();
  return ready;
}

export function track(name: string, params: Record<string, unknown> = {}): void {
  if (!firebaseConfigured) return;
  void initAnalytics().then(() => {
    if (analytics) logEvent(analytics, name, params);
  });
}

export function trackPage(path: string, title: string): void {
  track("page_view", { page_path: path, page_title: title });
}

export function identify(userId: string | null): void {
  if (!firebaseConfigured) return;
  void initAnalytics().then(() => {
    if (analytics) setUserId(analytics, userId);
  });
}
