import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

export const ORIGIN = "https://www.skill-bridge.me";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const DEFAULT_DESCRIPTION =
  "SkillBridge is a skill exchange platform in Pakistan. Find verified teachers for one-on-one online learning, or earn by teaching what you know.";

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const replaceMeta = (html, key, value, attribute = "name") => {
  const pattern = new RegExp(`<meta\\s+[^>]*${attribute}=["']${key}["'][^>]*>`, "i");
  const tag = `<meta ${attribute}="${key}" content="${escapeHtml(value)}" />`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `    ${tag}\n  </head>`);
};

export function renderDocument(shell, page) {
  const title = page.title || "SkillBridge";
  const description = page.description || DEFAULT_DESCRIPTION;
  const canonical = page.canonical ? `${ORIGIN}${page.canonical}` : null;
  const snapshot = `<!--seo:start-->${page.content || ""}<!--seo:end-->`;
  let html = shell.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  if (/<!--seo:start-->[\s\S]*<!--seo:end-->/i.test(html)) {
    html = html.replace(/<!--seo:start-->[\s\S]*<!--seo:end-->/i, snapshot);
  } else {
    html = html.replace(/<div id="root">\s*<\/div>/i, `<div id="root">${snapshot}</div>`);
  }

  html = replaceMeta(html, "description", description);
  html = replaceMeta(html, "robots", page.robots || "index,follow");
  html = replaceMeta(html, "og:type", page.type || "website", "property");
  html = replaceMeta(html, "og:title", title, "property");
  html = replaceMeta(html, "og:description", description, "property");
  html = replaceMeta(html, "og:url", canonical || ORIGIN, "property");
  html = replaceMeta(html, "twitter:title", title);
  html = replaceMeta(html, "twitter:description", description);

  const canonicalPattern = /<link\s+[^>]*rel=["']canonical["'][^>]*>/i;
  html = canonical
    ? html.replace(canonicalPattern, `<link rel="canonical" href="${canonical}" />`)
    : html.replace(canonicalPattern, "");

  return html;
}

const header = `
  <header class="px-6 py-5 bg-white">
    <nav aria-label="Main navigation" class="max-w-6xl mx-auto flex items-center gap-6">
      <a href="/" aria-label="SkillBridge home"><img src="/assets/logo.png" alt="SkillBridge" width="156" height="40" /></a>
      <a href="/teachers">Find a teacher</a><a href="/contact">Contact</a><a href="/signup">Create an account</a>
    </nav>
  </header>`;

const footer = `
  <footer class="px-6 py-8 bg-white">
    <nav aria-label="Footer navigation" class="max-w-6xl mx-auto flex flex-wrap gap-5">
      <a href="/teachers">Teachers</a><a href="/contact">Contact</a><a href="/terms">Terms</a>
      <a href="/privacy">Privacy</a><a href="/refund-policy">Refund policy</a>
    </nav>
  </footer>`;

const pageFrame = (body) => `${header}<main class="max-w-6xl mx-auto px-6 py-12">${body}</main>${footer}`;

export const fixedPages = {
  "/": {
    title: "SkillBridge | Skill Exchange & Online Learning in Pakistan",
    description: DEFAULT_DESCRIPTION,
    canonical: "/",
    content: pageFrame(`
      <section><h1>Teach what you know. Learn what you don&#39;t.</h1>
      <p>SkillBridge is a skill exchange platform in Pakistan for one-on-one online learning. Find verified teachers, book a session, or share a skill you already know.</p>
      <p><a href="/teachers">Browse verified teachers</a> <a href="/signup">Get started free</a></p></section>
      <section><h2>Learn directly from people with real skills</h2><p>Search by skill, review public teacher profiles, message a teacher and schedule a video session.</p></section>
      <section><h2>How SkillBridge works</h2><ol><li>Find a teacher for the skill you want to learn.</li><li>Agree on a time and book a session.</li><li>Meet one-on-one using SkillBridge video.</li></ol></section>
      <section><h2>Teach and learn across Pakistan</h2><p>Teachers can offer their knowledge while students get focused help suited to their goals.</p><p><a href="/contact">Contact SkillBridge</a> if you have questions.</p></section>`),
  },
  "/contact": {
    title: "Contact Us | SkillBridge",
    description: "Get in touch with the SkillBridge team. Send us a message and we'll reply by email, usually within one working day.",
    canonical: "/contact",
    content: pageFrame(`<h1>Contact SkillBridge</h1><p>Questions about SkillBridge, partnerships, or your account? Send us a message and our team will reply by email.</p><h2>General enquiries</h2><p><a href="mailto:info@skill-bridge.me">info@skill-bridge.me</a></p><h2>Account support</h2><p><a href="mailto:support@skill-bridge.me">support@skill-bridge.me</a></p><p>Registered in Hunza, Pakistan.</p>`),
  },
  "/terms": {
    title: "Terms & Conditions | SkillBridge",
    description: "The terms that govern using SkillBridge: accounts, credits, sessions, payouts and acceptable use.",
    canonical: "/terms",
    content: pageFrame(`<h1>Terms &amp; Conditions</h1><p>Last updated: October 7, 2026</p><h2>About SkillBridge</h2><p>SkillBridge is a peer-to-peer skill exchange platform connecting students and teachers for tutoring sessions.</p><h2>Accounts and eligibility</h2><p>Users may register as a student, teacher, or both. Teachers must meet the stated age and verification requirements.</p><h2>Credits and sessions</h2><p>Credits are used within SkillBridge for sessions. They move only after a session is completed.</p><h2>User conduct</h2><p>Users must not misuse the service, misrepresent qualifications, harass others, or circumvent the platform.</p><p>Read the complete terms in this page after it loads, or <a href="mailto:support@skill-bridge.me">contact support</a>.</p>`),
  },
  "/privacy": {
    title: "Privacy Policy | SkillBridge",
    description: "What SkillBridge collects, why it is collected, how long it is kept, and the choices you have over your data.",
    canonical: "/privacy",
    content: pageFrame(`<h1>Privacy Policy</h1><h2>Information we collect</h2><p>SkillBridge collects account, profile, verification, transaction and service-usage information needed to operate the platform.</p><h2>How information is used</h2><p>Information is used to provide matching, payments, sessions, communications, safety and support. SkillBridge does not sell personal information.</p><h2>Your choices</h2><p>You may request access, correction or deletion by emailing <a href="mailto:support@skill-bridge.me">support@skill-bridge.me</a>.</p><h2>Service providers</h2><p>Payment, storage, video, email and AI providers process limited data required for their services.</p>`),
  },
  "/refund-policy": {
    title: "Refund & Cancellation Policy | SkillBridge",
    description: "When SkillBridge credit purchases and sessions can be refunded or cancelled, and how long a review takes.",
    canonical: "/refund-policy",
    content: pageFrame(`<h1>Refund &amp; Cancellation Policy</h1><h2>Credit purchases</h2><p>Unused credit purchases may be eligible for review. Used credits are generally non-refundable.</p><h2>Session cancellations</h2><p>Credits are deducted only after a completed session, so cancelling a scheduled session before it takes place does not create a charge.</p><h2>Disputes</h2><p>A session issue can be reported during the review window shown in the application.</p><h2>Contact</h2><p>Email <a href="mailto:support@skill-bridge.me">support@skill-bridge.me</a> with refund questions.</p>`),
  },
};

const teacherCards = (teachers) => teachers.map((teacher) => {
  const skills = (teacher.skills || []).slice(0, 4).map((skill) => escapeHtml(skill.name)).join(", ");
  return `<article><h2><a href="/teachers/${encodeURIComponent(teacher.id)}">${escapeHtml(teacher.name)}</a></h2>${teacher.location ? `<p>${escapeHtml(teacher.location)}</p>` : ""}<p>${skills || "SkillBridge teacher"}</p>${teacher.bio ? `<p>${escapeHtml(teacher.bio)}</p>` : ""}</article>`;
}).join("\n");

export function directoryPage(teachers, skills) {
  const skillLinks = skills.map((skill) => `<li><a href="/learn/${encodeURIComponent(skill.slug)}">Learn ${escapeHtml(skill.name)}</a> (${Number(skill.teacherCount) || 0})</li>`).join("");
  return {
    title: "Find Verified Teachers in Pakistan | SkillBridge",
    description: "Browse verified teachers on SkillBridge. See their skills, ratings and experience, then book a one-on-one session.",
    canonical: "/teachers",
    content: pageFrame(`<h1>Find a verified teacher</h1><p>Browse teachers by skill, experience and location. Public profiles link to real teaching skills and session information.</p>${skills.length ? `<h2>Browse by skill</h2><ul>${skillLinks}</ul>` : ""}<section aria-label="Teacher directory">${teachers.length ? teacherCards(teachers) : "<h2>Teacher profiles</h2><p>The live directory will load when the page opens. Please try again shortly if it is temporarily unavailable.</p>"}</section>`),
  };
}

export function teacherPage(teacher) {
  const skills = (teacher.skills || []).map((skill) => escapeHtml(skill.name));
  const skillText = skills.join(", ");
  const description = `${teacher.name} teaches ${skillText || "on SkillBridge"}${teacher.location ? ` from ${teacher.location}` : ""}. Verified teacher. Book a one-on-one session.`;
  return {
    title: `${teacher.name}${skillText ? ` — ${skillText}` : ""} | SkillBridge`,
    description,
    canonical: `/teachers/${teacher.id}`,
    type: "profile",
    content: pageFrame(`<nav><a href="/teachers">Teachers</a> / ${escapeHtml(teacher.name)}</nav><article><h1>${escapeHtml(teacher.name)}</h1><p>Verified SkillBridge teacher${teacher.location ? ` in ${escapeHtml(teacher.location)}` : ""}.</p>${teacher.bio ? `<p>${escapeHtml(teacher.bio)}</p>` : ""}<h2>Skills ${escapeHtml(teacher.name.split(" ")[0])} teaches</h2><ul>${skills.map((skill) => `<li>${skill}</li>`).join("")}</ul>${teacher.languages?.length ? `<h2>Languages</h2><p>${teacher.languages.map(escapeHtml).join(", ")}</p>` : ""}<p><a href="/signup">Create an account to book a session</a></p></article>`),
  };
}

export function skillPage(data) {
  const { skill, teachers } = data;
  return {
    title: `Learn ${skill.name} Online in Pakistan | SkillBridge`,
    description: `Book one-on-one ${skill.name} sessions with identity-verified teachers in Pakistan. Your first session is free.`,
    canonical: `/learn/${skill.slug}`,
    content: pageFrame(`<nav><a href="/teachers">Teachers</a> / ${escapeHtml(skill.name)}</nav><h1>Learn ${escapeHtml(skill.name)} online in Pakistan</h1><p>Choose a verified teacher for a focused one-on-one session, agree on a time and meet online through SkillBridge.</p><h2>${escapeHtml(skill.name)} teachers</h2>${teacherCards(teachers || [])}`),
  };
}

export function sitemapXml(entries) {
  const urls = entries.map(({ path, lastmod }) => `  <url>\n    <loc>${ORIGIN}${escapeHtml(path)}</loc>${lastmod ? `\n    <lastmod>${escapeHtml(lastmod.slice(0, 10))}</lastmod>` : ""}\n  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.json();
}

async function loadPublicInventory(apiBase) {
  if (!apiBase) throw new Error("VITE_API_BASE_URL is not configured");
  const first = await fetchJson(`${apiBase}/public/teachers?limit=24&page=1`);
  const pages = [first];
  for (let page = 2; page <= first.totalPages; page += 1) {
    pages.push(await fetchJson(`${apiBase}/public/teachers?limit=24&page=${page}`));
  }
  const teachers = pages.flatMap((page) => page.teachers || []);
  const skillList = await fetchJson(`${apiBase}/public/skills`);
  const skillResults = await Promise.allSettled(
    (skillList.skills || []).map((skill) => fetchJson(`${apiBase}/public/skills/${encodeURIComponent(skill.slug)}`)),
  );
  return { teachers, skills: skillList.skills || [], skillPages: skillResults.filter((result) => result.status === "fulfilled").map((result) => result.value) };
}

async function writeRoute(path, html) {
  const target = path === "/" ? join(DIST, "index.html") : join(DIST, `${path.slice(1)}.html`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html);
}

export async function generate() {
  const shell = await readFile(join(DIST, "index.html"), "utf8");
  for (const [path, page] of Object.entries(fixedPages)) {
    await writeRoute(path, renderDocument(shell, page));
  }

  const env = loadEnv(process.env.NODE_ENV || "production", ROOT, "");
  const apiBase = (env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  let inventory = { teachers: [], skills: [], skillPages: [] };
  try {
    inventory = await loadPublicInventory(apiBase);
  } catch (error) {
    console.warn(`[seo] Public API unavailable during build; generating core pages only (${error.message}).`);
  }

  await writeRoute("/teachers", renderDocument(shell, directoryPage(inventory.teachers, inventory.skills)));
  for (const teacher of inventory.teachers) {
    await writeRoute(`/teachers/${teacher.id}`, renderDocument(shell, teacherPage(teacher)));
  }
  for (const data of inventory.skillPages) {
    await writeRoute(`/learn/${data.skill.slug}`, renderDocument(shell, skillPage(data)));
  }

  const appShell = renderDocument(shell, { title: "SkillBridge", robots: "noindex,nofollow", content: '<main><h1>SkillBridge</h1><p>Loading the secure application…</p></main>' });
  await writeFile(join(DIST, "app.html"), appShell);
  const notFound = renderDocument(shell, { title: "Page Not Found | SkillBridge", robots: "noindex,follow", content: pageFrame('<h1>Page not found</h1><p>The page you requested does not exist or may have moved.</p><p><a href="/">Return home</a> or <a href="/teachers">browse teachers</a>.</p>') });
  await writeFile(join(DIST, "404.html"), notFound);

  const sitemapEntries = ["/", "/teachers", "/contact", "/terms", "/privacy", "/refund-policy"].map((path) => ({ path }));
  sitemapEntries.push(...inventory.teachers.map((teacher) => ({ path: `/teachers/${teacher.id}`, lastmod: teacher.updatedAt })));
  sitemapEntries.push(...inventory.skillPages.map((data) => ({ path: `/learn/${data.skill.slug}`, lastmod: data.teachers?.map((teacher) => teacher.updatedAt).filter(Boolean).sort().at(-1) })));
  await writeFile(join(DIST, "sitemap.xml"), sitemapXml(sitemapEntries));

  console.log(`[seo] Generated ${sitemapEntries.length} indexable pages (${inventory.teachers.length} teachers, ${inventory.skillPages.length} skills).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generate();
}
