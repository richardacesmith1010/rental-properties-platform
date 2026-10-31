import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

export function legalDocumentText(element: ReactElement): string {
  const entities: Record<string, string> = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&#39;": "'"
  };
  // Protect link targets from tag stripping, including encoded angle brackets.
  const links: string[] = [];
  const markup = renderToStaticMarkup(element).replace(
    /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
    (_, href: string, text: string) => {
      links.push(href);
      return `${text} LEGAL_LINK_${links.length - 1}_TARGET`;
    }
  );
  return markup.replace(/<li\b[^>]*>/g, "- ")
    .replace(/<\/(?:p|h[1-3]|li)>/g, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;|&lt;|&gt;|&quot;|&#x27;|&#39;/g, (entity) => entities[entity])
    .replace(/LEGAL_LINK_(\d+)_TARGET/g, (_, index: string) => `<${links[Number(index)]}>`)
    .split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + "\n";
}
