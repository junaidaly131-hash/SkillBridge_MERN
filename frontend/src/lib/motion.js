// One place for every animation value on the site, so sections animate at the
// same speed and with the same curve instead of each one being tuned by hand.
//
// Only `opacity` and `transform` are animated anywhere. Animating width, height
// or position forces the browser to re-run layout on every frame, which is what
// makes an otherwise smooth page stutter on a mid-range phone.
//
// Nothing here needs to be wrapped in a reduced-motion check: the app is inside
// <MotionConfig reducedMotion="user">, which already drops transform animations
// to nothing and keeps opacity for anyone who asked their OS for less motion.

export const DURATION = 0.5;
// Decelerating ease - fast to start, settles gently. Matches the feel of the
// CSS transitions already used for hovers.
export const EASE = [0.22, 1, 0.36, 1];

const transition = { duration: DURATION, ease: EASE };

/** The default: content rises slightly as it fades in. */
export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition },
};

/** For things that shouldn't move at all, only appear. */
export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition },
};

/** Cards and tiles: a touch of scale so a grid feels like it settles into place. */
export const scaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition },
};

/**
 * Parent of a list. Children run one after another rather than all at once.
 * Kept short - a long stagger on six cards reads as the page being slow.
 */
export const stagger = (gap = 0.08) => ({
  hidden: {},
  visible: { transition: { staggerChildren: gap } },
});

/**
 * Standard scroll trigger. `once` so a section doesn't replay every time it
 * scrolls past, and the negative margin starts it slightly before the element
 * reaches the viewport edge so it has finished by the time it is properly in
 * view.
 */
export const inView = { once: true, margin: '-80px' };

/** Hover/press feedback shared by cards and buttons. */
export const liftOnHover = {
  whileHover: { y: -4, transition: { duration: 0.2, ease: EASE } },
  whileTap: { scale: 0.98 },
};
