import { useEffect } from "react";

const SITE_NAME = "SkillBridge";
const ORIGIN = "https://www.skill-bridge.me";
const DEFAULT_TITLE = `${SITE_NAME} | Skill Exchange & Online Learning in Pakistan`;
const DEFAULT_DESCRIPTION =
  "SkillBridge is a skill exchange platform in Pakistan. Find verified teachers for one-on-one online learning, or earn by teaching what you know.";

function setMeta(selector, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    const nameMatch = selector.match(/meta\[name="([^"]+)"\]/);
    const propertyMatch = selector.match(/meta\[property="([^"]+)"\]/);
    if (nameMatch) el.setAttribute("name", nameMatch[1]);
    if (propertyMatch) el.setAttribute("property", propertyMatch[1]);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/** Keep browser-navigation metadata in sync with the statically generated HTML. */
export function usePageMeta({
  title,
  description,
  path,
  robots = "index,follow",
  type = "website",
  enabled = true,
}) {
  useEffect(() => {
    if (!enabled) return undefined;

    const pageTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
    const pageDescription = description || DEFAULT_DESCRIPTION;
    const canonical = path ? `${ORIGIN}${path}` : null;

    document.title = pageTitle;
    setMeta('meta[name="description"]', pageDescription);
    setMeta('meta[name="robots"]', robots);
    setMeta('meta[property="og:type"]', type);
    setMeta('meta[property="og:title"]', pageTitle);
    setMeta('meta[property="og:description"]', pageDescription);
    setMeta('meta[property="og:url"]', canonical || ORIGIN);
    setMeta('meta[name="twitter:title"]', pageTitle);
    setMeta('meta[name="twitter:description"]', pageDescription);
    setCanonical(canonical);

    return () => {
      document.title = SITE_NAME;
      setMeta('meta[name="description"]', DEFAULT_DESCRIPTION);
      setMeta('meta[name="robots"]', "noindex,nofollow");
      setCanonical(null);
    };
  }, [title, description, path, robots, type, enabled]);
}

export default usePageMeta;
