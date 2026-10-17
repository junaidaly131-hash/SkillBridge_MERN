import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, CircleUserRound, CreditCard, MessageSquare, MessageCircle, LogOut, Menu, X, PanelLeftClose, LifeBuoy, Receipt, ShieldCheck, Users, ScrollText, BadgeCheck, RotateCcw, Banknote, Flag, History, AlertTriangle, Sparkles } from "lucide-react";
import { logout } from "../store/authSlice";
import TopbarActions from "./TopbarActions";

const navItems = [
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { name: "Profile", path: "/profile", icon: CircleUserRound },
  { name: "Credits", path: "/credits", icon: CreditCard },
  { name: "Purchase History", path: "/credits/history", icon: Receipt },
  { name: "Chat & Schedule", path: "/chat", icon: MessageSquare },
  { name: "AI Tutor", path: "/ai-tutor", icon: Sparkles },
  { name: "Session History", path: "/meetings/history", icon: History },
  { name: "Feedback", path: "/feedback", icon: MessageCircle },
  { name: "Support", path: "/support", icon: LifeBuoy },
];

// Admin accounts only manage the platform - they don't teach/learn/chat, so
// they get their own nav instead of the end-user nav with admin links tacked on.
const adminNavItems = [
  { name: "Revenue", path: "/admin/transactions", icon: ShieldCheck },
  { name: "User Management", path: "/admin/users", icon: Users },
  { name: "Reported Users", path: "/admin/reports", icon: Flag },
  { name: "Verifications", path: "/admin/verifications", icon: BadgeCheck },
  { name: "Refunds", path: "/admin/refunds", icon: RotateCcw },
  { name: "Payouts", path: "/admin/payouts", icon: Banknote },
  { name: "Session Disputes", path: "/admin/session-disputes", icon: AlertTriangle },
  { name: "Audit Log", path: "/admin/audit-log", icon: ScrollText },
];

function Sidebar() {
  const location = useLocation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  // Mobile drawer open/closed.
  const [isOpen, setIsOpen] = useState(false);
  // Desktop rail. Remembered so it survives a reload, like Upwork's.
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebarCollapsed") === "true";
    } catch {
      return false;
    }
  });
  const user = useSelector((state) => state.auth.user);
  const items = user?.role === "admin" ? adminNavItems : navItems;

  const toggleSidebar = () => setIsOpen(!isOpen);
  const closeSidebar = () => setIsOpen(false);

  const setCollapsed = (next) => {
    setIsCollapsed(next);
    try {
      localStorage.setItem("sidebarCollapsed", String(next));
    } catch {
      // Private mode - the rail just won't be remembered.
    }
  };

  const handleLogout = () => {
    dispatch(logout());
    navigate("/login", { replace: true });
    closeSidebar();
  };

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#E5E5E5] px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src="/assets/logo.png" alt="SkillBridge" className="h-10" />
        </Link>
        <div className="flex items-center gap-1">
          <TopbarActions />
          {!isOpen && (
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-lg hover:bg-gray-100 transition-all"
              aria-label="Open navigation"
            >
              <Menu size={24} />
            </button>
          )}
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 w-64 font-family-poppins h-screen bg-white border-r-2 border-[#E5E5E5] flex flex-col transform transition-all duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${isCollapsed ? "lg:w-20" : "lg:w-64"}`}
      >
        {/* Logo
            The two marks sit stacked in the same spot and simply cross-fade.
            Nothing slides or gets clipped - because the icon in the full
            lockup is already at its left edge, it lands exactly where the
            standalone mark is, so the brand icon appears to hold still while
            the wordmark dissolves around it. Only the wrapper's width
            animates, in step with the sidebar itself. */}
        <div
          // h-20 matches the Topbar's height exactly, so the rule under this
          // header lines up with the Topbar's bottom border across the fold.
          className={`h-20 shrink-0 flex items-center gap-3 ${
            isCollapsed ? "px-6 lg:gap-0 lg:px-0 lg:justify-center" : "px-6 justify-between"
          }`}
        >
          <div
            className={`relative h-10 shrink-0 transition-[width] duration-300 ease-in-out ${
              isCollapsed ? "w-[150px] lg:w-11" : "w-[150px]"
            }`}
          >
            <Link
              to="/"
              className={`absolute inset-y-0 left-0 flex items-center transition-opacity duration-200 ease-in-out ${
                isCollapsed ? "lg:opacity-0 lg:pointer-events-none" : "opacity-100"
              }`}
            >
              <img src="/assets/logo.png" alt="SkillBridge" className="h-10 max-w-none" />
            </Link>

            <button
              onClick={() => setCollapsed(false)}
              tabIndex={isCollapsed ? 0 : -1}
              aria-hidden={!isCollapsed}
              className={`absolute inset-y-0 left-0 hidden lg:flex items-center justify-center w-11 rounded-lg transition-opacity duration-200 ease-in-out ${
                isCollapsed ? "opacity-100 hover:bg-gray-50" : "opacity-0 pointer-events-none"
              }`}
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <img src="/logo.svg" alt="" className="h-9" />
            </button>
          </div>

          <button
            onClick={() => setCollapsed(true)}
            tabIndex={isCollapsed ? -1 : 0}
            aria-hidden={isCollapsed}
            className={`hidden lg:flex shrink-0 items-center justify-center h-9 overflow-hidden rounded-lg text-gray transition-all duration-200 ease-in-out ${
              isCollapsed
                ? "w-0 opacity-0 pointer-events-none"
                : "w-9 opacity-100 hover:bg-gray-100 hover:text-black"
            }`}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose size={20} className="shrink-0" />
          </button>

          <button
            onClick={closeSidebar}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-all shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <hr className="border-b mb-3 border-[#E5E5E5]" />

        {/* Navigation */}
        <nav className="flex-1 px-4">
          <ul className="space-y-2">
            {items.map((item) => {
              const isActive =
                location.pathname === item.path ||
                (item.path === "/profile" && location.pathname.startsWith("/profile/"));
              const Icon = item.icon;
              return (
                <li key={item.name}>
                  <Link
                    to={item.path}
                    onClick={closeSidebar}
                    title={isCollapsed ? item.name : undefined}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg font-family-poppins text-sm transition-all ${
                      isActive
                        ? "bg-light-teal text-teal font-medium"
                        : "text-gray hover:bg-gray-50"
                    } ${isCollapsed ? "lg:justify-center lg:px-0" : ""}`}
                  >
                    <Icon size={24} className="shrink-0" />
                    <span className={isCollapsed ? "lg:hidden" : ""}>{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Logout Button */}
        <div className="p-4 mt-auto">
          <button
            onClick={handleLogout}
            title={isCollapsed ? "Logout" : undefined}
            className={`flex items-center gap-3 px-4 py-3 w-full rounded-lg font-family-poppins text-sm text-gray hover:bg-red-50 hover:text-red-600 transition-all ${
              isCollapsed ? "lg:justify-center lg:px-0" : ""
            }`}
          >
            <LogOut size={20} className="shrink-0" />
            <span className={isCollapsed ? "lg:hidden" : ""}>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
