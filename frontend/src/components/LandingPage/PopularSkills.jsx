import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as Motion from "motion/react-m";
import { fadeUp, inView, stagger } from "../../lib/motion";

// Fewer than this and the section does not appear at all. Three chips is the
// point below which a "popular skills" heading is simply untrue, and padding it
// out with placeholders would be inventing inventory we do not have.
const MIN_SKILLS = 3;

function PopularSkills() {
  const [skills, setSkills] = useState(null); // null = still deciding whether to exist

  useEffect(() => {
    let cancelled = false;
    // The directory already exposes exactly this, verified-teachers-only and
    // ordered by teacher count - no new endpoint needed.
    import("../../api/client").then(({ default: apiClient }) =>
      apiClient
        .get("/public/skills")
        .then((res) => {
          if (!cancelled) setSkills(res.data.skills || []);
        })
        .catch(() => {
          // Hide rather than show an error: this is a nice-to-have band on a
          // marketing page, not something worth explaining to a visitor.
          if (!cancelled) setSkills([]);
        })
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!skills || skills.length < MIN_SKILLS) return null;

  return (
    <section className="py-20 bg-white font-family-poppins">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <Motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={inView}>
          <h2 className="text-3xl md:text-4xl font-medium text-black mb-3">Popular skills</h2>
          <p className="text-lg text-gray mb-10">
            Skills people are already teaching on SkillBridge.
          </p>
        </Motion.div>

        <Motion.div
          className="flex flex-wrap justify-center gap-3"
          variants={stagger(0.05)}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          {skills.slice(0, 12).map((s) => (
            <Motion.div key={s.slug} variants={fadeUp} whileHover={{ y: -3 }} transition={{ duration: 0.2 }}>
              <Link
                to={`/learn/${s.slug}`}
                className="inline-flex items-center gap-2 bg-light-bg border border-teal/20 rounded-full px-5 py-2.5 hover:border-teal transition-colors"
              >
                <span className="text-sm font-medium text-black">{s.name}</span>
                <span className="text-xs text-gray">
                  {s.teacherCount} {s.teacherCount === 1 ? "teacher" : "teachers"}
                </span>
              </Link>
            </Motion.div>
          ))}
        </Motion.div>
      </div>
    </section>
  );
}

export default PopularSkills;
