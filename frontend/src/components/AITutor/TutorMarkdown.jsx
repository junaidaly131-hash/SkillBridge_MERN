import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeTutorHref } from "./markdownSafety";

function SafeLink({ href, children }) {
  const safeHref = safeTutorHref(href);
  if (!safeHref) return <span>{children}</span>;
  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-teal underline underline-offset-2 break-words"
    >
      {children}
    </a>
  );
}

/**
 * Raw HTML stays disabled (there is deliberately no rehype-raw plugin), and
 * links are restricted to ordinary web/mail protocols.
 */
function TutorMarkdown({ children }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: SafeLink,
        p: ({ children: content }) => <p className="mb-3 last:mb-0 leading-7">{content}</p>,
        ul: ({ children: content }) => (
          <ul className="list-disc pl-5 mb-3 space-y-1">{content}</ul>
        ),
        ol: ({ children: content }) => (
          <ol className="list-decimal pl-5 mb-3 space-y-1">{content}</ol>
        ),
        h1: ({ children: content }) => <h1 className="text-xl font-bold mb-3">{content}</h1>,
        h2: ({ children: content }) => <h2 className="text-lg font-bold mb-3">{content}</h2>,
        h3: ({ children: content }) => <h3 className="font-bold mb-2">{content}</h3>,
        blockquote: ({ children: content }) => (
          <blockquote className="border-l-4 border-teal/40 pl-3 text-gray mb-3">
            {content}
          </blockquote>
        ),
        pre: ({ children: content }) => (
          <pre className="max-w-full overflow-x-auto rounded-xl bg-[#111827] p-4 text-sm text-gray-100 mb-3 custom-scrollbar">
            {content}
          </pre>
        ),
        code: ({ className, children: content }) => {
          const isBlock = Boolean(className) || String(content).includes("\n");
          return (
            <code
              className={
                isBlock
                  ? `${className || ""} font-mono whitespace-pre`
                  : "font-mono text-[0.9em] bg-black/5 px-1.5 py-0.5 rounded break-words"
              }
            >
              {content}
            </code>
          );
        },
        table: ({ children: content }) => (
          <div className="max-w-full overflow-x-auto mb-3 custom-scrollbar">
            <table className="min-w-max border-collapse text-sm">{content}</table>
          </div>
        ),
        th: ({ children: content }) => (
          <th className="border border-[#D0D0D0] bg-light-gray px-3 py-2 text-left">
            {content}
          </th>
        ),
        td: ({ children: content }) => (
          <td className="border border-[#D0D0D0] px-3 py-2 align-top">{content}</td>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

export default TutorMarkdown;
