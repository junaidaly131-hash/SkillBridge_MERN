// Skill names are typed freely, so the same skill arrives spelled several ways:
// "React", "react", "ReactJS" and "React Development" are one thing to a
// student and four things to a database. Left alone they become four public
// pages competing with each other for the same search, each with a fraction of
// the teachers - which is worse than one good page.
//
// This maps what people type onto one canonical name. Keep it in step with
// frontend/src/utils/skillSuggestions.js, which is what the skill input offers.

const CANONICAL = [
  'React Development', 'JavaScript', 'TypeScript', 'Node.js', 'Python',
  'Machine Learning', 'Data Science', 'UI/UX Design', 'Graphic Design',
  'Digital Marketing', 'Social Media Marketing', 'Content Writing', 'SEO',
  'AWS', 'DevOps', 'Docker', 'Kubernetes', 'MongoDB', 'PostgreSQL', 'Java',
  'C++', 'Go', 'Rust', 'Swift', 'iOS Development', 'Android Development',
  'Flutter', 'React Native', 'Vue.js', 'Angular', 'PHP', 'Laravel', 'Django',
  'FastAPI', 'GraphQL', 'REST API', 'Blockchain', 'Web3', 'Solidity',
  'Cybersecurity', 'Network Security', 'Cloud Computing', 'Azure',
  'Google Cloud', 'Linux', 'Git', 'Agile', 'Scrum', 'Project Management',
  'Product Management', 'WordPress',
];

// Lowercased and whitespace-collapsed, but punctuation kept: stripping it would
// turn "C++" into "c" and collide it with anything else starting that way.
const normalise = (name) => String(name).trim().toLowerCase().replace(/\s+/g, ' ');

// Only exact matches, never substrings. "React Native" and "React Development"
// are genuinely different skills, and a substring rule would merge them.
const ALIASES = {
  react: 'React Development',
  reactjs: 'React Development',
  'react.js': 'React Development',
  'react developer': 'React Development',
  node: 'Node.js',
  nodejs: 'Node.js',
  'node js': 'Node.js',
  js: 'JavaScript',
  ts: 'TypeScript',
  'ui/ux': 'UI/UX Design',
  'ui ux': 'UI/UX Design',
  uiux: 'UI/UX Design',
  'ux/ui': 'UI/UX Design',
  'ux design': 'UI/UX Design',
  'ui design': 'UI/UX Design',
  ml: 'Machine Learning',
  gcp: 'Google Cloud',
  k8s: 'Kubernetes',
  postgres: 'PostgreSQL',
  mongo: 'MongoDB',
  'vue': 'Vue.js',
  'vuejs': 'Vue.js',
  'word press': 'WordPress',
  'wordpress development': 'WordPress',
};

const BY_NORMALISED = new Map(CANONICAL.map((name) => [normalise(name), name]));

/**
 * The one name a skill should be shown and ranked under.
 *
 * Falls back to the user's own spelling when nothing matches, so a legitimate
 * skill outside the vocabulary still gets a page rather than being dropped.
 */
export function canonicalSkillName(raw) {
  const key = normalise(raw);
  if (!key) return null;
  return ALIASES[key] || BY_NORMALISED.get(key) || String(raw).trim();
}

/** "Graphic Design" -> "graphic-design" */
export const toSkillSlug = (name) =>
  String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export { CANONICAL, normalise, ALIASES as SKILL_ALIASES };
