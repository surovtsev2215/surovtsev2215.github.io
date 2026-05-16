import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { type ItrSection } from "../lib/itrAccess";
import { buildItrAccess } from "../lib/itrAccess";
import { useAuth } from "../contexts/AuthContext";
import { DirectorReportsPage } from "./DirectorReportsPage";
import { DirectorTeamPage } from "./DirectorTeamPage";
import { DirectorTasksPage } from "./DirectorTasksPage";
import { DirectorApprovalsPage } from "./DirectorApprovalsPage";
import { DirectorProfilePage } from "./DirectorProfilePage";

function normalizeSection(raw: string | null): ItrSection {
  if (raw === "home" || raw === "analytics") return "reports";
  return raw as ItrSection;
}

export function DirectorWorkspacePage() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const access = buildItrAccess(profile?.position, profile?.allowedSections);
  const rawSection = searchParams.get("section");
  const fallbackSection = access.sections[0] ?? "reports";
  const normalized = normalizeSection(rawSection);
  const activeSection: ItrSection = access.hasSection(normalized) ? normalized : fallbackSection;

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    if (!rawSection || rawSection === "home" || rawSection === "analytics") {
      nextParams.set("section", "reports");
      setSearchParams(nextParams, { replace: true });
      return;
    }
    if (!access.hasSection(normalized)) {
      nextParams.set("section", fallbackSection);
      setSearchParams(nextParams, { replace: true });
    }
  }, [access, fallbackSection, normalized, rawSection, searchParams, setSearchParams]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [activeSection]);

  return (
    <div className="page-stack">
      <section className="page-stack">
        <div className="rounded-2xl p-0 sm:p-1">
          {activeSection === "reports" && access.hasSection("reports") ? <DirectorReportsPage /> : null}
          {activeSection === "team" && access.hasSection("team") ? <DirectorTeamPage /> : null}
          {activeSection === "tasks" && access.hasSection("tasks") ? <DirectorTasksPage /> : null}
          {activeSection === "approvals" && access.hasSection("approvals") ? <DirectorApprovalsPage /> : null}
          {activeSection === "profile" && access.hasSection("profile") ? <DirectorProfilePage /> : null}
        </div>
      </section>
    </div>
  );
}
