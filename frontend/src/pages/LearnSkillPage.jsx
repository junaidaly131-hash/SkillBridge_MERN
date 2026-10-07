import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { CalendarCheck, Loader2, MessageSquare, ShieldCheck, Video } from "lucide-react";
import Header from "../components/LandingPage/Header";
import Footer from "../components/LandingPage/Footer";
import TeacherCard from "../components/Teachers/TeacherCard";
import apiClient from "../api/client";
import { usePageMeta } from "../hooks/usePageMeta";

// One page per skill somebody actually teaches, e.g. /learn/graphic-design.
//
// These exist because nobody searches for a marketplace by name - they search
// for the thing they want to learn. The landing page cannot rank for twenty
// different intents at once, so each skill gets its own page, its own title and
// its own teachers.
//
// A skill with no verified teacher has no page at all (the API 404s). An empty
// page would rank for nothing and drag on everything else, so the set of pages
// grows as teachers are verified rather than being written out by hand.
function LearnSkillPage() {
  const { slug } = useParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const skillName = data?.skill?.name;

  usePageMeta({
    title: skillName ? `Learn ${skillName} Online in Pakistan` : "Learn a skill",
    description: skillName
      ? `Book one-on-one ${skillName} sessions with identity-verified teachers in Pakistan. Your first session is free.`
      : undefined,
    path: `/learn/${slug}`,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    apiClient
      .get(`/public/skills/${slug}`)
      .then((res) => {
        if (!cancelled) setData(res.data);
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
  }, [slug]);

  const steps = [
    {
      icon: MessageSquare,
      title: "Message a teacher",
      body: "Pick someone whose experience fits what you're trying to learn, and tell them what you're stuck on.",
    },
    {
      icon: CalendarCheck,
      title: "Agree a time",
      body: "Sessions are booked for a slot that suits you both. Nothing is charged when you book.",
    },
    {
      icon: Video,
      title: "Meet one-on-one",
      body: "You meet over video inside SkillBridge. Credits only move once the session has actually taken place.",
    },
  ];

  // The API resolves aliases, so /learn/react answers with the React
  // Development skill. Move to its own URL rather than serving the same page
  // under two addresses, which would have them competing in search.
  if (!loading && data?.skill && data.skill.slug !== slug) {
    return <Navigate to={`/learn/${data.skill.slug}`} replace />;
  }

  return (
    <div className="min-h-screen bg-light-bg flex flex-col">
      <Header />

      <main className="grow">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-teal" />
            </div>
          ) : notFound || !data ? (
            <div className="text-center py-20">
              <p className="font-family-poppins text-xl font-semibold text-black mb-2">
                Nobody teaches this yet
              </p>
              <p className="font-family-poppins text-sm text-gray mb-6 max-w-md mx-auto">
                No verified teacher has listed this skill so far. Browse everyone on SkillBridge, or
                sign up and teach it yourself.
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
                <span className="text-black">{data.skill.name}</span>
              </nav>

              <div className="text-center mb-10">
                <h1 className="font-family-poppins text-3xl sm:text-4xl font-bold text-black mb-3">
                  Learn {data.skill.name} online in Pakistan
                </h1>
                <p className="font-family-poppins text-base text-gray max-w-2xl mx-auto leading-relaxed">
                  Book a one-on-one {data.skill.name} session with someone who already works with it.
                  Every teacher on SkillBridge has had their identity and credentials checked before
                  they can take a session, and your first one is free.
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 mb-10 font-family-poppins text-sm text-teal bg-light-teal rounded-lg py-3 px-4 max-w-lg mx-auto">
                <ShieldCheck size={17} className="shrink-0" />
                <span>
                  {data.skill.teacherCount} verified {data.skill.teacherCount === 1 ? "teacher" : "teachers"}{" "}
                  for {data.skill.name}
                </span>
              </div>

              <h2 className="font-family-poppins text-xl font-semibold text-black mb-4">
                {data.skill.name} teachers
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-14">
                {data.teachers.map((t) => (
                  <TeacherCard key={t.id} teacher={t} />
                ))}
              </div>

              <h2 className="font-family-poppins text-xl font-semibold text-black mb-5">
                How a {data.skill.name} session works
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-14">
                {steps.map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.title} className="bg-white rounded-xl p-6 shadow-sm">
                      <div className="w-10 h-10 rounded-lg bg-light-teal flex items-center justify-center mb-4">
                        <Icon className="text-teal" size={19} />
                      </div>
                      <p className="font-family-poppins text-base font-semibold text-black mb-1">
                        {s.title}
                      </p>
                      <p className="font-family-poppins text-sm text-gray leading-relaxed">{s.body}</p>
                    </div>
                  );
                })}
              </div>

              <div className="bg-white rounded-xl p-8 shadow-sm text-center">
                <p className="font-family-poppins text-xl font-semibold text-black mb-2">
                  Ready to start {data.skill.name}?
                </p>
                <p className="font-family-poppins text-sm text-gray mb-6 max-w-md mx-auto">
                  Creating an account is free, and so is your first session. You only need credits
                  once you book a second one.
                </p>
                <Link
                  to="/signup"
                  className="inline-block font-family-poppins text-sm font-semibold text-white bg-teal px-7 py-3 rounded-lg hover:opacity-90 transition-all"
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

export default LearnSkillPage;
