import { Link } from 'react-router-dom';
import * as Motion from 'motion/react-m';
import Button from '../../ui/Button.jsx';
import { ArrowRight } from 'lucide-react';
import { fadeUp, inView } from '../../lib/motion';

function CTA() {
  return (
    <section className="bg-gradient-to-b from-white via-light-teal to-white py-20 font-family-poppins">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Motion.div
          className="bg-gradient-blue flex flex-col items-center rounded-2xl px-8 py-16 text-center"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          <h2 className="mb-4 text-4xl font-medium text-white md:text-5xl">
            Ready to Start Your Journey?
          </h2>
          <p className="mb-8 max-w-2xl text-lg font-medium text-white/90">
            Join SkillBridge and find someone to learn from, or start teaching what you already know.
          </p>
          <Link to="/signup">
            <Button
              variant="primary"
              className="px-8 py-3 text-lg font-medium flex items-center gap-2"
            >
              Create Free Account
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
        </Motion.div>
      </div>
    </section>
  );
}

export default CTA;
