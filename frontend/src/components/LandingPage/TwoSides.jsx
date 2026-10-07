import { Link } from "react-router-dom";
import * as m from "motion/react-m";
import { BookOpen, GraduationCap } from "lucide-react";
import { fadeUp, inView, stagger } from "../../lib/motion";

// Both halves describe the same account. Nobody picks a side when signing up -
// a profile carries skillsTeaching and skillsLearning at the same time, and the
// recommendation service matches on both.
const sides = [
  {
    icon: BookOpen,
    title: "Learn",
    steps: [
      "Find a teacher for the skill you want",
      "Agree a time and book the session",
      "Pay with credits, after the session happens",
    ],
    cta: { label: "Find a teacher", to: "/teachers" },
  },
  {
    icon: GraduationCap,
    title: "Teach",
    steps: [
      "List a skill you already have",
      "Students find you through matching and search",
      "Earn credits, and cash them out once verified",
    ],
    cta: { label: "Start teaching", to: "/signup" },
  },
];

function TwoSides() {
  return (
    <section className="py-20 bg-white font-family-poppins">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <m.div
          className="text-center mb-12"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          <h2 className="text-3xl md:text-4xl font-medium text-black mb-3">
            Two sides of SkillBridge
          </h2>
          <p className="text-lg text-gray max-w-xl mx-auto">
            One account does both. Most people here teach one thing and learn another.
          </p>
        </m.div>

        <m.div
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
          variants={stagger(0.12)}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          {sides.map((side) => {
            const Icon = side.icon;
            return (
              <m.div
                key={side.title}
                variants={fadeUp}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2 }}
                className="bg-light-bg border border-teal/20 rounded-xl p-8 flex flex-col"
              >
                <div className="w-12 h-12 rounded-lg bg-light-teal flex items-center justify-center mb-5">
                  <Icon className="text-teal" size={22} />
                </div>

                <h3 className="text-2xl font-medium text-dark-blue mb-4">{side.title}</h3>

                <ol className="space-y-3 mb-7 flex-1">
                  {side.steps.map((step, i) => (
                    <li key={step} className="flex gap-3 text-sm text-gray leading-relaxed">
                      <span className="w-6 h-6 rounded-full bg-light-teal text-teal text-xs font-semibold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>

                <Link
                  to={side.cta.to}
                  className="text-sm font-semibold text-white bg-teal-button px-6 py-2.5 rounded-lg hover:bg-teal-button-hover transition-all self-start"
                >
                  {side.cta.label}
                </Link>
              </m.div>
            );
          })}
        </m.div>
      </div>
    </section>
  );
}

export default TwoSides;
