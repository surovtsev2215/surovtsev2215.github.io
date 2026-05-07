import { UserRound } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent } from "../components/ui/card";

export function DirectorProfilePage() {
  const { profile } = useAuth();

  return (
    <div className="page-stack">
      <div className="surface-highlight animate-in-up p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Профиль директора</h2>
            <p className="mt-1 text-sm text-slate-100/90">
              Доступ к сводной аналитике и полной ленте отчётности.
            </p>
          </div>
          <UserRound className="h-5 w-5 shrink-0 text-amber-300" />
        </div>
      </div>

      <Card className="soft-ring">
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div>
            <div className="text-xs text-slate-500 theme-dark:text-slate-400">ФИО</div>
            <div className="text-base font-semibold">{profile?.fullName ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 theme-dark:text-slate-400">Роль</div>
            <div className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700 theme-dark:border-violet-700 theme-dark:bg-violet-900/40 theme-dark:text-violet-300">
              director
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 theme-dark:border-slate-700 theme-dark:bg-slate-800/70 theme-dark:text-slate-300">
            Вы видите все отчёты по компании, можете фильтровать данные и выгружать Excel/PDF. Изменение пользователей и
            ручное редактирование отчётов недоступны.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
