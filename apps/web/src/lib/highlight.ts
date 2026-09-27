import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";

hljs.registerLanguage("python", python);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("bash", bash);

/** Devuelve HTML con resaltado de sintaxis. highlight.js escapa el texto de entrada. */
export function highlight(code: string, language: string): string {
  if (!hljs.getLanguage(language)) {
    return code.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  }
  return hljs.highlight(code, { language, ignoreIllegals: true }).value;
}
