import { useEffect, useState } from "react";
import apiClient from "../api/client";
import Pagination from "../ui/Pagination";
import { useToast } from "../ui/Toast";
import ConfirmModal from "../components/Modal/ConfirmModal";

const STATUS_TABS = [
  { label: "Pending", value: "pending" },
  { label: "Reviewed", value: "reviewed" },
  { label: "Dismissed", value: "dismissed" },
];

const formatDate = (dateString) =>
  new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function AdminReports() {
  const { success, error: showError } = useToast();

  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actingReportId, setActingReportId] = useState(null);
  const [togglingUserId, setTogglingUserId] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null); // { reportId }

  useEffect(() => {
    let cancelled = false;

    const fetchReports = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(page), limit: "10", status });
        const res = await apiClient.get(`/admin/reports?${params.toString()}`);
        if (cancelled) return;
        setReports(res.data.reports || []);
        setTotalPages(res.data.totalPages || 1);
      } catch {
        if (!cancelled) setError("Unable to load reports. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchReports();
    return () => {
      cancelled = true;
    };
  }, [page, status]);

  const handleStatusTabChange = (value) => {
    setStatus(value);
    setPage(1);
  };

  const handleReview = async (reportId, action) => {
    if (action === "block") {
      setConfirmTarget({ reportId });
      return;
    }
    setActingReportId(reportId);
    try {
      await apiClient.patch(`/admin/reports/${reportId}`, { action });
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      success("Report dismissed.");
    } catch (err) {
      showError(err.response?.data?.message || "Unable to update report.");
    } finally {
      setActingReportId(null);
    }
  };

  const handleConfirmBlock = async () => {
    const reportId = confirmTarget?.reportId;
    if (!reportId) return;
    setActingReportId(reportId);
    try {
      await apiClient.patch(`/admin/reports/${reportId}`, { action: "block" });
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      success("User blocked and report marked reviewed.");
      setConfirmTarget(null);
    } catch (err) {
      showError(err.response?.data?.message || "Unable to update report.");
    } finally {
      setActingReportId(null);
    }
  };

  const handleUnblock = async (userId) => {
    setTogglingUserId(userId);
    try {
      await apiClient.patch(`/admin/users/${userId}/unsuspend`);
      setReports((prev) =>
        prev.map((r) =>
          r.reportedUser?.id === userId
            ? { ...r, reportedUser: { ...r.reportedUser, isSuspended: false } }
            : r
        )
      );
      success("User unblocked.");
    } catch (err) {
      showError(err.response?.data?.message || "Unable to unblock user.");
    } finally {
      setTogglingUserId(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-family-poppins text-2xl font-bold text-black mb-1">
          Reported Users
        </h1>
        <p className="font-family-poppins text-sm text-gray">
          Review reports and block users who violate the platform's rules
        </p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex gap-2 mb-4">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleStatusTabChange(tab.value)}
              className={`font-family-poppins text-sm font-medium px-4 py-2 rounded-lg transition-all ${
                status === tab.value ? "bg-teal-button text-white" : "bg-light-gray text-gray hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

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

        {!loading && !error && reports.length === 0 && (
          <p className="font-family-poppins text-sm text-gray text-center py-8">No {status} reports.</p>
        )}

        {!loading && !error && reports.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left">
                <thead>
                  <tr className="border-b border-[#E5E5E5]">
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Reported User</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Reported By</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Reason</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Date</th>
                    {status !== "dismissed" && (
                      <th className="font-family-poppins text-xs text-gray font-medium pb-3">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} className="border-b border-[#F0F0F0] last:border-0">
                      <td className="font-family-poppins text-sm py-3">
                        <p className="text-black font-medium">
                          {r.reportedUser?.name || "Deleted user"}
                          {r.reportedUser?.isSuspended && (
                            <span className="ml-2 text-xs text-red-600 font-semibold">Suspended</span>
                          )}
                        </p>
                        <p className="text-gray text-xs">{r.reportedUser?.email}</p>
                      </td>
                      <td className="font-family-poppins text-sm py-3">
                        <p className="text-black">{r.reporter?.name || "Deleted user"}</p>
                        <p className="text-gray text-xs">{r.reporter?.email}</p>
                      </td>
                      <td className="font-family-poppins text-sm text-black py-3 max-w-xs">
                        {r.reason}
                      </td>
                      <td className="font-family-poppins text-sm text-black py-3 whitespace-nowrap">
                        {formatDate(r.createdAt)}
                      </td>
                      {status === "pending" && (
                        <td className="py-3">
                          <div className="flex gap-2">
                            {r.reportedUser?.isSuspended ? (
                              <button
                                onClick={() => handleUnblock(r.reportedUser.id)}
                                disabled={togglingUserId === r.reportedUser.id}
                                className="font-family-poppins text-xs font-semibold text-black bg-light-gray hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-all"
                              >
                                Unblock
                              </button>
                            ) : (
                              <button
                                onClick={() => handleReview(r.id, "block")}
                                disabled={actingReportId === r.id}
                                className="font-family-poppins text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-all"
                              >
                                Block User
                              </button>
                            )}
                            <button
                              onClick={() => handleReview(r.id, "dismiss")}
                              disabled={actingReportId === r.id}
                              className="font-family-poppins text-xs font-medium text-gray hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg border border-[#D0D0D0] transition-all"
                            >
                              Dismiss
                            </button>
                          </div>
                        </td>
                      )}
                      {status === "reviewed" && (
                        <td className="py-3">
                          {r.reportedUser?.isSuspended ? (
                            <button
                              onClick={() => handleUnblock(r.reportedUser.id)}
                              disabled={togglingUserId === r.reportedUser.id}
                              className="font-family-poppins text-xs font-semibold text-black bg-light-gray hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-all"
                            >
                              Unblock
                            </button>
                          ) : (
                            <span className="font-family-poppins text-xs text-gray">-</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
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
        isOpen={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleConfirmBlock}
        title="Block User"
        message="Block this user? They'll be logged out and unable to sign back in or message anyone."
        confirmLabel="Block User"
        confirmingLabel="Blocking..."
        isConfirming={actingReportId === confirmTarget?.reportId}
      />
    </div>
  );
}

export default AdminReports;
