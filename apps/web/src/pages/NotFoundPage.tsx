import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="page narrow">
      <div className="empty">
        <p className="eyebrow">Error 404</p>
        <h3>Esta página no existe</h3>
        <p>Puede que el enlace esté mal escrito o que la página se haya movido.</p>
        <Link className="btn" to="/">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
