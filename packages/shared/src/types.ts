/** Tipos compartidos entre la API y la aplicación web. */

export type Role = "student" | "admin";
export type DayKind = "workshop" | "holiday" | "free";
export type Language = "python" | "sql" | "bash";
export type DeliverableKind = "weekly" | "mini-project" | "final";
export type SubmissionStatus = "draft" | "submitted" | "approved" | "changes_requested";
/** Tipos de pregunta: opción múltiple, verdadero/falso, escribir la salida y completar código. */
export type QuestionType = "choice" | "boolean" | "output" | "fill";
/** Respuesta a una pregunta: índice de la opción elegida o texto escrito. */
export type Answer = number | string;

/** Estado visible de un día o entregable para un estudiante. */
export type ItemStatus = "done" | "in_progress" | "pending" | "overdue" | "rest";

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
}

export interface MeResponse {
  user: SessionUser;
  today: string;
  settings: PublicSettings;
}

export interface PublicSettings {
  passScore: number;
  timeZone: string;
  programName: string;
}

// ---------- Plan ----------

export interface PlanPhase {
  id: number;
  name: string;
  rangeLabel: string;
  goal: string;
}

export interface PlanDay {
  date: string;
  kind: DayKind;
  title: string;
  taskCount: number;
}

export interface PlanDeliverable {
  id: string;
  weekId: string;
  dueDate: string;
  kind: DeliverableKind;
  path: string;
  title: string;
}

export interface PlanWeek {
  id: string;
  number: number;
  phaseId: number;
  title: string;
  rangeLabel: string;
  days: PlanDay[];
  deliverable: PlanDeliverable | null;
}

export interface PlanResponse {
  start: string;
  end: string;
  phases: PlanPhase[];
  weeks: PlanWeek[];
}

// ---------- Progreso ----------

export interface DayState {
  status: ItemStatus;
  tasksDone: number;
  tasksTotal: number;
  attempts: number;
  best: number;
  total: number;
  completedAt: string | null;
}

export interface DeliverableState {
  status: ItemStatus;
  submission: SubmissionStatus | null;
}

export interface PendingItem {
  type: "workshop" | "deliverable";
  ref: string;
  date: string;
  title: string;
}

export interface PhaseProgress {
  id: number;
  name: string;
  done: number;
  total: number;
}

export type Pace = "not_started" | "on_track" | "behind" | "finished";

export interface ProgressTotals {
  workshops: number;
  workshopsDone: number;
  deliverables: number;
  deliverablesSubmitted: number;
  deliverablesApproved: number;
  completion: number;
  quizzesTaken: number;
  quizzesPassed: number;
  quizAverage: number | null;
  firstTryAverage: number | null;
  streak: number;
  overdue: number;
  expectedByToday: number;
}

export interface ProgressView {
  today: string;
  start: string;
  end: string;
  passScore: number;
  pace: Pace;
  totals: ProgressTotals;
  days: Record<string, DayState>;
  deliverables: Record<string, DeliverableState>;
  phases: PhaseProgress[];
  pending: PendingItem[];
}

// ---------- Día (vista del estudiante) ----------

export interface QuestionView {
  position: number;
  type: QuestionType;
  prompt: string;
  code: string;
  options: string[];
  /** Pista que el estudiante puede destapar antes de responder. No revela la respuesta. */
  hint: string;
}

export interface QuestionReview {
  position: number;
  chosen: Answer;
  /** Índice de la opción correcta o, en preguntas de texto, la respuesta canónica. */
  correct: Answer;
  isCorrect: boolean;
  explanation: string;
  /** Por qué la opción elegida está bien o mal (solo en opción múltiple y verdadero/falso). */
  feedback: string;
}

export interface QuizResult {
  score: number;
  total: number;
  passed: boolean;
  best: number;
  attempts: number;
  createdAt: string;
  hintsUsed: number[];
  review: QuestionReview[];
}

export interface TutorialStep {
  title: string;
  body: string;
  code: string;
  language: Language;
}

export interface CommonError {
  error: string;
  cause: string;
  fix: string;
}

export interface Challenge {
  title: string;
  description: string;
  hint: string;
  solution: string;
  language: Language;
}

export interface GlossaryItem {
  term: string;
  definition: string;
}

export interface Resource {
  title: string;
  url: string;
}

export interface GuideSection {
  heading: string;
  body: string;
  code: string;
  language: Language;
}

