import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { safeTutorHref } from "../src/components/AITutor/markdownSafety.js";

test("AI Tutor links allow web/mail protocols and reject executable URLs", () => {
  assert.equal(safeTutorHref("https://example.com/lesson"), "https://example.com/lesson");
  assert.equal(safeTutorHref("mailto:teacher@example.com"), "mailto:teacher@example.com");
  assert.equal(safeTutorHref("javascript:alert(1)"), null);
  assert.equal(safeTutorHref("data:text/html,<script>alert(1)</script>"), null);
  assert.equal(safeTutorHref("/internal-path"), null);
});

test("react-markdown leaves raw HTML inert when no raw HTML plugin is enabled", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ReactMarkdown, null, '<img src=x onerror="alert(1)">')
  );
  assert.equal(markup.includes("<img"), false);
  assert.equal(markup.includes("&lt;img"), true);
  assert.equal(markup.includes('src="x"'), false);
});
