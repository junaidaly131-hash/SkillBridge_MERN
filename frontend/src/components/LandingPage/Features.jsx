import * as m from "motion/react-m";
import { inView, scaleIn, stagger } from "../../lib/motion";

function Features() {
  const features = [
    {
      title: "AI-Powered Matching",
      icon: "/assets/features/1.svg",
    },
    {
      title: "Credit-Based System",
      icon: "/assets/features/2.svg",
    },
    {
      title: "Secure & Verified",
      icon: "/assets/features/3.svg",
    },
    {
      // Was "Global Community". Every user, every teacher and the payment
      // provider are in Pakistan, and the rest of the site says so - a claim
      // the product doesn't meet doesn't belong on the front page.
      title: "Learners Across Pakistan",
      icon: "/assets/features/4.svg",
    },
    {
      title: "Smart Scheduling",
      icon: "/assets/features/5.svg",
    },
    {
      title: "Integrated Chat",
      icon: "/assets/features/6.svg",
    },
  ];

  return (
    <section className="py-20 bg-white font-family-poppins">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <m.div
          className="text-center mb-12"
          variants={scaleIn}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          <h2 className="text-4xl md:text-5xl font-medium text-black mb-4">
            Everything You Need to Learn & Teach
          </h2>
          <p className="text-lg  font-medium text-black max-w-2xl mx-auto">
            A complete platform designed to make skill exchange seamless, secure, and rewarding.
          </p>
        </m.div>

        {/* Feature Cards - stagger in, then lift on hover. */}
        <m.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          variants={stagger()}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          {features.map((feature, index) => (
            <m.div
              key={index}
              variants={scaleIn}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.2 }}
              className="bg-light-bg py-12  rounded-lg border border-teal/20 flex flex-col items-center text-center"
            >
              {/* Icon */}
              <div className="w-16 h-16 mb-4 flex items-center justify-center">
                <img src={feature.icon} alt="" aria-hidden="true" className="w-full h-full" />
              </div>

              <h3 className=" text-xl font-medium text-dark-blue mb-2">
                {feature.title}
              </h3>
            </m.div>
          ))}
        </m.div>
      </div>
    </section>
  );
}

export default Features;
