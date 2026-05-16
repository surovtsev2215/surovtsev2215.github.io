import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";

export function LoadingState({ label = "Загрузка..." }: { label?: string }) {
  return (
    <Card className="surface-floating">
      <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center text-sm text-slate-600 theme-dark:text-slate-300 sm:flex-row sm:justify-start sm:text-left">
        <Loader2 className="h-6 w-6 animate-spin text-primary theme-dark:text-accent" aria-hidden />
        <span>{label}</span>
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  actions
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <Card className="surface-floating">
      <CardContent className="space-y-3 p-6 text-center text-slate-600 theme-dark:text-slate-300 sm:p-8 sm:text-left">
        <div className="flex flex-col items-center gap-2 text-slate-700 sm:flex-row theme-dark:text-slate-200">
          <Inbox className="h-8 w-8 shrink-0 text-slate-400 theme-dark:text-slate-500 sm:h-4 sm:w-4" aria-hidden />
          <p className="font-medium">{title}</p>
        </div>
        {description ? <p className="text-sm">{description}</p> : null}
        {actions}
      </CardContent>
    </Card>
  );
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = "Повторить"
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <Card className="surface-floating border-rose-200 theme-dark:border-rose-900/60">
      <CardContent className="space-y-3 p-5 text-sm text-rose-700 theme-dark:text-rose-300">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <span>Ошибка загрузки</span>
        </div>
        <p>{message}</p>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
