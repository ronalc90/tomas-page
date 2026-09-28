import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { QuestionView, QuizResult } from "@tomas/shared";
import { Quiz } from "../components/Quiz";

const questions: QuestionView[] = [
  { position: 0, type: "choice", prompt: "¿Qué muestra `print(10 / 2)`?", code: "", options: ["5.0", "5", "2", "Error"], hint: "La división con / nunca da un entero." },
  { position: 1, type: "choice", prompt: "¿Qué muestra `print(17 % 5)`?", code: "print(17 % 5)", options: ["3", "2", "3.4", "Error"], hint: "" },
  { position: 2, type: "output", prompt: "¿Qué imprime este código?", code: "print(2 ** 3)", options: [], hint: "** es potencia." },
  { position: 3, type: "fill", prompt: "Completa para pedir un número entero.", code: "edad = ____(input(\"Edad: \"))", options: [], hint: "" },
];

const result = (score: number): QuizResult => ({
  score,
  total: 4,
  passed: score >= 3,
  best: score,
  attempts: 1,
  createdAt: "2026-10-01T15:00:00.000Z",
  hintsUsed: [0],
  review: [
    { position: 0, chosen: 0, correct: 0, isCorrect: true, explanation: "La división con / da float.", feedback: "Correcto: / siempre devuelve decimal." },
    { position: 1, chosen: 0, correct: 1, isCorrect: score >= 2, explanation: "El residuo de 17 entre 5 es 2.", feedback: "No: 3 es el cociente entero, no el residuo." },
    { position: 2, chosen: "8", correct: "8", isCorrect: true, explanation: "2 elevado a la 3 es 8.", feedback: "" },
    { position: 3, chosen: "float", correct: "int", isCorrect: score >= 4, explanation: "input devuelve texto; int lo convierte a entero.", feedback: "" },
  ],
});

function renderQuiz(onSubmit = vi.fn(), last: QuizResult | null = null, passScore = 3) {
  return render(<Quiz questions={questions} passScore={passScore} attempts={last ? 1 : 0} best={last?.best ?? 0} last={last} onSubmit={onSubmit} />);
}

describe("Quiz", () => {
  it("no califica hasta responder todas las preguntas, incluidas las de texto", async () => {
    const onSubmit = vi.fn();
    renderQuiz(onSubmit);
    await userEvent.click(screen.getByLabelText("5.0"));
    await userEvent.click(screen.getAllByLabelText("3")[0]);
    await userEvent.type(screen.getByLabelText(/una línea por cada print/), "8");
    await userEvent.click(screen.getByRole("button", { name: "Calificar" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Te falta responder 1 pregunta");
  });

  it("envía respuestas de todos los tipos junto con las pistas usadas y muestra la revisión completa", async () => {
    const onSubmit = vi.fn().mockResolvedValue(result(3));
    renderQuiz(onSubmit);
    await userEvent.click(screen.getAllByRole("button", { name: /Ver pista/ })[0]);
    expect(screen.getByText(/nunca da un entero/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("5.0"));
    await userEvent.click(screen.getAllByLabelText("3")[0]);
    await userEvent.type(screen.getByLabelText(/una línea por cada print/), "8");
    await userEvent.type(screen.getByLabelText(/Escribe solo lo que va en el hueco/), "float");
    await userEvent.click(screen.getByRole("button", { name: "Calificar" }));
    expect(onSubmit).toHaveBeenCalledWith({ answers: [0, 0, "8", "float"], hints: [0] });
    expect(await screen.findByText("3 / 4")).toBeInTheDocument();
    expect(screen.getByText("El residuo de 17 entre 5 es 2.")).toBeInTheDocument();
    expect(screen.getByText(/3 es el cociente entero/)).toBeInTheDocument();
    expect(screen.getByText("int")).toBeInTheDocument();
    expect(screen.getByText(/Usaste 1 pista/)).toBeInTheDocument();
    expect(screen.getByText(/Qué repasar/)).toBeInTheDocument();
    expect(screen.getByText(/Evaluación aprobada\./)).toBeInTheDocument();
  });

  it("usa la nota mínima sin pasarse del total de preguntas", () => {
    renderQuiz(vi.fn(), null, 9);
    expect(screen.getByText(/Apruebas con 4 correctas/)).toBeInTheDocument();
  });

  it("permite intentar de nuevo desde la revisión", async () => {
    renderQuiz(vi.fn(), result(4), 3);
    expect(screen.getByText(/Evaluación aprobada\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }));
    expect(screen.getByRole("button", { name: "Calificar" })).toBeInTheDocument();
    expect(screen.getByLabelText("5.0")).not.toBeChecked();
    expect(screen.getByLabelText(/una línea por cada print/)).toHaveValue("");
  });
});
