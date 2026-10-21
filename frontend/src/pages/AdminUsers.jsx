import { useEffect, useState } from "react";
import { BookOpen, GraduationCap, Search as SearchIcon, UsersRound, X } from "lucide-react";
import apiClient from "../api/client";
import Pagination from "../ui/Pagination";
import { useToast } from "../ui/Toast";
import ConfirmModal from "../components/Modal/ConfirmModal";

const formatDate = (dateString) =>
  new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function AdminUsers() {
  const { success, error: showError } = useToast();

  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [profileFilter, setProfileFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [togglingUserId, setTogglingUserId] = useState(null);
  const [confirmUserId, setConfirmUserId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchUsers = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(page), limit: "10" });
        if (search) params.set("search", search);
        if (profileFilter !== "all") params.set("profile", profileFilter);
        if (statusFilter !== "all") params.set("status", statusFilter);
        const res = await apiClient.get(`/admin/users?${params.toString()}`);
        if (cancelled) return;
        setUsers(res.data.users || []);
        setStats(res.data.stats || { totalUsers: 0, students: 0, teachers: 0 });
        setTotalPages(res.data.totalPages || 1);
        setTotalCount(res.data.totalCount || 0);
      } catch {
        if (!cancelled) setError("Unable to load users. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchUsers();
    return () => {
      cancelled = true;
    };
  }, [page, search, profileFilter, statusFilter, refreshKey]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleFilterChange = (setter) => (event) => {
    setPage(1);
    setter(event.target.value);
  };

  const clearFilters = () => {
    setPage(1);
    setSearch("");
    setSearchInput("");
    setProfileFilter("all");
    setStatusFilter("all");
  };

  const hasActiveFilters = Boolean(search) || profileFilter !== "all" || statusFilter !== "all";

  const statCards = [
    {
      label: "Total Users",
      value: stats?.totalUsers,
      helper: "All non-admin accounts",
      icon: <UsersRound size={22} aria-hidden="true" />,
      iconClass: "bg-light-teal text-teal",
    },
    {
      label: "Students",
      value: stats?.students,
      helper: "Learning one or more skills",
      icon: <GraduationCap size={22} aria-hidden="true" />,
      iconClass: "bg-[#FFF1E2] text-[#F97316]",
    },
    {
      label: "Teachers",
      value: stats?.teachers,
      helper: "Teaching one or more skills",
      icon: <BookOpen size={22} aria-hidden="true" />,
      iconClass: "bg-[#F3E8FF] text-[#9333EA]",
    },
  ];

  const handleToggleSuspend = async (userId, isSuspended) => {
    if (!isSuspended) {
      setConfirmUserId(userId);
      return;
    }
    setTogglingUserId(userId);
    try {
      const res = await apiClient.patch(`/admin/users/${userId}/unsuspend`);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isSuspended: res.data.user.isSuspended } : u))
      );
      success("User unblocked.");
      setRefreshKey((value) => value + 1);
    } catch (err) {
      showError(err.response?.data?.message || "Unable to update user.");
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleConfirmBlock = async () => {
    const userId = confirmUserId;
    if (!userId) return;
    setTogglingUserId(userId);
    try {
      const res = await apiClient.patch(`/admin/users/${userId}/suspend`);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isSuspended: res.data.user.isSuspended } : u))
      );
      success("User blocked.");
      setConfirmUserId(null);
      setRefreshKey((value) => value + 1);
    } catch (err) {
      showError(err.response?.data?.message || "Unable to update user.");
    } finally {
      setTogglingUserId(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-family-poppins text-2xl font-bold text-black mb-1">
          User Management
        </h1>
        <p className="font-family-poppins text-sm text-gray">
          View members, filter profiles, and manage account status
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {statCards.map(({ label, value, helper, icon, iconClass }) => (
          <div key={label} className="bg-white rounded-xl p-5 shadow-sm border border-[#EEEEEE]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-family-poppins text-sm text-gray">{label}</p>
                {value === undefined ? (
                  <div className="h-9 w-16 bg-gray-200 rounded animate-pulse mt-2" />
                ) : (
                  <p className="font-family-poppins text-3xl font-bold text-black mt-1">{value}</p>
                )}
              </div>
              <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${iconClass}`}>
                {icon}
              </span>
            </div>
            <p className="font-family-poppins text-xs text-gray mt-3">{helper}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <h2 className="font-family-poppins text-lg font-semibold text-black">Members</h2>
            <p className="font-family-poppins text-xs text-gray mt-0.5">
              {loading ? "Loading members..." : `${totalCount} ${totalCount === 1 ? "result" : "results"}`}
            </p>
          </div>
          <p className="hidden lg:block font-family-poppins text-xs text-gray text-right">
            Users with both skill types appear as student and teacher.
          </p>
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 pb-5 mb-1 border-b border-[#E5E5E5]"
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 w-full xl:w-auto">
            <div className="relative w-full xl:w-[25rem]">
              <SearchIcon
                size={18}
                aria-hidden="true"
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray"
              />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full min-w-0 font-family-poppins text-sm border border-[#D0D0D0] rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-teal"
              />
            </div>
            <button
              type="submit"
              className="font-family-poppins text-sm font-semibold text-white bg-teal-button hover:bg-teal-button-hover px-5 py-2.5 rounded-lg transition-colors"
            >
              Search
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full xl:w-auto">
            <label className="sr-only" htmlFor="user-profile-filter">Profile type</label>
            <select
              id="user-profile-filter"
              value={profileFilter}
              onChange={handleFilterChange(setProfileFilter)}
              className="w-full sm:w-48 font-family-poppins text-sm text-black border border-[#D0D0D0] rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-teal"
            >
              <option value="all">All profiles</option>
              <option value="student">Students</option>
              <option value="teacher">Teachers</option>
              <option value="both">Student & teacher</option>
              <option value="unassigned">No skills added</option>
            </select>
            <label className="sr-only" htmlFor="user-status-filter">Account status</label>
            <select
              id="user-status-filter"
              value={statusFilter}
              onChange={handleFilterChange(setStatusFilter)}
              className="w-full sm:w-44 font-family-poppins text-sm text-black border border-[#D0D0D0] rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-teal"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
            </select>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center justify-center gap-1.5 font-family-poppins text-sm font-medium text-gray border border-[#D0D0D0] px-4 py-2.5 rounded-lg hover:bg-light-gray transition-colors"
              >
                <X size={16} aria-hidden="true" />
                Clear
              </button>
            )}
          </div>
        </form>

        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="font-family-poppins text-sm text-gray text-center py-8">{error}</p>
        )}

        {!loading && !error && users.length === 0 && (
          <p className="font-family-poppins text-sm text-gray text-center py-8">No users found.</p>
        )}

        {!loading && !error && users.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left">
                <thead>
                  <tr className="border-b border-[#E5E5E5]">
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">User</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Profile</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Joined</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    return (
                      <tr key={u.id} className="border-b border-[#F0F0F0] last:border-0">
                        <td className="font-family-poppins text-sm py-3">
                          <p className="text-black font-medium">
                            {u.name}
                          </p>
                          <p className="text-gray text-xs">{u.email}</p>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {u.isStudent && (
                              <span className="font-family-poppins text-[11px] font-medium text-[#C2410C] bg-[#FFF1E2] rounded-full px-2.5 py-1">
                                Student
                              </span>
                            )}
                            {u.isTeacher && (
                              <span className="font-family-poppins text-[11px] font-medium text-[#7E22CE] bg-[#F3E8FF] rounded-full px-2.5 py-1">
                                Teacher
                              </span>
                            )}
                            {!u.isStudent && !u.isTeacher && (
                              <span className="font-family-poppins text-[11px] text-gray bg-light-gray rounded-full px-2.5 py-1">
                                Not set
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="font-family-poppins text-sm text-black py-3">
                          {formatDate(u.createdAt)}
                        </td>
                        <td className="py-3">
                          <button
                            onClick={() => handleToggleSuspend(u.id, u.isSuspended)}
                            disabled={togglingUserId === u.id}
                            title={u.isSuspended ? u.suspendedReason || undefined : undefined}
                            className={`font-family-poppins text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                              u.isSuspended
                                ? "bg-light-gray text-black hover:bg-gray-200"
                                : "bg-red-600 text-white hover:bg-red-700"
                            }`}
                          >
                            {u.isSuspended ? "Unblock" : "Block"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
            )}
          </>
        )}
      </div>

      <ConfirmModal
        isOpen={Boolean(confirmUserId)}
        onClose={() => setConfirmUserId(null)}
        onConfirm={handleConfirmBlock}
        title="Block User"
        message="Block this user? They'll be logged out and unable to sign back in or message anyone."
        confirmLabel="Block User"
        confirmingLabel="Blocking..."
        isConfirming={togglingUserId === confirmUserId}
      />
    </div>
  );
}

export default AdminUsers;
