import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import apiClient from "../api/client";
import Pagination from "../ui/Pagination";
import { useToast } from "../ui/Toast";
import ConfirmModal from "../components/Modal/ConfirmModal";

const formatDate = (dateString) =>
  new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function AdminUsers() {
  const { success, error: showError } = useToast();
  const currentUserId = useSelector((state) => state.auth.user?.id);

  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
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
        const res = await apiClient.get(`/admin/users?${params.toString()}`);
        if (cancelled) return;
        setUsers(res.data.users || []);
        setTotalPages(res.data.totalPages || 1);
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
  }, [page, search]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

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
          Search users and manage their status
        </p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="flex gap-2 mb-4">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or email..."
            className="flex-1 font-family-poppins text-sm border border-[#D0D0D0] rounded-lg px-4 py-2 focus:outline-none focus:border-teal"
          />
          <button
            type="submit"
            className="font-family-poppins text-sm font-semibold text-white bg-teal-button px-4 py-2 rounded-lg"
          >
            Search
          </button>
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
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#E5E5E5]">
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">User</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Joined</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelf = u.id === currentUserId;
                    return (
                      <tr key={u.id} className="border-b border-[#F0F0F0] last:border-0">
                        <td className="font-family-poppins text-sm py-3">
                          <p className="text-black font-medium">
                            {u.name} {isSelf && <span className="text-xs text-gray">(you)</span>}
                          </p>
                          <p className="text-gray text-xs">{u.email}</p>
                        </td>
                        <td className="font-family-poppins text-sm text-black py-3">
                          {formatDate(u.createdAt)}
                        </td>
                        <td className="py-3">
                          {u.role === "admin" ? (
                            <span className="font-family-poppins text-xs text-gray">-</span>
                          ) : (
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
                          )}
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
