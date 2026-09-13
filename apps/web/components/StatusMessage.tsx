type StatusMessageProps = {
  type: "loading" | "error" | "empty" | "success" | "info";
  message: string;
};

const STYLES: Record<StatusMessageProps["type"], string> = {
  loading: "border-slate-200 bg-slate-50 text-slate-600",
  error: "border-red-200 bg-red-50 text-red-700",
  empty: "border-slate-200 bg-slate-100 text-slate-600",
  success: "border-green-200 bg-green-50 text-green-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
};

/** Bandeau de retour utilisateur réutilisé pour loading/erreur/vide/succès. */
export function StatusMessage({ type, message }: StatusMessageProps) {
  return (
    <p role={type === "error" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${STYLES[type]}`}>
      {message}
    </p>
  );
}
