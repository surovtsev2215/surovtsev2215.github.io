import { useMemo, useState } from "react";
import { Users, X } from "lucide-react";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import type { CrewMemberRef } from "../../types";
import { formatFullNameForDisplay } from "../../lib/normalizeFullName";
import type { CrewIsolatorPick } from "../../lib/crewApi";

type Props = {
  id: string;
  selected: CrewMemberRef[];
  onChange: (members: CrewMemberRef[]) => void;
  isolators: CrewIsolatorPick[];
  loading?: boolean;
  error?: string | null;
  excludeUid?: string;
  required?: boolean;
};

export function CrewMemberPicker({
  id,
  selected,
  onChange,
  isolators,
  loading,
  error,
  excludeUid,
  required
}: Props) {
  const [pickUid, setPickUid] = useState("");

  const available = useMemo(() => {
    const taken = new Set(selected.map((m) => m.uid));
    return isolators.filter((u) => u.uid !== excludeUid && !taken.has(u.uid));
  }, [isolators, selected, excludeUid]);

  function addMember() {
    if (!pickUid) return;
    const user = isolators.find((u) => u.uid === pickUid);
    if (!user) return;
    onChange([
      ...selected,
      {
        uid: user.uid,
        fullName: formatFullNameForDisplay(user.fullName),
        position: user.position?.trim() || undefined
      }
    ]);
    setPickUid("");
  }

  function removeMember(uid: string) {
    onChange(selected.filter((m) => m.uid !== uid));
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200/90 bg-slate-50/80 p-3 theme-dark:border-slate-700 theme-dark:bg-slate-900/50">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-700 theme-dark:text-slate-200">
        <Users className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <Label htmlFor={`${id}-select`} className="mb-0">
          Участники работ{required ? " *" : ""}
        </Label>
      </div>
      <p className="text-xs text-slate-500 theme-dark:text-slate-400">
        Кто выполнял работу на этой карточке. Бригадир может указать изолировщиков без доступа к приложению.
      </p>
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {selected.map((m) => (
            <li
              key={m.uid}
              className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-900 theme-dark:border-sky-800 theme-dark:bg-sky-950/50 theme-dark:text-sky-100"
            >
              <span>{formatFullNameForDisplay(m.fullName)}</span>
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-sky-200/80 theme-dark:hover:bg-sky-800"
                aria-label={`Убрать ${formatFullNameForDisplay(m.fullName)}`}
                onClick={() => removeMember(m.uid)}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-amber-700 theme-dark:text-amber-300">
          {required ? "Укажите хотя бы одного участника" : "Участники не указаны"}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <select
          id={`${id}-select`}
          className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm theme-dark:border-slate-700 theme-dark:bg-slate-900"
          value={pickUid}
          disabled={loading || available.length === 0}
          onChange={(e) => setPickUid(e.target.value)}
        >
          <option value="">
            {loading ? "Загрузка…" : available.length ? "Выберите изолировщика" : "Нет доступных"}
          </option>
          {available.map((u) => (
            <option key={u.uid} value={u.uid}>
              {formatFullNameForDisplay(u.fullName)}
              {u.position ? ` · ${u.position}` : ""}
            </option>
          ))}
        </select>
        <Button type="button" variant="secondary" size="sm" disabled={!pickUid || loading} onClick={addMember}>
          Добавить
        </Button>
      </div>
      {error ? <p className="text-xs text-red-600 theme-dark:text-red-400">{error}</p> : null}
    </div>
  );
}
