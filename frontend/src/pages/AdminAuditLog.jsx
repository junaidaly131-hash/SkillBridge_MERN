import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import apiClient from "../api/client";
import Pagination from "../ui/Pagination";

const ACTION_LABELS = {
  role_change: "Changed role",
  verification_approved: "Approved verification",
  verification_rejected: "Rejected verification",
  refund_approved: "Approved refund",
  refund_rejected: "Rejected refund",
};

const formatAction = (action) => ACTION_LABELS[action] || action;

// The details blob used to be dumped as raw JSON, which read like a debug
// console rather than an audit trail. This turns it into labelled lines and
// drops the internal record ids, which mean nothing to the person reading it.
const readableDetails = (details) =>
  Object.entries(details || {})
    .filter(([key, value]) => !/(^|[a-z])Id$|^id$/.test(key) && value !== null && value !== "")
    .map(([key, value]) => [
      key
        .replace(/([A-Z])/g, " $1")
        .replace(/[_-]+/g, " ")
        .replace(/^./, (c) => c.toUpperCase())
        .trim(),
      typeof value === "object" ? JSON.stringify(value) : String(value),
    ]);

const formatDate = (dateString) =>
  new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

function AdminAuditLog() {
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchLog = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get(`/admin/audit-log?page=${page}&limit=15`);
        if (cancelled) return;
        setEntries(res.data.entries || []);
        setTotalPages(res.data.totalPages || 1);
      } catch {
        if (!cancelled) setError("Unable to load audit log. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchLog();
    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-family-poppins text-2xl font-bold text-black mb-1">
          Audit Log
        </h1>
        <p className="font-family-poppins text-sm text-gray">
          A record of every admin action taken on the platform
        </p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
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

        {!loading && !error && entries.length === 0 && (
          <p className="font-family-poppins text-sm text-gray text-center py-8">
            No admin actions have been recorded yet.
          </p>
        )}

        {!loading && !error && entries.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left">
                <thead>
                  <tr className="border-b border-[#E5E5E5]">
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Timestamp</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Admin</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Action</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Target User</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const isExpanded = expandedId === entry.id;
                    // Based on what's actually displayable, so an entry whose
                    // details hold nothing but internal ids shows no expander
                    // rather than an empty panel.
                    const detailRows = readableDetails(entry.details);
                    const hasDetails = detailRows.length > 0;
                    return (
                      <Fragment key={entry.id}>
                        <tr className="border-b border-[#F0F0F0] last:border-0">
                          <td className="font-family-poppins text-sm text-black py-3 whitespace-nowrap">
                            {formatDate(entry.createdAt)}
                          </td>
                          <td className="font-family-poppins text-sm py-3">
                            <p className="text-black font-medium">{entry.admin?.name || "Unknown admin"}</p>
                            <p className="text-gray text-xs">{entry.admin?.email}</p>
                          </td>
                          <td className="font-family-poppins text-sm text-black py-3">
                            {formatAction(entry.action)}
                          </td>
                          <td className="font-family-poppins text-sm py-3">
                            {entry.targetUser ? (
                              <>
                                <p className="text-black font-medium">{entry.targetUser.name}</p>
                                <p className="text-gray text-xs">{entry.targetUser.email}</p>
                              </>
                            ) : (
                              <span className="text-gray text-xs">-</span>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            {hasDetails && (
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                                className="text-gray hover:text-teal"
                                aria-label="Toggle details"
                              >
                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                            )}
                          </td>
                        </tr>
                        {isExpanded && hasDetails && (
                          <tr className="border-b border-[#F0F0F0] last:border-0">
                            <td colSpan={5} className="pb-3">
                              <dl className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                                {detailRows.map(([label, value]) => (
                                  <div key={label} className="flex gap-2 text-xs font-family-poppins">
                                    <dt className="text-gray shrink-0">{label}:</dt>
                                    <dd className="text-black wrap-break-word">{value}</dd>
                                  </div>
                                ))}
                              </dl>
                            </td>
                          </tr>
                        )}
                      </Fragment>
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
    </div>
  );
}

export default AdminAuditLog;
