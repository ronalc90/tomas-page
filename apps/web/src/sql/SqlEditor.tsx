import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { sql, SQLite, type SQLNamespace } from "@codemirror/lang-sql";
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as placeholderExt,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import type { SchemaTable } from "./protocol";

/** Tema con las variables de color de la aplicación: funciona igual en claro y en oscuro. */
const appTheme = EditorView.theme({
  "&": {
    color: "var(--ink)",
    backgroundColor: "var(--surface)",
    fontSize: "14px",
    border: "1.5px solid var(--rule-strong)",
    borderRadius: "var(--radius)",
    overflow: "hidden",
  },
  "&.cm-focused": {
    outline: "none",
    borderColor: "var(--accent)",
    boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent)",
  },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.65" },
  ".cm-content": { padding: "10px 0", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0 12px 0 8px" },
  ".cm-gutters": {
    backgroundColor: "var(--surface-2)",
    color: "var(--muted)",
    border: "none",
    borderRight: "1px solid var(--rule)",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 12px", minWidth: "36px" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent) 7%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--accent) 14%, var(--surface-2))", color: "var(--ink)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 26%, transparent) !important",
  },
  ".cm-matchingBracket": { backgroundColor: "color-mix(in srgb, var(--c3) 25%, transparent)", outline: "none" },
  ".cm-placeholder": { color: "var(--muted)", fontStyle: "italic" },
  ".cm-tooltip": {
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    border: "1px solid var(--rule-strong)",
    borderRadius: "8px",
    boxShadow: "var(--shadow-md)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-mono)", fontSize: "13px", maxHeight: "16em" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "3px 10px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--accent)", color: "var(--on-accent)" },
  ".cm-completionDetail": { color: "inherit", opacity: "0.7", fontStyle: "normal", marginLeft: "8px" },
  ".cm-completionIcon": { opacity: "0.6" },
});

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: "var(--c4)", fontWeight: "600" },
  { tag: [t.string, t.special(t.string)], color: "var(--c2)" },
  { tag: [t.number, t.bool, t.null], color: "var(--c3)" },
  { tag: t.comment, color: "var(--muted)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.standard(t.name)], color: "var(--c1)" },
  { tag: [t.typeName], color: "var(--c0)" },
  { tag: [t.operator, t.punctuation], color: "var(--ink-2)" },
]);

function namespace(tables: SchemaTable[]): SQLNamespace {
  return Object.fromEntries(
    tables.map((tb) => [
      tb.name,
      tb.columns.map((c) => ({ label: c.name, type: "property", detail: [c.type, c.pk ? "PK" : "", c.references ? `→ ${c.references}` : ""].filter(Boolean).join(" ") })),
    ]),
  );
}

export interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Ctrl/Cmd + Enter. */
  onRun?: () => void;
  /** Etiqueta accesible del editor. */
  label: string;
  /** id del elemento que describe el editor (instrucciones, atajos). */
  describedBy?: string;
  tables?: SchemaTable[];
  placeholder?: string;
  minLines?: number;
  readOnly?: boolean;
}

/** Editor de SQL con CodeMirror 6: dialecto SQLite, autocompletado de tablas y columnas, números de línea. */
export function SqlEditor({ value, onChange, onRun, label, describedBy, tables = [], placeholder, minLines = 6, readOnly = false }: SqlEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const language = useRef(new Compartment());
  const editable = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  onChangeRef.current = onChange;
  onRunRef.current = onRun;

  useEffect(() => {
    const runKey = Prec.highest(
      keymap.of([
        {
          key: "Mod-Enter",
          preventDefault: true,
          run: () => {
            onRunRef.current?.();
            return true;
          },
        },
      ]),
    );
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          runKey,
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ icons: false }),
          // Tab indenta; Escape y luego Tab sale del editor (comportamiento estándar de CodeMirror).
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
          language.current.of(sql({ dialect: SQLite, upperCaseKeywords: true, schema: namespace(tables) })),
          editable.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          syntaxHighlighting(highlight),
          appTheme,
          placeholder ? placeholderExt(placeholder) : [],
          EditorView.contentAttributes.of({
            "aria-label": label,
            ...(describedBy ? { "aria-describedby": describedBy } : {}),
            spellcheck: "false",
            autocapitalize: "off",
            autocorrect: "off",
          }),
          EditorView.theme({ ".cm-content": { minHeight: `${minLines * 1.65}em` } }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // El editor se crea una vez; los cambios de props se aplican abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambios de valor desde afuera (restaurar, abrir un ejemplo, historial).
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({
      effects: language.current.reconfigure(sql({ dialect: SQLite, upperCaseKeywords: true, schema: namespace(tables) })),
    });
  }, [tables]);

  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
    });
  }, [readOnly]);

  return <div ref={host} className="sql-editor" data-testid="sql-editor" />;
}

export default SqlEditor;
