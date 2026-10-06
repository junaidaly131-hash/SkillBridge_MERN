import { createBrowserRouter } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import SignUpPage from "./pages/SignUpPage";
import TwoFactorPage from "./pages/TwoFactorPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import RootLayout from "./layouts/RootLayout";
import DashboardLayout from "./layouts/DashboardLayout";
import DashboardPage from "./pages/DashboardPage";
import ProfilePage from "./pages/ProfilePage";
import ViewProfilePage from "./pages/ViewProfilePage";
import ChatPage from "./pages/ChatPage";
import FeedbackPage from "./pages/FeedbackPage";
import CreditsPage from "./pages/CreditsPage";
import PurchaseHistory from "./pages/PurchaseHistory";
import CreditsSuccess from "./pages/CreditsSuccess";
import CreditsCancelled from "./pages/CreditsCancelled";
import SessionHistory from "./pages/SessionHistory";
import AdminTransactions from "./pages/AdminTransactions";
import AdminUsers from "./pages/AdminUsers";
import AdminAuditLog from "./pages/AdminAuditLog";
import AdminVerifications from "./pages/AdminVerifications";
import AdminRefunds from "./pages/AdminRefunds";
import AdminPayouts from "./pages/AdminPayouts";
import AdminReports from "./pages/AdminReports";
import AdminSessionDisputes from "./pages/AdminSessionDisputes";
import VideoCallPage from "./pages/VideoCallPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import RefundPolicyPage from "./pages/RefundPolicyPage";
import ContactPage from "./pages/ContactPage";
import TeachersPage from "./pages/TeachersPage";
import TeacherProfilePage from "./pages/TeacherProfilePage";
import SupportPage from "./pages/SupportPage";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";
import AdminRoute from "./components/AdminRoute";

const router = createBrowserRouter([
  {
    element: <RootLayout />,
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
