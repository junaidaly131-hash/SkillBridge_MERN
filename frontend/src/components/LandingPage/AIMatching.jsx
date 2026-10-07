import * as m from "motion/react-m";
import { MessageSquare, Sparkles } from "lucide-react";
import { EASE, fadeUp, inView, stagger } from "../../lib/motion";

// Illustrative only, and labelled as such on the page.
//
// No names: a card carrying an invented name reads as a real user, and the
// product has not launched with enough teachers to show real ones here. The
// skill and the score are enough to show what the matching produces.
const EXAMPLE_MATCHES = [
  { initial: "G", skill: "Graphic Design", teaches: "Teaches design", match: 94 },
  { initial: "P", skill: "Python", teaches: "Teaches programming", match: 88 },
  { initial: "C", skill: "Cybersecurity", teaches: "Teaches security", match: 81 },
];

function AIMatching() {
  return (
    // A soft wash rather than a flat panel, so this section reads as its own
    // thing between two light-bg sections. Built only from tokens the app
    // already has - light-teal into white - not a new colour, and not the dark
    // bg-gradient-blue, which would need white text and make this a different
    // section entirely.
    <section className="py-20 bg-gradient-to-b from-white via-light-teal to-white font-family-poppins">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Explanation */}
          <m.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={inView}>
            <h2 className="text-3xl md:text-4xl font-medium text-black mb-4">
              Matching that works both ways
            </h2>
            <p className="text-lg text-gray leading-relaxed mb-4">
              SkillBridge compares what you want to learn against what other people teach, and
              scores how closely the two line up.
            </p>
            <p className="text-lg text-gray leading-relaxed">
              It runs in both directions. Students see teachers for the skills they are after, and
              teachers see students who are looking for exactly what they teach.
            </p>
          </m.div>

          {/* The cards are capped rather than filling the column. Stretched to
              full width they left a wide empty gap between the skill and the
              button, which read as a layout fault rather than a design. */}
          <div className="w-full max-w-md lg:ml-auto">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="text-teal" size={16} />
              <span className="text-sm text-gray">AI recommended matches</span>
              {/* Said plainly, beside the cards, not buried in small print. */}
              <span className="text-xs font-semibold bg-light-gray text-gray px-2 py-0.5 rounded-full">
                Example
              </span>
            </div>

            <m.div
              className="flex flex-col gap-3"
              variants={stagger(0.1)}
              initial="hidden"
              whileInView="visible"
              viewport={inView}
            >
              {EXAMPLE_MATCHES.map((item, i) => (
                <m.div
                  key={item.skill}
                  variants={fadeUp}
                  whileHover={{ y: -3 }}
                  transition={{ duration: 0.2 }}
                  className="bg-white border border-teal/10 rounded-xl p-4 shadow-sm"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 rounded-full bg-light-teal flex items-center justify-center shrink-0 font-semibold text-teal">
                      {item.initial}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-black truncate">{item.skill}</p>
                      <p className="text-xs text-gray truncate">{item.teaches}</p>
                    </div>

                    {/* Styled like the real control but inert - this is a
                        picture of the product, not a working button. */}
                    <span
                      aria-hidden="true"
                      className="flex items-center gap-1.5 text-xs font-semibold text-teal bg-light-teal px-3 py-1.5 rounded-lg shrink-0"
                    >
                      <MessageSquare size={13} />
                      Message
                    </span>
                  </div>

                  {/* The score as a bar as well as a number. It fills the space
                      the stretched layout used to waste, and makes the three
                      cards comparable at a glance.

                      The width is plain CSS, not an animated value. Driving it
                      from whileInView left the bars empty wherever the trigger
                      never fired - below the fold on a phone, and for anyone
                      with reduced motion - and an empty progress bar reads as
                      broken rather than as un-animated. The fade is the
                      enhancement; the fill is always correct. */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-light-teal overflow-hidden">
                      <m.div
                        className="h-full bg-teal rounded-full"
                        style={{ width: `${item.match}%` }}
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={inView}
                        transition={{ duration: 0.4, delay: 0.15 + i * 0.1, ease: EASE }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-teal shrink-0 tabular-nums">
                      {item.match}% match
                    </span>
                  </div>
                </m.div>
              ))}
            </m.div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default AIMatching;
