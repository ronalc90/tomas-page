import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { QuestionView, QuizResult } from "@tomas/shared";
import { Quiz } from "../components/Quiz";

const questions: QuestionView[] = [
  { position: 0, prompt: "¿Qué muestra `print(10 / 2)`?", code: "", options: ["5.0", "5", "2", "Error"] },
  { position: 1, prompt: "¿Qué muestra `print(17 % 5)`?", code: "print(17 % 5)", options: ["3", "2", "3.4", "Error"] },
];

const result = (score: number): QuizResult => ({
  score,
  total: 2,
  passed: score >= 2,
  best: score,
  attempts: 1,
  createdAt: "2026-10-01T15:00:00.000Z",
  review: [
    { position: 0, chosen: 0, correct: 0, isCorrect: true, explanation: "La división con / da float." },
    { position: 1, chosen: 0, correct: 1, isCorrect: score === 2, explanation: "El residuo de 17 entre 5 es 2." },
  ],
});

describe("Quiz", () => {
  it("no califica hasta responder todas las preguntas", async () => {
    const onSubmit = vi.fn();
    render(<Quiz questions={questions} passScore={3} attempts={0} best={0} last={null} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByLabelText("5.0"));
    await userEvent.click(screen.getByRole("button", { name: "Calificar" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Te falta responder 1 pregunta");
  });

  it("envía las respuestas y muestra la revisión con explicaciones", async () => {
    const onSubmit = vi.fn().mockResolvedValue(result(1));
    render(<Quiz questions={questions} passScore={3} attempts={0} best={0} last={null} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByLabelText("5.0"));
    await userEvent.click(screen.getAllByLabelText("3")[0]);
    await userEvent.click(screen.getByRole("button", { name: "Calificar" }));
    expect(onSubmit).toHaveBeenCalledWith([0, 0]);
    expect(await screen.findByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByText("El residuo de 17 entre 5 es 2.")).toBeInTheDocument();
    expect(screen.getByText(/Todavía no/)).toBeInTheDocument();
  });

  it("usa la nota mínima sin pasarse del total de preguntas", () => {
    render(<Quiz questions={questions} passScore={3} attempts={0} best={0} last={null} onSubmit={vi.fn()} />);
    expect(screen.getByText(/Apruebas con 2 correctas/)).toBeInTheDocument();
  });

  it("permite intentar de nuevo desde la revisión", async () => {
    render(<Quiz questions={questions} passScore={2} attempts={1} best={2} last={result(2)} onSubmit={vi.fn()} />);
    expect(screen.getByText("Evaluación aprobada.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }));
    expect(screen.getByRole("button", { name: "Calificar" })).toBeInTheDocument();
    expect(screen.getByLabelText("5.0")).not.toBeChecked();
  });
});
