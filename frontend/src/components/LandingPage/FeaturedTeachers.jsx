import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as m from "motion/react-m";
import { ArrowRight } from "lucide-react";
import TeacherCard from "../Teachers/TeacherCard";
import { fadeUp, inView, stagger } from "../../lib/motion";

// With one teacher this is a profile, not a selection. Below two it does not
// appear at all rather than looking like an empty shelf.
const MIN_TEACHERS = 2;
const SHOWN = 4;

function FeaturedTeachers() {
  const [teachers, setTeachers] = useState(null);

  useEffect(() => {
    let cancelled = false;
    import("../../api/client").then(({ default: apiClient }) =>
      apiClient
        .get(`/public/teachers?limit=${SHOWN}`)
        .then((res) => {
          if (!cancelled) setTeachers(res.data.teachers || []);
        })
        .catch(() => {
          // Hide silently - a failed fetch should not put an error on the
          // marketing page.
          if (!cancelled) setTeachers([]);
        })
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!teachers || teachers.length < MIN_TEACHERS) return null;

  return (
    <section className="py-20 bg-light-bg font-family-poppins">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <m.div
          className="text-center mb-10"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          <h2 className="text-3xl md:text-4xl font-medium text-black mb-3">
            Teachers on SkillBridge
          </h2>
          <p className="text-lg text-gray">
            Every one of them has had their identity and credentials checked.
          </p>
        </m.div>

        <m.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10"
          variants={stagger()}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          {teachers.slice(0, SHOWN).map((t) => (
            <m.div key={t.id} variants={fadeUp}>
              {/* The same card the directory uses, so the two can never drift
                  into looking like different products. Only fields the public
                  whitelist already exposes. */}
              <TeacherCard teacher={t} />
            </m.div>
          ))}
        </m.div>

        <div className="text-center">
          <Link
            to="/teachers"
            className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-teal-button px-6 py-2.5 rounded-lg hover:bg-teal-button-hover transition-all"
          >
            Browse all teachers
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}

export default FeaturedTeachers;