export interface Guide {
  slug: string;
  title: string;
  summary: string;
  minutes: number;
  sections: GuideSection[];
}

export interface DayContent {
  date: string;
  weekId: string;
  weekNumber: number;
  weekTitle: string;
  phaseId: number;
  phaseName: string;
  kind: DayKind;
  title: string;
  summary: string;
  /** Lo que el estudiante va a poder hacer al terminar. */
  objectives: string[];
  concept: string;
  /** Consejo práctico del día (errores comunes, cómo estudiar o depurar). */
  tip: string;
  example: string;
  language: Language;
  exampleOutput: string;
  /** Guía paso a paso para construir el programa del día. */
  steps: TutorialStep[];
  commonErrors: CommonError[];
  tasks: string[];
  /** Una pista por tarea, en el mismo orden. */
  taskHints: string[];
  challenge: Challenge | null;
  glossary: GlossaryItem[];
  resources: Resource[];
}

/** Un "día" del calendario: puede tener taller, entregable, ambos, o ser festivo. */
export interface DayResponse {
  date: string;
  day: DayContent | null;
  questions: QuestionView[];
  progress: { tasks: boolean[]; evidence: string; challengeDone: boolean; completedAt: string | null };
  quiz: { attempts: number; best: number; last: QuizResult | null };
  state: DayState;
  deliverable: DeliverableView | null;
  nav: { prev: string | null; next: string | null };
}

export interface DeliverableView {
  id: string;
  weekId: string;
  weekNumber: number;
  weekTitle: string;
  phaseId: number;
  dueDate: string;
  kind: DeliverableKind;
  title: string;
  path: string;
  description: string;
  criteria: string[];
  /** Cómo abordarlo, consejos, reto opcional y lista de revisión antes de enviar. */
  steps: string[];
  tips: string[];
  stretch: string;
  checklist: string[];
  state: DeliverableState;
  submission: {
    status: SubmissionStatus;
    criteria: boolean[];
    evidence: string;
    submittedAt: string | null;
    reviewedAt: string | null;
    feedback: string;
    reviewerName: string | null;
  } | null;
}

// ---------- Administración ----------

export interface ActivityItem {
  id: number;
  type: string;
  userId: string;
  userName: string;
  ref: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface StudentRow {
  id: string;
  username: string;
  displayName: string;
  active: boolean;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  totals: ProgressTotals;
  pace: Pace;
}

export interface AdminOverview {
  today: string;
  students: StudentRow[];
  pendingReviews: number;
  activity: ActivityItem[];
  weeklyActivity: { week: string; label: string; workshops: number; quizzes: number }[];
}

export interface StudentDayRow {
  date: string;
  title: string;
  weekNumber: number;
  kind: DayKind;
  state: DayState;
  firstScore: number | null;
  evidence: string;
  challengeDone: boolean;
  /** Pistas de la evaluación destapadas en el mejor intento más reciente. */
  hintsUsed: number;
}

export interface StudentDetail {
  student: StudentRow;
  progress: ProgressView;
  days: StudentDayRow[];
  deliverables: DeliverableView[];
  activity: ActivityItem[];
}

export interface ReviewQueueItem {
  userId: string;
  userName: string;
  deliverableId: string;
  weekNumber: number;
  title: string;
  dueDate: string;
  status: SubmissionStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
}

export interface ReviewDetail {
  userId: string;
  userName: string;
  deliverable: DeliverableView;
}

export interface AdminQuestion {
  type: QuestionType;
  prompt: string;
  code: string;
  options: string[];
  correctIndex: number;
  /** Respuestas aceptadas en preguntas de texto (la primera es la canónica). */
  accepted: string[];
  /** Comentario por opción, en el mismo orden que options. */
  optionFeedback: string[];
  explanation: string;
  hint: string;
}

export interface AdminDay extends DayContent {
  questions: AdminQuestion[];
  updatedAt: string | null;
}

export interface AdminDeliverable {
  id: string;
  weekId: string;
  dueDate: string;
  kind: DeliverableKind;
  path: string;
  description: string;
  criteria: string[];
  steps: string[];
  tips: string[];
  stretch: string;
  checklist: string[];
}

export interface ContentWeek {
  id: string;
  number: number;
  phaseId: number;
  title: string;
  rangeLabel: string;
  days: { date: string; kind: DayKind; title: string; questionCount: number; updatedAt: string | null }[];
  deliverable: AdminDeliverable | null;
}

export interface UserRow {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: unknown;
}
