import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, Loader2, X } from "lucide-react";
import apiClient from "../api/client";

// Storage hands these files back as `application/octet-stream` with a
// `Content-Disposition: attachment` header and no extension on the filename,
// so a browser downloads them instead of showing them. Reading the leading
// bytes tells us what the file really is, and the blob we build from it gets
// the correct media type - which is what makes it render inline.
const MAGIC = [
  { type: "pdf", mime: "application/pdf", ext: "pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { type: "image", mime: "image/png", ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: "image", mime: "image/jpeg", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image", mime: "image/gif", ext: "gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { type: "image", mime: "image/bmp", ext: "bmp", bytes: [0x42, 0x4d] }, // BM
  {
    type: "doc",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: "docx",
    bytes: [0x50, 0x4b, 0x03, 0x04], // zip container
  },
];

// WEBP and SVG need more than a fixed prefix, so they're checked separately.
function sniffExtended(buffer) {
  const head = new Uint8Array(buffer.slice(0, 64));
  const ascii = String.fromCharCode(...head);

  // RIFF....WEBP
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") {
    return { type: "image", mime: "image/webp", ext: "webp" };
  }
  // SVG is text and may open with an XML declaration or a comment.
  if (/^\s*(<\?xml|<!--|<svg)/i.test(ascii) && ascii.toLowerCase().includes("<svg")) {
    return { type: "image", mime: "image/svg+xml", ext: "svg" };
  }
  return null;
}

function sniff(buffer) {
  const head = new Uint8Array(buffer.slice(0, 8));
  const byPrefix = MAGIC.find((sig) => sig.bytes.every((b, i) => head[i] === b));
  if (byPrefix) return byPrefix;
  return sniffExtended(buffer);
}

function detectType(url = "", fileName = "", mimeType = "") {
  const name = (fileName || url).toLowerCase();
  if (mimeType.includes("pdf") || name.includes(".pdf")) return "pdf";
  if (mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/.test(name)) return "image";
  if (mimeType.includes("word") || /\.(docx?)(\?|$)/.test(name)) return "doc";
  return "other";
}

/**
 * In-app preview for an uploaded file.
 *
 * Every file is fetched rather than pointed at directly, for two reasons that
 * each break a plain <iframe src>: our own endpoints need a JWT an iframe
 * can't send, and the public storage URLs arrive with headers that force a
 * download. Fetching gives us bytes we can re-wrap in a correctly typed blob.
 *
 * PDFs then render in the browser's own viewer instead of a JS PDF library,
 * which brings zoom, search, print and page navigation for free.
 */
function DocumentViewer({ isOpen, onClose, url, title, fileName, mimeType = "", authenticated = false }) {
  // Written only from the async callbacks below, so nothing is set
  // synchronously inside the effect; `loading` is derived instead of stored.
  const [file, setFile] = useState({ url: null, error: null, sig: null });

  useEffect(() => {
    if (!isOpen || !url) return;

    let revoked = null;
    let cancelled = false;

    const load = authenticated
      ? apiClient.get(url, { responseType: "arraybuffer" }).then((r) => r.data)
      : fetch(url).then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.arrayBuffer();
        });

    load
      .then((buffer) => {
        if (cancelled) return;
        const sig = sniff(buffer);
        revoked = URL.createObjectURL(
          new Blob([buffer], { type: sig?.mime || mimeType || "application/octet-stream" })
        );
        setFile({ url: revoked, error: null, sig });
      })
      .catch(() => {
        if (!cancelled) setFile({ url: null, error: "Couldn't load this file.", sig: null });
      });

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
      setFile({ url: null, error: null, sig: null });
    };
  }, [isOpen, url, authenticated, mimeType]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const src = file.url;
  const error = file.error;
  const loading = !file.url && !file.error;
  // Sniffed type wins - the filename often has no extension at all.
  const type = file.sig?.type || detectType(url, fileName, mimeType);

  // Stored names frequently lack an extension, which is why a download used to
  // land as an unopenable file. Append the real one when it's missing.
  const downloadName = (() => {
    const base = fileName || title || "document";
    const ext = file.sig?.ext;
    if (!ext || base.toLowerCase().endsWith(`.${ext}`)) return base;
    return `${base.replace(/\.[^./\\]*$/, "")}.${ext}`;
  })();

  const renderBody = () => {
    if (loading) {
      return (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-teal" />
        </div>
      );
    }

    if (error || !src) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
          <FileText className="text-gray" size={32} />
          <p className="font-family-poppins text-sm text-gray">{error || "No file attached."}</p>
        </div>
      );
    }

    if (type === "image") {
      return (
        <div className="h-full overflow-auto p-4">
          <img src={src} alt={title || "Document"} className="max-w-full mx-auto rounded" />
        </div>
      );
    }

    // Word files can't be shown inline: Office's embed service has to fetch the
    // file itself and a local blob is invisible to it.
    if (type === "doc") {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
          <FileText className="text-gray" size={32} />
          <p className="font-family-poppins text-sm text-gray">
            Word documents can't be previewed here. Download it to review.
          </p>
          <a
            href={src}
            download={downloadName}
            className="inline-flex items-center gap-2 font-family-poppins text-sm font-semibold text-white bg-teal-button px-4 py-2 rounded-lg hover:bg-teal-button-hover"
          >
            <Download size={16} />
            Download
          </a>
        </div>
      );
    }

    return <iframe title={title || "document-preview"} src={src} className="w-full h-full border-0" />;
  };

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* A definite height, not just max-height: the body below is flex-1
          (basis 0) and the iframe inside is h-full, so without a resolved
          height here the whole panel collapses to a sliver. */}
      <div className="relative w-full max-w-5xl h-[90vh] bg-white rounded-xl shadow-xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#E5E5E5]">
          <div className="min-w-0">
            <p className="font-family-poppins font-semibold text-black truncate">
              {title || "Document"}
            </p>
            {fileName && (
              <p className="font-family-poppins text-xs text-gray truncate">{fileName}</p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {src && (
              <>
                <a
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 font-family-poppins text-sm text-gray hover:text-teal transition-colors px-2 py-1"
                  title="Open in a new tab"
                >
                  <ExternalLink size={16} />
                  <span className="hidden sm:inline">Open</span>
                </a>
                <a
                  href={src}
                  download={downloadName}
                  className="flex items-center gap-1.5 font-family-poppins text-sm text-gray hover:text-teal transition-colors px-2 py-1"
                  title={`Download as ${downloadName}`}
                >
                  <Download size={16} />
                  <span className="hidden sm:inline">Download</span>
                </a>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray hover:text-black hover:bg-gray-100 rounded-lg transition-all"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* min-h-0 lets this shrink inside the flex column instead of being
            pushed past the container by the iframe's own height. */}
        <div className="flex-1 min-h-0 bg-gray-50">{renderBody()}</div>
      </div>
    </div>
  );
}

export default DocumentViewer;
