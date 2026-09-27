import { Route, Routes } from "react-router";
import { NotFoundPage } from "../NotFoundPage";
import { ContentPage } from "./ContentPage";
import { DayEditorPage } from "./DayEditorPage";
import { OverviewPage } from "./OverviewPage";
import { ReviewDetailPage } from "./ReviewDetailPage";
import { ReviewsPage } from "./ReviewsPage";
import { SettingsPage } from "./SettingsPage";
import { StudentDetailPage } from "./StudentDetailPage";
import { StudentsPage } from "./StudentsPage";
import { UsersPage } from "./UsersPage";

export default function AdminRoutes() {
  return (
    <Routes>
      <Route index element={<OverviewPage />} />
      <Route path="estudiantes" element={<StudentsPage />} />
      <Route path="estudiantes/:id" element={<StudentDetailPage />} />
      <Route path="revisiones" element={<ReviewsPage />} />
      <Route path="revisiones/:userId/:deliverableId" element={<ReviewDetailPage />} />
      <Route path="contenido" element={<ContentPage />} />
      <Route path="contenido/:date" element={<DayEditorPage />} />
      <Route path="usuarios" element={<UsersPage />} />
      <Route path="ajustes" element={<SettingsPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
