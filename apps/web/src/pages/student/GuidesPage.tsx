import { useEffect, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import type { Guide } from "@tomas/shared";
import guidesData from "@tomas/shared/guides.json";
import { CodeBlock, RichText } from "../../components/CodeBlock";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/ui";

const guides = guidesData as Guide[];

/** Convierte el cuerpo de una sección (párrafos, listas con "- " o "1. ") en HTML sencillo. */
export function GuideBody({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/);
  const out: ReactNode[] = [];
  blocks.forEach((block, b) => {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) return;
    if (lines.every((l) => /^\s*[-•] /.test(l))) {
      out.push(
        <ul key={b}>
          {lines.map((l, i) => (
            <li key={i}>
              <Linkify text={l.replace(/^\s*[-•] /, "")} />
            </li>
          ))}
        </ul>,
      );
    } else if (lines.every((l) => /^\s*\d+[.)] /.test(l))) {
      out.push(
        <ol key={b}>
          {lines.map((l, i) => (
            <li key={i}>
              <Linkify text={l.replace(/^\s*\d+[.)] /, "")} />
            </li>
          ))}
        </ol>,
      );
    } else if (lines.length > 1 && lines.some((l) => /^\s{2,}|^\S.*:\s*$/.test(l)) && block.includes("Traceback")) {
      out.push(
        <pre key={b} className="snippet" tabIndex={0}>
          <code>{block}</code>
        </pre>,
      );
    } else {
      out.push(
        <p key={b}>
          {lines.map((l, i) => (
            <span key={i}>
              {i > 0 && <br />}
              <Linkify text={l} />
            </span>
          ))}
        </p>,
      );
    }
  });
  return <>{out}</>;
}

/** Texto con `código` y enlaces https://… convertidos en <a>. */
function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer noopener">
            {p}
          </a>
        ) : (
          <RichText key={i} text={p} />
        ),
      )}
    </>
  );
}

export function GuidesPage() {
  return (
    <div className="page narrow">
      <PageHeader
        eyebrow="Ayuda"
        title="Guías"
        lede="Tutoriales para consultar cuando los necesites: instalar, usar la terminal, entender errores, depurar, Git y más."
      />
      <div className="guide-grid">
        {guides.map((g) => (
          <Link key={g.slug} to={`/guias/${g.slug}`} className="card guide-card">
            <h3>{g.title}</h3>
            <p>{g.summary}</p>
            <span className="muted small">
              <Icon name="today" size={14} /> {g.minutes} min · {g.sections.length} secciones
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function GuidePage() {
  const { slug = "" } = useParams();
  const guide = guides.find((g) => g.slug === slug);
  const index = guides.findIndex((g) => g.slug === slug);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [slug]);

  if (!guide) {
    return (
      <div className="page narrow">
        <div className="empty">
          <h3>Esa guía no existe</h3>
          <Link className="btn" to="/guias">
            Ver todas las guías
          </Link>
        </div>
      </div>
    );
  }
  const prev = guides[index - 1];
  const next = guides[index + 1];
  return (
    <div className="page narrow">
      <PageHeader
        eyebrow={
          <Link to="/guias" style={{ textDecoration: "none" }}>
            ← Guías
          </Link>
        }
        title={guide.title}
        lede={`${guide.summary} · ${guide.minutes} min`}
      />
      <nav className="guide-toc" aria-label="Contenido de la guía">
        <ol>
          {guide.sections.map((s, i) => (
            <li key={i}>
              <a href={`#seccion-${i + 1}`}>{s.heading}</a>
            </li>
          ))}
        </ol>
      </nav>
      <article className="guide">
        {guide.sections.map((s, i) => (
          <section key={i} id={`seccion-${i + 1}`} className="guide-section">
            <h2>
              <span className="step">{i + 1}</span>
              {s.heading}
            </h2>
            <GuideBody text={s.body} />
            {s.code && <CodeBlock code={s.code} language={s.language} />}
          </section>
        ))}
      </article>
      <nav className="day-nav" aria-label="Otras guías">
        {prev ? (
          <Link className="btn secondary" to={`/guias/${prev.slug}`}>
            <Icon name="left" size={18} /> {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link className="btn secondary" to={`/guias/${next.slug}`}>
            {next.title} <Icon name="right" size={18} />
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
