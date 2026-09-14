/** Typed access to the VITE_* keys, with a single place to check what is missing. */
const raw = import.meta.env;

export const env = {
  apiBaseUrl: (raw.VITE_API_BASE_URL as string) || "http://localhost:8000/api",
  supabaseUrl: (raw.VITE_SUPABASE_URL as string) || "",
  supabaseAnonKey: (raw.VITE_SUPABASE_ANON_KEY as string) || "",
  firebase: {
    apiKey: (raw.VITE_FIREBASE_API_KEY as string) || "",
    authDomain: (raw.VITE_FIREBASE_AUTH_DOMAIN as string) || "",
    projectId: (raw.VITE_FIREBASE_PROJECT_ID as string) || "",
    storageBucket: (raw.VITE_FIREBASE_STORAGE_BUCKET as string) || "",
    messagingSenderId: (raw.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || "",
    appId: (raw.VITE_FIREBASE_APP_ID as string) || "",
    measurementId: (raw.VITE_FIREBASE_MEASUREMENT_ID as string) || "",
  },
};

export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const firebaseConfigured = Boolean(env.firebase.apiKey && env.firebase.appId);
