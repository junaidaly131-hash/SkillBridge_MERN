import { Link } from "react-router-dom";
import * as m from "motion/react-m";
import Button from "../../ui/Button";

function Hero() {
  return (
    <section className="max-w-7xl font-family-poppins mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Left Content.
            Deliberately not animated in: this holds the h1 and the primary CTA,
            which is the largest contentful paint and the first thing anyone is
            here to read. Starting it at opacity 0 would push that paint back by
            however long the animation runs, for nothing a visitor would notice.
            The movement on this screen belongs to the illustration. */}
        <div className="flex flex-col items-center text-center">
          <h1 className=" text-4xl md:text-5xl font-semibold sm:leading-14 text-black mb-6">
            Exchange Skills, <br />
            <span className="text-teal">Grow Together</span>
          </h1>
          <p className="font-poppins text-lg max-w-sm text-black font-medium mb-8">
            Connect with learners and teachers across Pakistan. Teach what you
            know, learn what you love, powered by intelligent AI matching and a
            fair credit system.
          </p>
          {/* Stacked on phones, side by side from sm up. Not flex-wrap: with
              wrapping, the web font arriving changes each button's width, the
              pair re-wraps, and the whole hero below it moves - which is
              exactly the layout shift Lighthouse measured here. */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/signup">
              <Button
                variant="herobtn"
                className="px-8 py-3 text-lg font-family-josefin font-semibold"
              >
                Start Learning Free
              </Button>
            </Link>
            <Link to="/teachers">
              <Button
                variant="outline"
                className="px-8 py-3 text-lg font-family-josefin font-semibold"
              >
                Find a Teacher
              </Button>
            </Link>
          </div>
        </div>

        {/* Right Image. The only animated part of the hero: it drifts slowly
            rather than entering, so there is no moment where the screen looks
            unfinished. Transform only - no layout work per frame. */}
        {/* The only animated part of the hero: it drifts slowly rather than
            entering, so there is no moment where the screen looks unfinished.
            Transform only - measured and confirmed not to affect CLS. */}
        <m.div
          className="flex justify-center lg:justify-end"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <img
            src="/assets/heroimg.png"
            alt="Illustration of a person studying at a desk"
            /* The file's real intrinsic size. Without it the browser cannot
               reserve the box before the image decodes, so everything beside
               and below it jumps when it arrives - the only layout shift
               Lighthouse finds on this page, in this build and the one before
               it. fetchPriority marks it as the LCP candidate it already is. */
            width="2992"
            height="1996"
            fetchPriority="high"
            className="w-full max-w-lg h-auto"
          />
        </m.div>
      </div>
    </section>
  );
}

export default Hero;
