import { useEffect } from "react";

const SITE_NAME = "SkillBridge";
const ORIGIN = "https://www.skill-bridge.me";

// Defaults live in index.html. When a page unmounts its values are restored, so
// navigating away from, say, /terms doesn't leave its title on the next screen.
const DEFAULT_TITLE = `${SITE_NAME} — Teach what you know. Learn what you don't.`;
const DEFAULT_DESCRIPTION =
  "SkillBridge is a skill-exchange marketplace in Pakistan. Book one-on-one sessions with verified teachers, or earn by teaching what you already know.";

function setMeta(selector, attr, value) {
  let el = document.head.querySelector(selector);
  if (!el) return; // index.html owns these tags; don't invent new ones at runtime
  el.setAttribute(attr, value);
}

function setCanonical(href) {
  const el = document.head.querySelector('link[rel="canonical"]');
  if (el) el.setAttribute("href", href);
}

/**
 * Per-page title, description and canonical.
 *
 * This is for Google, which executes JavaScript. It does NOT reach social
 * preview crawlers - WhatsApp, LinkedIn and friends read the served HTML and
 * never run React, so they always see the defaults in index.html. That is
 * deliberate: one good brand preview on every shared link beats six that only
 * appear if the crawler did something it doesn't do.
 *
 * Only worth calling on pages a signed-out visitor can reach. Everything behind
 * authentication is disallowed in robots.txt and has nothing to rank.
 *
 * @param {object}  meta
 * @param {string}  meta.title        Page title, without the site name suffix.
 * @param {string} [meta.description] Falls back to the site description.
 * @param {string} [meta.path]        Path for the canonical URL, e.g. "/terms".
 */
export function usePageMeta({ title, description, path }) {
  useEffect(() => {
    const previousTitle = document.title;

    document.title = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;

    const desc = description || DEFAULT_DESCRIPTION;
    setMeta('meta[name="description"]', "content", desc);

    if (path) setCanonical(`${ORIGIN}${path}`);

    return () => {
      document.title = previousTitle;
      setMeta('meta[name="description"]', "content", DEFAULT_DESCRIPTION);
      setCanonical(`${ORIGIN}/`);
    };
  }, [title, description, path]);
}

export default usePageMeta;
