import * as Motion from "motion/react-m";
import { EASE, fadeUp, inView, stagger } from "../../lib/motion";

function HowItWorks() {
  const steps = [
    {
      number: 1,
      title: "Create Your Profile",
      description:
        // Was "set your availability" - there is no availability calendar in
        // the app; times are agreed per session in chat.
        "Sign up and list the skills you can teach and want to learn. Add your certifications so teachers and students know your background.",
      icon: "/assets/howitworks/1.svg",
    },
    {
      number: 2,
      title: "Get Matched by AI",
      description:
        // Matching genuinely runs both ways, which the old copy never said.
        "Matching works in both directions: students see teachers for the skills they want, and teachers see students looking for what they teach.",
      icon: "/assets/howitworks/2.svg",
    },
    {
      number: 3,
      title: "Start Learning",
      description:
        "Agree a time in chat, meet over video inside SkillBridge, and pay with credits. Credits move only once the session has taken place.",
      icon: "/assets/howitworks/3.svg",
    },
    {
      number: 4,
      title: "Rate & Grow",
      description:
        "Leave feedback after a session. Ratings build up on your profile for the skills you teach.",
      icon: "/assets/howitworks/4.svg",
    },
  ];

  return (
    <section className="py-20 bg-light-bg font-family-poppins">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center">
        {/* Header */}
        <Motion.div
          className="text-center mb-16"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          <h2 className="text-4xl md:text-5xl font-medium text-black mb-4">
            How SkillBridge Works
          </h2>
          <p className="text-lg font-medium text-black max-w-xl mx-auto">
            Four simple steps to start your skill exchange journey.
          </p>
        </Motion.div>

        {/* Timeline */}
        <Motion.div
          className="max-w-2xl"
          variants={stagger(0.12)}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          {steps.map((step, index) => (
            <Motion.div key={index} className="flex gap-6" variants={fadeUp}>
              {/* Left side - Icon with vertical line */}
              <div className="flex flex-col items-center">
                {/* Icon Circle */}
                <div className="w-16 h-16 bg-dark-blue rounded-full flex items-center justify-center shrink-0">
                  <img src={step.icon} alt="" aria-hidden="true" className="w-8 h-8" />
                </div>
                {/* Vertical Line - draws itself downward as the step arrives.
                    scaleY, not height: a height animation would re-run layout
                    for the whole column beside it on every frame. */}
                {index < steps.length - 1 && (
                  <Motion.div
                    className="w-0.5 flex-1 bg-dark-blue origin-top"
                    initial={{ scaleY: 0 }}
                    whileInView={{ scaleY: 1 }}
                    viewport={inView}
                    transition={{ duration: 0.45, delay: 0.1 + index * 0.12, ease: EASE }}
                  />
                )}
              </div>

              {/* Right side - Content */}
              <div className="flex-1 pb-16">
                <h3 className="text-xl font-medium text-black mb-2">
                  {step.number}. {step.title}
                </h3>
                <p className="text-black font-normal max-w-md leading-relaxed">
                  {step.description}
                </p>
              </div>
            </Motion.div>
          ))}
        </Motion.div>
      </div>
    </section>
  );
}

export default HowItWorks;
