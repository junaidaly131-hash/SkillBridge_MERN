import { Link } from 'react-router-dom';
import * as Motion from 'motion/react-m';
import Button from '../../ui/Button.jsx';
import { ArrowRight } from 'lucide-react';
import { fadeUp, inView } from '../../lib/motion';

function CTA() {
  return (
    <section className="py-20 bg-white font-family-poppins">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Motion.div
          className="bg-gradient-blue rounded-2xl px-8 py-16 flex flex-col items-center text-center"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          <h2 className="text-4xl md:text-5xl font-medium text-white mb-4">
            Ready to Start Your Journey?
          </h2>
          <p className="text-lg font-medium text-white/90 max-w-2xl mb-8">
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
