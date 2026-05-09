import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";

export function LoadingState({ label = "Загрузка..." }: { label?: string }) {
  return (
    <Card className="surface-floating">
      <CardContent className="flex items-center gap-3 p-4 text-sm text-slate-600 theme-dark:text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
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
      <CardContent className="space-y-3 p-5 text-slate-600 theme-dark:text-slate-300">
        <div className="flex items-center gap-2 text-slate-700 theme-dark:text-slate-200">
          <Inbox className="h-4 w-4" aria-hidden />
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
