import { ArrowUpRight, Code2, MapPin } from "lucide-react";
import * as Motion from "motion/react-m";
import { fadeUp, inView } from "../../lib/motion";

const PORTFOLIO_URL = "https://junaiddev.skill-bridge.me/";

function MeetFounder() {
  return (
    <section className="bg-white py-20 font-family-poppins" aria-labelledby="meet-founder-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Motion.div
          className="grid overflow-hidden rounded-3xl border border-teal/20 bg-[linear-gradient(120deg,#EDF7F6_0%,#FFFFFF_52%,#EEF2F8_100%)] shadow-[0_18px_50px_rgba(23,33,61,0.09)] lg:grid-cols-[0.78fr_1.22fr]"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          <div className="relative min-h-80 overflow-hidden lg:min-h-[430px]">
            <img
              src={`${PORTFOLIO_URL}myprofile.jpg`}
              alt="Junaid Ali, the developer behind SkillBridge"
              className="absolute inset-0 h-full w-full object-cover object-top"
              loading="lazy"
              decoding="async"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-dark-blue/45 via-transparent to-transparent"
              aria-hidden="true"
            />
            <div className="absolute bottom-5 left-5 rounded-full border border-white/30 bg-dark-blue/75 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md">
              Product-minded engineering
            </div>
          </div>

          <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14">
            <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-teal shadow-sm">
              <Code2 size={15} aria-hidden="true" />
              The person behind SkillBridge
            </span>

            <h2 id="meet-founder-title" className="text-3xl font-semibold text-dark-blue sm:text-4xl">
              Meet Junaid Ali
            </h2>

            <p className="mt-5 max-w-2xl text-base leading-7 text-gray sm:text-lg sm:leading-8">
              SkillBridge is designed and built by Junaid, a full-stack developer focused on
              turning complex product ideas into clear, useful web experiences—from interface and
              APIs to production launch.
            </p>

            <div className="mt-6 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full border border-teal/15 bg-white/75 px-3 py-1.5 text-dark-blue">
                Full-stack development
              </span>
              <span className="rounded-full border border-teal/15 bg-white/75 px-3 py-1.5 text-dark-blue">
                Product builder
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal/15 bg-white/75 px-3 py-1.5 text-dark-blue">
                <MapPin size={14} aria-hidden="true" /> Islamabad / Remote
              </span>
            </div>

            <a
              href={PORTFOLIO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex w-fit items-center gap-2 rounded-lg bg-teal-button px-6 py-3 font-semibold text-white transition-colors hover:bg-teal-button-hover"
              aria-label="Visit Junaid Ali's portfolio (opens in a new tab)"
            >
              Visit Junaid&apos;s portfolio
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </div>
        </Motion.div>
      </div>
    </section>
  );
}

export default MeetFounder;
