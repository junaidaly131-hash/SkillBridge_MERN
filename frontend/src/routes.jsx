import { lazy } from "react";
import { createBrowserRouter } from "react-router-dom";

import RootLayout from "./layouts/RootLayout";
import RouteErrorBoundary from "./components/RouteErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";
import AdminRoute from "./components/AdminRoute";

// Eager: the three pages a first-time visitor actually lands on. Making these
// lazy would only add a network round trip before anything renders.
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import SignUpPage from "./pages/SignUpPage";

// Everything else is split out. Before this, opening the landing page
// downloaded the whole product - admin screens, the video call SDK, the chat
// socket - in one chunk, none of which a signed-out visitor can even reach.
//
// The guards stay eager and stay exactly where they were: a lazy page is still
// rendered inside ProtectedRoute/AdminRoute, so splitting changes when the code
// arrives, never who is allowed to see it.
const TwoFactorPage = lazy(() => import("./pages/TwoFactorPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const RefundPolicyPage = lazy(() => import("./pages/RefundPolicyPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const TeachersPage = lazy(() => import("./pages/TeachersPage"));
const TeacherProfilePage = lazy(() => import("./pages/TeacherProfilePage"));
const LearnSkillPage = lazy(() => import("./pages/LearnSkillPage"));

const DashboardLayout = lazy(() => import("./layouts/DashboardLayout"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const ViewProfilePage = lazy(() => import("./pages/ViewProfilePage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage"));
const SupportPage = lazy(() => import("./pages/SupportPage"));
const CreditsPage = lazy(() => import("./pages/CreditsPage"));
const PurchaseHistory = lazy(() => import("./pages/PurchaseHistory"));
const CreditsSuccess = lazy(() => import("./pages/CreditsSuccess"));
const CreditsCancelled = lazy(() => import("./pages/CreditsCancelled"));
const SessionHistory = lazy(() => import("./pages/SessionHistory"));
const VideoCallPage = lazy(() => import("./pages/VideoCallPage"));

const AdminTransactions = lazy(() => import("./pages/AdminTransactions"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminAuditLog = lazy(() => import("./pages/AdminAuditLog"));
const AdminVerifications = lazy(() => import("./pages/AdminVerifications"));
const AdminRefunds = lazy(() => import("./pages/AdminRefunds"));
const AdminPayouts = lazy(() => import("./pages/AdminPayouts"));
const AdminReports = lazy(() => import("./pages/AdminReports"));
const AdminSessionDisputes = lazy(() => import("./pages/AdminSessionDisputes"));

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    // Catches a chunk that 404s because a new deploy replaced it mid-session.
    errorElement: <RouteErrorBoundary />,
    children: [
    {
      path: "/",
      element: (
        <PublicRoute>
          <LandingPage />
        </PublicRoute>
      ),
    },
    {
      path: "/login",
      element: (
        <PublicRoute>
          <LoginPage />
        </PublicRoute>
      ),
    },
    {
      path: "/forgot-password",
      element: (
        <PublicRoute>
          <ForgotPasswordPage />
        </PublicRoute>
      ),
    },
    {
      path: "/signup",
      element: (
        <PublicRoute>
          <SignUpPage />
        </PublicRoute>
      ),
    },
    {
      path: "/verify",
      element: <TwoFactorPage />,
    },
    {
      path: "/terms",
      element: <TermsPage />,
    },
    {
      path: "/privacy",
      element: <PrivacyPage />,
    },
    {
      path: "/refund-policy",
      element: <RefundPolicyPage />,
    },
    {
      path: "/contact",
      element: <ContactPage />,
    },
    // Public and signed-out on purpose: these are the only pages that show what
    // is actually on the platform, so they are what a visitor judges it by and
    // the only inventory a search engine can reach. No PublicRoute wrapper -
    // that redirects signed-in users away, and a logged-in user following a
    // shared profile link should still land on the profile.
    {
      path: "/teachers",
      element: <TeachersPage />,
    },
    {
      path: "/teachers/:id",
      element: <TeacherProfilePage />,
    },
    // One page per skill someone teaches. The server decides which slugs exist,
    // so this route is open and a skill with no teachers renders its own empty
    // state rather than being listed anywhere.
    {
      path: "/learn/:slug",
      element: <LearnSkillPage />,
    },
    {
      element: (
        <ProtectedRoute>
          <DashboardLayout />
        </ProtectedRoute>
      ),
      children: [
        {
          path: "/dashboard",
          element: <DashboardPage />,
        },
        {
          path: "/profile",
          element: <ProfilePage />,
        },
        {
          path: "/profile/:id",
          element: <ViewProfilePage />,
        },
        {
          path: "/chat",
          element: <ChatPage />,
        },
        {
          path: "/feedback",
          element: <FeedbackPage />,
        },
        {
          path: "/support",
          element: <SupportPage />,
        },
        {
          path: "/credits",
          element: <CreditsPage />,
        },
        {
          path: "/credits/history",
          element: <PurchaseHistory />,
        },
        {
          path: "/credits/success",
          element: <CreditsSuccess />,
        },
        {
          path: "/credits/cancelled",
          element: <CreditsCancelled />,
        },
        {
          path: "/meetings/history",
          element: <SessionHistory />,
        },
        {
          path: "/meetings/:id/call",
          element: <VideoCallPage />,
        },
        {
          path: "/admin/transactions",
          element: (
            <AdminRoute>
              <AdminTransactions />
            </AdminRoute>
          ),
        },
        {
          path: "/admin/users",
          element: (
            <AdminRoute>
              <AdminUsers />
            </AdminRoute>
          ),
        },
        {
          path: "/admin/audit-log",
          element: (
            <AdminRoute>
              <AdminAuditLog />
            </AdminRoute>
          ),
        },
        {
          path: "/admin/verifications",
          element: (
            <AdminRoute>
              <AdminVerifications />
            </AdminRoute>
          ),
        },
        {
          path: "/admin/refunds",
          element: (
            <AdminRoute>
              <AdminRefunds />
            </AdminRoute>
          ),
        },
        {
          path: "/admin/payouts",
          element: (
            <AdminRoute>
              <AdminPayouts />
            </AdminRoute>
          ),
        },
        {
          path: "/admin/reports",
          element: (
            <AdminRoute>
              <AdminReports />
            </AdminRoute>
          ),
        },
        {
          path: "/admin/session-disputes",
          element: (
            <AdminRoute>
              <AdminSessionDisputes />
            </AdminRoute>
          ),
        },
      ],
    },
  ],
  },
]);

export default router;
