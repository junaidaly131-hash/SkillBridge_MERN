export function safeTutorHref(href) {
  return /^(https?:|mailto:)/i.test(href || "") ? href : null;
}
