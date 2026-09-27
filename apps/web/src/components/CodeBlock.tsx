import { useMemo, useState } from "react";
import { LANGUAGE_LABEL, type Language } from "@tomas/shared";
import { highlight } from "../lib/highlight";

export function CodeBlock({ code, language, output }: { code: string; language: Language; output?: string }) {
  const html = useMemo(() => highlight(code, language), [code, language]);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="code-block">
      <div className="code-tag">
        <span>Ejemplo · {LANGUAGE_LABEL[language]}</span>
        <button type="button" className="btn ghost small" onClick={copy}>
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre>
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
      {output ? (
        <>
          <div className="code-tag">
            <span>Lo que muestra al correrlo</span>
          </div>
          <pre className="output">
            <code>{output}</code>
          </pre>
        </>
      ) : null}
    </div>
  );
}

/** Convierte `código` dentro de un texto en <code>. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? <code key={i}>{part.slice(1, -1)}</code> : part,
      )}
    </>
  );
}
