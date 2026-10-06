import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Award, BadgeCheck, Globe, Loader2, MapPin, Star } from "lucide-react";
import Header from "../components/LandingPage/Header";
import Footer from "../components/LandingPage/Footer";
import apiClient from "../api/client";
import { usePageMeta } from "../hooks/usePageMeta";

// A signed-out, read-only view of one verified teacher. Booking still requires
// an account - this exists so a visitor (and a search engine) can see who is on
// the platform before being asked to sign up for anything.
function TeacherProfilePage() {
  const { id } = useParams();

  const [teacher, setTeacher] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Built from the teacher's own skills, so each profile targets something
  // different rather than every page repeating the site description.
  const skillList = teacher?.skills?.map((s) => s.name).join(", ");
  usePageMeta({
    title: teacher ? `${teacher.name}${skillList ? ` — ${skillList}` : ""}` : "Teacher",
    description: teacher
      ? `${teacher.name} teaches ${skillList || "on SkillBridge"}${teacher.location ? ` from ${teacher.location}` : ""}. Verified teacher. Book a one-on-one session.`
      : undefined,
    path: `/teachers/${id}`,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    apiClient
      .get(`/public/teachers/${id}`)
      .then((res) => {
        if (!cancelled) setTeacher(res.data.teacher);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-light-bg flex flex-col">
      <Header />

      <main className="grow">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-teal" />
            </div>
          ) : notFound || !teacher ? (
            <div className="text-center py-20">
              <p className="font-family-poppins text-xl font-semibold text-black mb-2">
                This profile isn't available
              </p>
              <p className="font-family-poppins text-sm text-gray mb-6 max-w-md mx-auto">
                It may have been removed, or the teacher hasn't completed verification yet.
              </p>
              <Link
                to="/teachers"
                className="inline-block font-family-poppins text-sm font-semibold text-white bg-teal px-6 py-2.5 rounded-lg hover:opacity-90 transition-all"
              >
                Browse all teachers
              </Link>
            </div>
          ) : (
            <>
              <nav className="mb-6 font-family-poppins text-sm text-gray">
                <Link to="/teachers" className="hover:text-teal transition-colors">
                  Teachers
                </Link>
                <span className="mx-2">/</span>
                <span className="text-black">{teacher.name}</span>
              </nav>

              <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm mb-6">
                <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                  {teacher.avatar ? (
                    <img
                      src={teacher.avatar}
                      alt={teacher.name}
                      className="w-24 h-24 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-light-teal flex items-center justify-center shrink-0 font-family-poppins text-3xl font-semibold text-teal">
                      {teacher.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h1 className="font-family-poppins text-2xl font-bold text-black flex items-center gap-2 mb-1">
                      {teacher.name}
                      <BadgeCheck className="text-teal shrink-0" size={20} />
                    </h1>

                    <div className="flex flex-wrap items-center gap-4 font-family-poppins text-sm text-gray mb-3">
                      {teacher.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={14} /> {teacher.location}
                        </span>
                      )}
                      {teacher.languages?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Globe size={14} /> {teacher.languages.join(", ")}
                        </span>
                      )}
                    </div>

                    {teacher.bio && (
                      <p className="font-family-poppins text-sm text-black leading-relaxed">
                        {teacher.bio}
                      </p>
                    )}
                  </div>

                  <Link
                    to="/signup"
                    className="font-family-poppins text-sm font-semibold text-white bg-teal px-6 py-2.5 rounded-lg hover:opacity-90 transition-all shrink-0 text-center"
                  >
                    Book a session
                  </Link>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-[#EEE]">
                  <div>
                    <p className="font-family-poppins text-2xl font-bold text-black">
                      {teacher.stats.sessionsTaught}
                    </p>
                    <p className="font-family-poppins text-xs text-gray">Sessions taught</p>
                  </div>
                  <div>
                    <p className="font-family-poppins text-2xl font-bold text-black flex items-center gap-1">
                      {teacher.stats.avgRating > 0 ? (
                        <>
                          <Star className="text-yellow-500 fill-yellow-500" size={18} />
                          {teacher.stats.avgRating.toFixed(1)}
                        </>
                      ) : (
                        "—"
                      )}
                    </p>
                    <p className="font-family-poppins text-xs text-gray">Average rating</p>
                  </div>
                  <div>
                    <p className="font-family-poppins text-2xl font-bold text-black">
                      {new Date(teacher.memberSince).getFullYear()}
                    </p>
                    <p className="font-family-poppins text-xs text-gray">Member since</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
                <h2 className="font-family-poppins text-lg font-semibold text-black mb-4">
                  Skills {teacher.name.split(" ")[0]} teaches
                </h2>
                <div className="space-y-3">
                  {teacher.skills.map((s) => (
                    <div
                      key={s.name}
                      className="flex items-center justify-between p-3 bg-light-teal rounded-lg"
                    >
                      <span className="font-family-poppins text-sm font-medium text-black">
                        {s.name}
                      </span>
                      <span className="font-family-poppins text-xs text-gray">
                        {s.sessions} session{s.sessions === 1 ? "" : "s"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {teacher.certifications?.length > 0 && (
                <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
                  <h2 className="font-family-poppins text-lg font-semibold text-black mb-4">
                    Certifications
                  </h2>
                  <div className="space-y-3">
                    {teacher.certifications.map((c, i) => (
                      <div key={`${c.name}-${i}`} className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-light-teal flex items-center justify-center shrink-0">
                          <Award className="text-teal" size={17} />
                        </div>
                        <div>
                          <p className="font-family-poppins text-sm font-medium text-black">
                            {c.name}
                          </p>
                          {(c.issuer || c.year) && (
                            <p className="font-family-poppins text-xs text-gray">
                              {[c.issuer, c.year].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl p-6 shadow-sm text-center">
                <p className="font-family-poppins text-base font-semibold text-black mb-1">
                  Want to learn from {teacher.name.split(" ")[0]}?
                </p>
                <p className="font-family-poppins text-sm text-gray mb-5">
                  Create a free account to message them and book a session.
                </p>
                <Link
                  to="/signup"
                  className="inline-block font-family-poppins text-sm font-semibold text-white bg-teal px-6 py-2.5 rounded-lg hover:opacity-90 transition-all"
                >
                  Get started free
                </Link>
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default TeacherProfilePage;
