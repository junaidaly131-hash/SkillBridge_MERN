import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BadgeCheck, Loader2, MapPin, Search, Star } from "lucide-react";
import Header from "../components/LandingPage/Header";
import Footer from "../components/LandingPage/Footer";
import apiClient from "../api/client";
import { usePageMeta } from "../hooks/usePageMeta";

// The public directory. Besides being something a visitor can judge the
// platform by before signing up, this is the page that gives every teacher
// profile an internal link - without one, Google has no route to them at all.
function TeachersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const skill = searchParams.get("skill") || "";
  const page = Math.max(1, parseInt(searchParams.get("page")) || 1);

  const [query, setQuery] = useState(skill);
  const [data, setData] = useState({ teachers: [], totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  usePageMeta({
    title: skill ? `${skill} teachers` : "Find a teacher",
    description: skill
      ? `Browse verified ${skill} teachers on SkillBridge and book a one-on-one session.`
      : "Browse verified teachers on SkillBridge. See their skills, ratings and experience, then book a one-on-one session.",
    path: "/teachers",
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    const params = new URLSearchParams({ page: String(page) });
    if (skill) params.set("skill", skill);

    apiClient
      .get(`/public/teachers?${params}`)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load teachers right now. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [skill, page]);

  const handleSearch = (e) => {
    e.preventDefault();
    const next = query.trim();
    setSearchParams(next ? { skill: next } : {});
  };

  return (
    <div className="min-h-screen bg-light-bg flex flex-col">
      <Header />

      <main className="grow">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-8 text-center">
            <h1 className="font-family-poppins text-3xl font-bold text-black mb-2">
              {skill ? `${skill} teachers` : "Find a teacher"}
            </h1>
            <p className="font-family-poppins text-sm text-gray max-w-xl mx-auto">
              Every teacher here has had their identity and credentials checked by our team.
            </p>
          </div>

          <form onSubmit={handleSearch} className="max-w-xl mx-auto mb-10">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray" size={18} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by skill, e.g. graphic design"
                className="w-full pl-11 pr-28 py-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm outline-none focus:border-teal bg-white"
              />
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 font-family-poppins text-sm font-semibold text-white bg-teal px-4 py-2 rounded-md hover:opacity-90 transition-all"
              >
                Search
              </button>
            </div>
          </form>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-teal" />
            </div>
          ) : error ? (
            <p className="text-center font-family-poppins text-sm text-gray py-16">{error}</p>
          ) : data.teachers.length === 0 ? (
            <div className="text-center py-16">
              <p className="font-family-poppins text-base font-semibold text-black mb-1">
                {skill ? `No verified teachers for "${skill}" yet` : "No teachers listed yet"}
              </p>
              <p className="font-family-poppins text-sm text-gray mb-5">
                {skill
                  ? "Try a broader search, or browse everyone."
                  : "Teachers appear here once their verification is approved."}
              </p>
              {skill && (
                <Link
                  to="/teachers"
                  className="inline-block font-family-poppins text-sm font-semibold text-white bg-teal px-6 py-2.5 rounded-lg hover:opacity-90 transition-all"
                >
                  Browse all teachers
                </Link>
              )}
            </div>
          ) : (
            <>
              <p className="font-family-poppins text-sm text-gray mb-4">
                {data.total} verified teacher{data.total === 1 ? "" : "s"}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {data.teachers.map((t) => (
                  <Link
                    key={t.id}
                    to={`/teachers/${t.id}`}
                    className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      {t.avatar ? (
                        <img
                          src={t.avatar}
                          alt=""
                          className="w-12 h-12 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-light-teal flex items-center justify-center shrink-0 font-family-poppins font-semibold text-teal">
                          {t.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-family-poppins font-semibold text-black truncate flex items-center gap-1">
                          {t.name}
                          <BadgeCheck className="text-teal shrink-0" size={15} />
                        </p>
                        {t.location && (
                          <p className="font-family-poppins text-xs text-gray flex items-center gap-1 truncate">
                            <MapPin size={11} /> {t.location}
                          </p>
                        )}
                      </div>
                    </div>

                    {t.bio && (
                      <p className="font-family-poppins text-sm text-gray line-clamp-2 mb-3">
                        {t.bio}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {t.skills.slice(0, 3).map((s) => (
                        <span
                          key={s.name}
                          className="font-family-poppins text-xs bg-light-teal text-teal px-2 py-1 rounded-md"
                        >
                          {s.name}
                        </span>
                      ))}
                      {t.skills.length > 3 && (
                        <span className="font-family-poppins text-xs text-gray px-1 py-1">
                          +{t.skills.length - 3}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 font-family-poppins text-xs text-gray">
                      <span className="flex items-center gap-1">
                        <Star className="text-yellow-500 fill-yellow-500" size={13} />
                        {t.stats.avgRating > 0 ? t.stats.avgRating.toFixed(1) : "New"}
                      </span>
                      <span>
                        {t.stats.sessionsTaught} session{t.stats.sessionsTaught === 1 ? "" : "s"} taught
                      </span>
                    </div>
                  </Link>
                ))}
              </div>

              {data.totalPages > 1 && (
                <div className="flex justify-center items-center gap-3 mt-10">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setSearchParams({ ...(skill && { skill }), page: String(page - 1) })}
                    className="font-family-poppins text-sm px-4 py-2 rounded-lg border border-[#D0D0D0] bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:border-teal transition-colors"
                  >
                    Previous
                  </button>
                  <span className="font-family-poppins text-sm text-gray">
                    Page {page} of {data.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= data.totalPages}
                    onClick={() => setSearchParams({ ...(skill && { skill }), page: String(page + 1) })}
                    className="font-family-poppins text-sm px-4 py-2 rounded-lg border border-[#D0D0D0] bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:border-teal transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default TeachersPage;
