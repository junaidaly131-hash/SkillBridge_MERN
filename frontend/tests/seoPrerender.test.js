import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { directoryPage, fixedPages, renderDocument, sitemapXml, teacherPage } from "../scripts/prerender.mjs";

const shell = `<!doctype html><html><head>
<title>Default</title>
<meta name="description" content="Default description" />
<link rel="canonical" href="https://www.skill-bridge.me/" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://www.skill-bridge.me/" />
<meta property="og:title" content="Default" />
<meta property="og:description" content="Default" />
<meta name="twitter:title" content="Default" />
<meta name="twitter:description" content="Default" />
</head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>`;

test("public page rendering puts content and unique metadata in initial HTML", () => {
  const html = renderDocument(shell, fixedPages["/contact"]);
  assert.match(html, /<h1>Contact SkillBridge<\/h1>/);
  assert.match(html, /<title>Contact Us \| SkillBridge<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/www\.skill-bridge\.me\/contact"/);
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.match(html, /name="robots" content="index,follow"/);
  assert.match(html, /property="og:url" content="https:\/\/www\.skill-bridge\.me\/contact"/);
});

test("teacher rendering uses public profile data and accurate modification dates", () => {
  const teacher = {
    id: "507f1f77bcf86cd799439011",
    name: "Ayesha Khan",
    bio: "Design teacher",
    location: "Lahore",
    languages: ["English", "Urdu"],
    skills: [{ name: "Graphic Design" }],
    updatedAt: "2026-11-03T12:00:00.000Z",
  };
  const html = renderDocument(shell, teacherPage(teacher));
  assert.match(html, /<h1>Ayesha Khan<\/h1>/);
  assert.match(html, /Graphic Design/);
  assert.match(html, /og:type" content="profile"/);
  assert.match(html, /\/teachers\/507f1f77bcf86cd799439011/);

  const xml = sitemapXml([{ path: `/teachers/${teacher.id}`, lastmod: teacher.updatedAt }]);
  assert.match(xml, /<lastmod>2026-11-03<\/lastmod>/);
  assert.doesNotMatch(xml, /changefreq|priority/);
});

test("directory includes crawlable teacher and eligible skill links", () => {
  const page = directoryPage(
    [{ id: "abc", name: "Teacher One", skills: [{ name: "React" }], stats: {} }],
    [{ slug: "react-development", name: "React Development", teacherCount: 1 }],
  );
  const html = renderDocument(shell, page);
  assert.match(html, /href="\/teachers\/abc"/);
  assert.match(html, /href="\/learn\/react-development"/);
  assert.match(html, /canonical" href="https:\/\/www\.skill-bridge\.me\/teachers"/);
});

test("private SPA routing is explicit and leaves unknown routes to the 404", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.cleanUrls, true);
  assert.ok(config.rewrites.some((route) => route.source === "/dashboard" && route.destination === "/app.html"));
  assert.ok(!config.rewrites.some((route) => route.source === "/(.*)" || route.source === "/:path*"));
  assert.deepEqual(config.redirects[0].has, [{ type: "host", value: "skill-bridge.me" }]);
  assert.equal(config.redirects[0].destination, "https://www.skill-bridge.me/:path*");
});

test("noindex documents do not retain a homepage canonical", () => {
  const html = renderDocument(shell, { title: "Page Not Found | SkillBridge", robots: "noindex,follow", content: "<h1>Page not found</h1>" });
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.match(html, /name="robots" content="noindex,follow"/);
});

test("shared head and prerendered pages retain one non-conflicting favicon set", async () => {
  const sharedHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const html = renderDocument(sharedHtml, fixedPages["/contact"]);
  assert.equal((html.match(/href="\/favicon-96x96\.png"/g) || []).length, 1);
  assert.equal((html.match(/href="\/favicon\.ico"/g) || []).length, 1);
  assert.equal((html.match(/href="\/apple-touch-icon\.png"/g) || []).length, 1);
  assert.match(html, /rel="icon" type="image\/png" sizes="96x96"/);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180"/);
  assert.doesNotMatch(html, /rel="icon"[^>]+logo\.svg/);
});
