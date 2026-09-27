import { useEffect, useState, type FormEvent } from "react";
import { useToast } from "../../components/Toast";
import { ErrorState, Field, Loading, PageHeader } from "../../components/ui";
import { ApiError, errorMessage } from "../../lib/api";
import { useSaveSettings, useSettings } from "../../lib/queries";

export function SettingsPage() {
  const { data, isLoading, error, refetch } = useSettings();
  const save = useSaveSettings();
  const toast = useToast();
  const [passScore, setPassScore] = useState(3);
  const [programName, setProgramName] = useState("");
  const fields = save.error instanceof ApiError ? save.error.fields : {};

  useEffect(() => {
    if (data) {
      setPassScore(data.passScore);
      setProgramName(data.programName);
    }
  }, [data]);

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} retry={() => void refetch()} />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await save.mutateAsync({ passScore, programName });
      toast("Ajustes guardados.");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div className="page narrow">
      <PageHeader eyebrow="Ajustes" title="Reglas del programa" lede="Afectan a todos los estudiantes de inmediato." />
      <form className="card stack" onSubmit={submit} noValidate>
        <Field id="programName" label="Nombre del programa" hint="Aparece en el menú. Usa « · » para separar el nombre del subtítulo." error={fields.programName}>
          <input id="programName" className="input" value={programName} onChange={(e) => setProgramName(e.target.value)} />
        </Field>
        <Field
          id="passScore"
          label="Respuestas correctas para aprobar una evaluación"
          hint="Las evaluaciones tienen 4 preguntas. Con 3, se aprueba con el 75 %. Un taller solo cuenta como completo cuando la evaluación está aprobada."
          error={fields.passScore}
        >
          <input
            id="passScore"
            className="input"
            type="number"
            min={1}
            max={10}
            style={{ maxWidth: 140 }}
            value={passScore}
            onChange={(e) => setPassScore(Number(e.target.value))}
          />
        </Field>
        <Field id="tz" label="Zona horaria" hint="Define qué día es «hoy» para los atrasos.">
          <input id="tz" className="input" value={data!.timeZone} readOnly disabled style={{ maxWidth: 260 }} />
        </Field>
        <div className="row">
          <button className="btn" type="submit" disabled={save.isPending}>
            Guardar ajustes
          </button>
        </div>
      </form>
    </div>
  );
}
