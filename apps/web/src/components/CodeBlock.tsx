import { createContext, Fragment, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { LANGUAGE_LABEL, type GlossaryItem, type Language } from "@tomas/shared";
import { highlight } from "../lib/highlight";
import { cleanEngine, StoppedError } from "../sql/engine";
import type { RunResponse } from "../sql/protocol";
import { RunOutput, runSummary } from "../sql/RunOutput";
import { Icon } from "./Icon";

/** Filas que se muestran al ejecutar un ejemplo (el laboratorio muestra hasta 1 000). */
const EXAMPLE_ROWS = 50;

export function CodeBlock({
  code,
  language,
  output,
  runnable = true,
  label = "Ejemplo",
}: {
  code: string;
  language: Language;
  output?: string;
  /** Los bloques SQL se pueden ejecutar contra una copia limpia de la Tienda. */
  runnable?: boolean;
  label?: string;
}) {
  const html = useMemo(() => highlight(code, language), [code, language]);
  const [copied, setCopied] = useState(false);
  const [run, setRun] = useState<RunResponse | null>(null);
  const [running, setRunning] = useState(false);
  const canRun = runnable && language === "sql" && code.trim().length > 0;

  const execute = async () => {
    setRunning(true);
    try {
      setRun(await cleanEngine().run({ mode: "clean", sql: code }));
    } catch (err) {
      if (!(err instanceof StoppedError)) setRun({ ok: false, error: err instanceof Error ? err.message : String(err), statement: 1, phase: "sql", ms: 0 });
    } finally {
      setRunning(false);
    }
  };

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
        <span>
          {label} · {LANGUAGE_LABEL[language]}
        </span>
        <span className="code-actions">
          {canRun && (
            <>
              {running ? (
                <button type="button" className="btn ghost small" onClick={() => cleanEngine().stop()}>
                  <Icon name="stop" size={14} /> Detener
                </button>
              ) : (
                <button type="button" className="btn ghost small" onClick={() => void execute()}>
                  <Icon name="play" size={14} /> Ejecutar
                </button>
              )}
              <Link className="btn ghost small" to="/laboratorio" state={{ sql: code }}>
                <Icon name="flask" size={14} /> Abrir en el laboratorio
              </Link>
            </>
          )}
          <button type="button" className="btn ghost small" onClick={copy}>
            {copied ? "Copiado" : "Copiar"}
          </button>
        </span>
      </div>
      {/* Enfocable para poder desplazar con el teclado los ejemplos largos en pantallas pequeñas. */}
      <pre tabIndex={0}>
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
      {run ? (
        <div className="code-run" aria-live="polite">
          <div className="code-tag">
            <span>Resultado · {runSummary(run)}</span>
            <button type="button" className="btn ghost small" onClick={() => setRun(null)}>
              Cerrar
            </button>
          </div>
          <div className="code-run-body">
            <RunOutput res={run} label="Resultado del ejemplo" compact max={EXAMPLE_ROWS} />
          </div>
        </div>
      ) : output ? (
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

/** Un párrafo: `código`, **negrita** y términos del glosario. */
function inline(text: string, glossary: GlossaryItem[], used: Set<string>, terms: boolean, key: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+?\*\*)/g);
  return parts.map((part, i) => {
    const k = `${key}-${i}`;
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) return <code key={k}>{part.slice(1, -1)}</code>;
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      return <strong key={k}>{inline(part.slice(2, -2), glossary, used, terms, k)}</strong>;
    }
    return terms ? <Fragment key={k}>{withTerms(part, glossary, used, k)}</Fragment> : <Fragment key={k}>{part}</Fragment>;
  });
}

/**
 * Texto del contenido: `código`, **negrita**, términos del glosario con tooltip y párrafos
 * separados por una línea en blanco.
 *
 * - `block={false}` (por defecto) sirve dentro de <p>, <li>, <label>…: los párrafos se separan
 *   con <span class="rt-p"> (no se anida <p> dentro de <p>).
 * - `block` devuelve un <p> por párrafo: úsalo dentro de un <div>.
 */
export function RichText({ text, terms = true, block = false }: { text: string; terms?: boolean; block?: boolean }) {
  const glossary = useContext(GlossaryContext);
  const used = new Set<string>();
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (block) {
    return (
      <>
        {paragraphs.map((p, i) => (
          <p key={i}>{inline(p, glossary, used, terms, String(i))}</p>
        ))}
      </>
    );
  }
  if (paragraphs.length <= 1) return <>{inline(paragraphs[0] ?? "", glossary, used, terms, "0")}</>;
  return (
    <>
      {paragraphs.map((p, i) => (
        <span key={i} className="rt-p">
          {inline(p, glossary, used, terms, String(i))}
        </span>
      ))}
    </>
  );
}
