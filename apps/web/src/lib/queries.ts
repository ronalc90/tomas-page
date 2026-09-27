import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminDay,
  AdminDeliverableInput,
  AdminDayInput,
  AdminOverview,
  ContentWeek,
  CreateUserInput,
  DayResponse,
  DeliverableView,
  MeResponse,
  PlanResponse,
  ProgressView,
  PublicSettings,
  QuizResult,
  ReviewDetail,
  ReviewInput,
  ReviewQueueItem,
  SettingsInput,
  SessionUser,
  StudentDetail,
  StudentRow,
  UpdateUserInput,
  UserRow,
} from "@tomas/shared";
import { api, ApiError, serial } from "./api";

export const keys = {
  me: ["me"] as const,
  plan: ["plan"] as const,
  progress: ["progress"] as const,
  day: (date: string) => ["day", date] as const,
  deliverables: ["deliverables"] as const,
  admin: ["admin"] as const,
  overview: ["admin", "overview"] as const,
  students: ["admin", "students"] as const,
  student: (id: string) => ["admin", "student", id] as const,
  reviews: (status: string) => ["admin", "reviews", status] as const,
  review: (userId: string, deliverableId: string) => ["admin", "review", userId, deliverableId] as const,
  content: ["admin", "content"] as const,
  adminDay: (date: string) => ["admin", "day", date] as const,
  users: ["admin", "users"] as const,
  settings: ["admin", "settings"] as const,
};

// ---------- Sesión ----------

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return (await api.get<MeResponse | null>("/api/auth/me")) ?? null;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { username: string; password: string }) =>
      api.post<{ user: SessionUser }>("/api/auth/login", input),
    onSuccess: async () => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      await qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/api/auth/logout"),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(keys.me, null);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) => api.post("/api/auth/password", input),
  });
}

// ---------- Estudiante ----------

export const usePlan = () =>
  useQuery({ queryKey: keys.plan, queryFn: () => api.get<PlanResponse>("/api/plan"), staleTime: 5 * 60_000 });

export const useProgress = () => useQuery({ queryKey: keys.progress, queryFn: () => api.get<ProgressView>("/api/progress") });

export const useDay = (date: string) =>
  useQuery({ queryKey: keys.day(date), queryFn: () => api.get<DayResponse>(`/api/days/${date}`), retry: false });

export const useDeliverables = () =>
  useQuery({ queryKey: keys.deliverables, queryFn: () => api.get<DeliverableView[]>("/api/deliverables") });

export function useSaveDayProgress(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { tasks?: boolean[]; evidence?: string }) =>
      serial(`day:${date}`, () => api.put(`/api/days/${date}/progress`, input)),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: keys.day(date) });
      const previous = qc.getQueryData<DayResponse>(keys.day(date));
      if (previous) {
        qc.setQueryData<DayResponse>(keys.day(date), {
          ...previous,
          progress: { ...previous.progress, ...input },
        });
      }
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) qc.setQueryData(keys.day(date), context.previous);
    },
    onSettled: (_data, _err, input) => {
      if (input.tasks) {
        void qc.invalidateQueries({ queryKey: keys.day(date) });
        void qc.invalidateQueries({ queryKey: keys.progress });
      }
    },
  });
}

export function useSubmitQuiz(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: number[]) =>
      serial(`day:${date}`, () => api.post<QuizResult>(`/api/days/${date}/quiz`, { answers })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.day(date) });
      void qc.invalidateQueries({ queryKey: keys.progress });
    },
  });
}

function refreshDeliverable(qc: ReturnType<typeof useQueryClient>, view: DeliverableView) {
  qc.setQueryData<DeliverableView[]>(keys.deliverables, (list) => list?.map((d) => (d.id === view.id ? view : d)));
  qc.setQueryData<DayResponse>(keys.day(view.dueDate), (day) => (day ? { ...day, deliverable: view } : day));
  void qc.invalidateQueries({ queryKey: keys.progress });
}

export function useSaveSubmission(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { criteria?: boolean[]; evidence?: string }) =>
      serial(`deliverable:${id}`, () => api.put<DeliverableView>(`/api/deliverables/${id}`, input)),
    onSuccess: (view) => refreshDeliverable(qc, view),
  });
}

export function useSubmissionAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: "submit" | "withdraw") =>
      serial(`deliverable:${id}`, () => api.post<DeliverableView>(`/api/deliverables/${id}/${action}`)),
    onSuccess: (view) => {
      refreshDeliverable(qc, view);
      void qc.invalidateQueries({ queryKey: keys.deliverables });
    },
  });
}

// ---------- Administración ----------

export const useOverview = () =>
  useQuery({ queryKey: keys.overview, queryFn: () => api.get<AdminOverview>("/api/admin/overview"), refetchInterval: 60_000 });

export const useStudents = () =>
  useQuery({ queryKey: keys.students, queryFn: () => api.get<StudentRow[]>("/api/admin/students") });

export const useStudent = (id: string) =>
  useQuery({ queryKey: keys.student(id), queryFn: () => api.get<StudentDetail>(`/api/admin/students/${id}`), retry: false });

export const useReviews = (status: string) =>
  useQuery({
    queryKey: keys.reviews(status),
    queryFn: () => api.get<ReviewQueueItem[]>(`/api/admin/reviews?status=${status}`),
  });

export const useReview = (userId: string, deliverableId: string) =>
  useQuery({
    queryKey: keys.review(userId, deliverableId),
    queryFn: () => api.get<ReviewDetail>(`/api/admin/reviews/${userId}/${deliverableId}`),
    retry: false,
  });

export function useSubmitReview(userId: string, deliverableId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) => api.post<DeliverableView>(`/api/admin/reviews/${userId}/${deliverableId}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.admin }),
  });
}

export const useContent = () =>
  useQuery({ queryKey: keys.content, queryFn: () => api.get<ContentWeek[]>("/api/admin/content") });

export const useAdminDay = (date: string) =>
  useQuery({ queryKey: keys.adminDay(date), queryFn: () => api.get<AdminDay>(`/api/admin/days/${date}`), retry: false });

export function useSaveAdminDay(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminDayInput) => api.put(`/api/admin/days/${date}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.admin });
      void qc.invalidateQueries({ queryKey: keys.plan });
      void qc.invalidateQueries({ queryKey: keys.day(date) });
    },
  });
}

export function useSaveAdminDeliverable(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminDeliverableInput) => api.put(`/api/admin/deliverables/${id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.admin });
      void qc.invalidateQueries({ queryKey: keys.deliverables });
    },
  });
}

export const useUsers = () => useQuery({ queryKey: keys.users, queryFn: () => api.get<UserRow[]>("/api/admin/users") });

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => api.post<UserRow>("/api/admin/users", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.admin }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateUserInput & { id: string }) => api.patch<UserRow>(`/api/admin/users/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.admin }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post(`/api/admin/users/${id}/password`, { password }),
  });
}

export const useSettings = () =>
  useQuery({ queryKey: keys.settings, queryFn: () => api.get<PublicSettings>("/api/admin/settings") });

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsInput) => api.put<PublicSettings>("/api/admin/settings", input),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}
