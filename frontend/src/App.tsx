import { Suspense, lazy, useEffect, type ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import { AppShell } from "./components/layout/AppShell";
import { PageLoader, ToastProvider } from "./components/ui";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { initAnalytics, trackPage } from "./lib/analytics";
import { AuditTrail } from "./pages/AuditTrail";
import { Dashboard } from "./pages/Dashboard";
import { Documents } from "./pages/Documents";
import { Landing } from "./pages/Landing";
import { NotFound } from "./pages/NotFound";
import { Placeholder } from "./pages/Placeholder";
import { Settings } from "./pages/Settings";
import { SignIn } from "./pages/SignIn";
import { SignUp } from "./pages/SignUp";

// pdf.js is ~1.3 MB, so the two routes that render documents load on demand.
const SigningViewer = lazy(() =>
  import("./pages/SigningViewer").then((module) => ({
    default: module.SigningViewer,
  })),
);
const WorkflowBuilder = lazy(() =>
  import("./pages/WorkflowBuilder").then((module) => ({
    default: module.WorkflowBuilder,
  })),
);

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, configured } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader label="Restoring your session" />;
  if (!configured) return <Navigate to="/sign-in" replace />;
  if (!session)
    return (
      <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
    );
  return <AppShell>{children}</AppShell>;
}

function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (session) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPage(location.pathname, document.title);
  }, [location.pathname]);
  return null;
}

export default function App() {
  useEffect(() => {
    void initAnalytics();
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <RouteTracker />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/sign-in"
                element={
                  <RedirectIfSignedIn>
                    <SignIn />
                  </RedirectIfSignedIn>
                }
              />
              <Route
                path="/sign-up"
                element={
                  <RedirectIfSignedIn>
                    <SignUp />
                  </RedirectIfSignedIn>
                }
              />

              {/* Public: the magic-link token is the only credential. */}
              <Route path="/sign/:token" element={<SigningViewer />} />

              <Route
                path="/dashboard"
                element={
                  <RequireAuth>
                    <Dashboard />
                  </RequireAuth>
                }
              />
              <Route
                path="/documents"
                element={
                  <RequireAuth>
                    <Documents />
                  </RequireAuth>
                }
              />
              <Route
                path="/documents/new"
                element={
                  <RequireAuth>
                    <WorkflowBuilder />
                  </RequireAuth>
                }
              />
              <Route
                path="/documents/:id/build"
                element={
                  <RequireAuth>
                    <WorkflowBuilder />
                  </RequireAuth>
                }
              />
              <Route
                path="/documents/:id/audit"
                element={
                  <RequireAuth>
                    <AuditTrail />
                  </RequireAuth>
                }
              />
              <Route
                path="/approvals"
                element={
                  <RequireAuth>
                    <Documents filterStatus="routing" heading="Approvals" />
                  </RequireAuth>
                }
              />
              <Route
                path="/templates"
                element={
                  <RequireAuth>
                    <Placeholder
                      icon="layers"
                      title="Templates"
                      description="Save a finished routing plan as a reusable template. Planned for the next milestone — today, duplicate an existing draft from Documents."
                    />
                  </RequireAuth>
                }
              />
              <Route
                path="/analytics"
                element={
                  <RequireAuth>
                    <Placeholder
                      icon="monitoring"
                      title="Analytics"
                      description="Bottleneck and SLA reporting builds on the audit chain already being recorded. The dashboard shows headline throughput today."
                    />
                  </RequireAuth>
                }
              />
              <Route
                path="/settings"
                element={
                  <RequireAuth>
                    <Settings />
                  </RequireAuth>
                }
              />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
