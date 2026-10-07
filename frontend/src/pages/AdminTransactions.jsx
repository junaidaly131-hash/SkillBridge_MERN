import { useEffect, useState } from "react";
import { Banknote, Receipt, CheckCircle2 } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import apiClient from "../api/client";
import Pagination from "../ui/Pagination";
import Badge from "../ui/Badge";

const STATUS_COLORS = {
  completed: "#2A9D90",
  failed: "#FF0000",
  refunded: "#9CA3AF",
};

const DATE_RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

const formatShortDate = (dateString) =>
  new Date(`${dateString}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

const formatDate = (dateString) =>
  new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const formatCurrency = (amount, currency) => {
  if ((currency || "PKR") === "PKR") {
    return `Rs. ${(amount || 0).toLocaleString("en-US")}`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount || 0);
};

function AdminTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [days, setDays] = useState(30);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchTransactions = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get(`/admin/transactions?page=${page}&limit=10`);
        if (cancelled) return;
        setTransactions(res.data.transactions || []);
        setStats(res.data.stats || null);
        setTotalPages(res.data.totalPages || 1);
      } catch {
        if (!cancelled) setError("Unable to load transactions. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTransactions();
    return () => {
      cancelled = true;
    };
  }, [page]);

  useEffect(() => {
    let cancelled = false;

    const fetchAnalytics = async () => {
      setAnalyticsLoading(true);
      setAnalyticsError(null);
      try {
        const res = await apiClient.get(`/admin/analytics?days=${days}`);
        if (cancelled) return;
        setAnalytics(res.data);
      } catch {
        if (!cancelled) setAnalyticsError("Unable to load analytics. Please try again.");
      } finally {
        if (!cancelled) setAnalyticsLoading(false);
      }
    };

    fetchAnalytics();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const statusData = analytics
    ? Object.entries(analytics.transactionStatusBreakdown)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({ status, count }))
    : [];

  const successRate =
    stats && stats.totalTransactions > 0
      ? Math.round((stats.completedCount / stats.totalTransactions) * 100)
      : 0;

  const summaryCards = [
    {
      title: "Total Revenue",
      value: stats ? formatCurrency(stats.totalRevenue, stats.currency) : "-",
      icon: Banknote,
      iconBg: "bg-teal/10",
      iconColor: "text-teal",
    },
    {
      title: "Total Transactions",
      value: stats ? stats.totalTransactions : "-",
      icon: Receipt,
      iconBg: "bg-orange-100",
      iconColor: "text-orange-500",
    },
    {
      title: "Success Rate",
      value: stats ? `${successRate}%` : "-",
      icon: CheckCircle2,
      iconBg: "bg-purple-100",
      iconColor: "text-purple-500",
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-family-poppins text-2xl font-bold text-black mb-1">
          Revenue &amp; Transactions
        </h1>
        <p className="font-family-poppins text-sm text-gray">
          Platform-wide credit purchase activity
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="bg-white rounded-xl p-5 shadow-sm">
              <p className="font-family-poppins text-sm text-gray mb-3">{card.title}</p>
              <div className={`w-8 h-8 ${card.iconBg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon className={card.iconColor} size={18} />
              </div>
              {loading ? (
                <div className="h-9 w-20 bg-gray-200 rounded animate-pulse" />
              ) : (
                <p className="font-family-poppins text-3xl font-bold text-black">{card.value}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h2 className="font-family-poppins text-lg font-semibold text-black">Trends</h2>
        <div className="flex flex-wrap gap-2">
          {DATE_RANGES.map((range) => (
            <button
              key={range.days}
              onClick={() => setDays(range.days)}
              className={`font-family-poppins text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
                days === range.days
                  ? "bg-[#227E73] text-white hover:bg-[#1C6A61] hover:text-white"
                  : "border border-[#D0D0D0] text-gray hover:bg-gray-50"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 bg-white rounded-xl p-4 sm:p-6 shadow-sm">
          <p className="font-family-poppins text-sm font-semibold text-black mb-4">
            Revenue Over Time
          </p>
          {analyticsLoading ? (
            <div className="h-64 bg-gray-100 rounded animate-pulse" />
          ) : analyticsError ? (
            <p className="font-family-poppins text-sm text-gray text-center py-16">{analyticsError}</p>
          ) : analytics.revenueByDay.length === 0 ? (
            <p className="font-family-poppins text-sm text-gray text-center py-16">
              No revenue in this period.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={analytics.revenueByDay}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                accessibilityLayer={false}
              >
                <CartesianGrid stroke="#F0F0F0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  tick={{ fontSize: 12, fill: "#575757" }}
                  axisLine={{ stroke: "#E5E5E5" }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `Rs. ${v}`}
                  tick={{ fontSize: 12, fill: "#575757" }}
                  axisLine={false}
                  tickLine={false}
                  width={68}
                  tickMargin={8}
                />
                <Tooltip
                  formatter={(value) => [formatCurrency(value), "Revenue"]}
                  labelFormatter={formatShortDate}
                  contentStyle={{ fontFamily: "inherit", fontSize: 13, borderRadius: 8 }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#2A9D90"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#2A9D90" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm">
          <p className="font-family-poppins text-sm font-semibold text-black mb-4">
            Transaction Status
          </p>
          {analyticsLoading ? (
            <div className="h-64 bg-gray-100 rounded animate-pulse" />
          ) : analyticsError ? (
            <p className="font-family-poppins text-sm text-gray text-center py-16">{analyticsError}</p>
          ) : statusData.length === 0 ? (
            <p className="font-family-poppins text-sm text-gray text-center py-16">
              No transactions in this period.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart accessibilityLayer={false}>
                <Pie
                  data={statusData}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {statusData.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || "#9CA3AF"} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [value, name]}
                  contentStyle={{ fontFamily: "inherit", fontSize: 13, borderRadius: 8, textTransform: "capitalize" }}
                />
                <Legend
                  formatter={(value) => <span className="capitalize text-xs text-gray">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="lg:col-span-3 bg-white rounded-xl p-4 sm:p-6 shadow-sm">
          <p className="font-family-poppins text-sm font-semibold text-black mb-4">
            New User Signups
          </p>
          {analyticsLoading ? (
            <div className="h-56 bg-gray-100 rounded animate-pulse" />
          ) : analyticsError ? (
            <p className="font-family-poppins text-sm text-gray text-center py-16">{analyticsError}</p>
          ) : analytics.userSignupsByDay.length === 0 ? (
            <p className="font-family-poppins text-sm text-gray text-center py-16">
              No signups in this period.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={analytics.userSignupsByDay}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                accessibilityLayer={false}
              >
                <CartesianGrid stroke="#F0F0F0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  tick={{ fontSize: 12, fill: "#575757" }}
                  axisLine={{ stroke: "#E5E5E5" }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: "#575757" }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  cursor={false}
                  formatter={(value) => [value, "New signups"]}
                  labelFormatter={formatShortDate}
                  contentStyle={{ fontFamily: "inherit", fontSize: 13, borderRadius: 8 }}
                />
                <Bar dataKey="count" fill="#F97316" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="font-family-poppins text-lg font-semibold text-black mb-4">
          All Transactions
        </h2>

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

        {!loading && !error && transactions.length === 0 && (
          <p className="font-family-poppins text-sm text-gray text-center py-8">
            No transactions yet.
          </p>
        )}

        {!loading && !error && transactions.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left">
                <thead>
                  <tr className="border-b border-[#E5E5E5]">
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">User</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Date</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Credits</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Amount</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id} className="border-b border-[#F0F0F0] last:border-0">
                      <td className="font-family-poppins text-sm py-3">
                        <p className="text-black font-medium">{t.user?.name || "Unknown user"}</p>
                        <p className="text-gray text-xs">{t.user?.email}</p>
                      </td>
                      <td className="font-family-poppins text-sm text-black py-3">
                        {formatDate(t.createdAt)}
                      </td>
                      <td className="font-family-poppins text-sm text-black py-3">
                        {t.creditsGranted}
                      </td>
                      <td className="font-family-poppins text-sm text-black py-3">
                        {formatCurrency(t.amountPaid, t.currency)}
                      </td>
                      <td className="py-3">
                        <Badge status={t.status} />
                      </td>
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
    </div>
  );
}

export default AdminTransactions;
