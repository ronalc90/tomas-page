import { Link } from "react-router";
import { ErrorState, Loading, PageHeader } from "../../components/ui";
import { useStudents } from "../../lib/queries";
import { StudentsTable } from "./shared";

export function StudentsPage() {
  const { data, isLoading, error, refetch } = useStudents();
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} retry={() => void refetch()} />;
  return (
    <div className="page">
      <PageHeader
        eyebrow="Estudiantes"
        title="Avance de cada estudiante"
        lede="Toca una fila para ver su calendario, sus evaluaciones y sus entregas."
        actions={
          <Link className="btn secondary" to="/admin/usuarios">
            Crear estudiante
          </Link>
        }
      />
      <div className="card flush">
        <StudentsTable rows={data ?? []} />
      </div>
    </div>
  );
}
