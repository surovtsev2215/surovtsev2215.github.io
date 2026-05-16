import { useEffect, useState } from "react";
import { fetchCrewIsolators, type CrewIsolatorPick } from "../lib/crewApi";

export function useCrewIsolators() {
  const [isolators, setIsolators] = useState<CrewIsolatorPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchCrewIsolators();
        if (!cancelled) setIsolators(rows);
      } catch (e) {
        if (!cancelled) {
          setIsolators([]);
          setError(e instanceof Error ? e.message : "Не удалось загрузить список изолировщиков.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { isolators, loading, error };
}
