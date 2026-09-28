import { createContext, Fragment, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { LANGUAGE_LABEL, type GlossaryItem, type Language } from "@tomas/shared";
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
      {/* Enfocable para poder desplazar con el teclado los ejemplos largos en pantallas pequeñas. */}
      <pre tabIndex={0}>
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
      {output ? (
        <>
          <div className="code-tag">
            <span>Lo que muestra al correrlo</span>
          </div>
          <pre className="output" tabIndex={0}>
            <code>{output}</code>
          </pre>
        </>
      ) : null}
    </div>
  );
}

// ---------- Texto con código y términos con tooltip ----------

const GlossaryContext = createContext<GlossaryItem[]>([]);

/** Hace que los términos del glosario del día muestren su definición al pasar el mouse dentro de este árbol. */
export function GlossaryProvider({ items, children }: { items: GlossaryItem[]; children: ReactNode }) {
  return <GlossaryContext.Provider value={items}>{children}</GlossaryContext.Provider>;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Un término con definición emergente (tooltip) accesible con teclado. */
export function Term({ term, definition, children }: { term: string; definition: string; children?: ReactNode }) {
  const id = useId();
  return (
    <span className="term" tabIndex={0} aria-describedby={id}>
      {children ?? term}
      <span role="tooltip" id={id} className="tooltip">
        <b>{term}</b> <RichText text={definition} terms={false} />
      </span>
    </span>
  );
}

/** Icono de ayuda con explicación emergente, para etiquetas del tablero y del panel. */
export function Help({ text, label = "Qué significa" }: { text: string; label?: string }) {
  const id = useId();
  return (
    <span className="term help" tabIndex={0} role="img" aria-label={label} aria-describedby={id}>
      ?
      <span role="tooltip" id={id} className="tooltip">
        {text}
      </span>
    </span>
  );
}

/** Marca en un texto plano los términos del glosario (solo la primera aparición de cada uno). */
function withTerms(text: string, glossary: GlossaryItem[], used: Set<string>, key: string): ReactNode {
  if (glossary.length === 0 || !text) return text;
  const pattern = new RegExp(`(?<![\\wáéíóúñ])(${glossary.map((g) => escapeRegExp(g.term)).join("|")})(?![\\wáéíóúñ])`, "iu");
  const parts: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest) {
    const m = pattern.exec(rest);
    if (!m || m.index === undefined) break;
    const found = glossary.find((g) => g.term.toLowerCase() === m[1].toLowerCase());
    const before = rest.slice(0, m.index);
    const after = rest.slice(m.index + m[1].length);
    if (before) parts.push(before);
    if (found && !used.has(found.term)) {
      used.add(found.term);
      parts.push(
        <Term key={`${key}-${n++}`} term={found.term} definition={found.definition}>
          {m[1]}
        </Term>,
      );
    } else {
      parts.push(m[1]);
    }
    rest = after;
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Convierte `código` dentro de un texto en <code> y marca los términos del glosario con tooltip. */
export function RichText({ text, terms = true }: { text: string; terms?: boolean }) {
  const glossary = useContext(GlossaryContext);
  const parts = text.split(/(`[^`]+`)/g);
  const used = new Set<string>();
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <code key={i}>{part.slice(1, -1)}</code>
        ) : terms ? (
          <Fragment key={i}>{withTerms(part, glossary, used, String(i))}</Fragment>
        ) : (
          part
        ),
      )}
    </>
  );
}
