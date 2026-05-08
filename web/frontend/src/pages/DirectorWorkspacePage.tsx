import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { type ItrSection } from "../lib/itrAccess";
import { buildItrAccess } from "../lib/itrAccess";
import { useAuth } from "../contexts/AuthContext";
import { DirectorHomePage } from "./DirectorHomePage";
import { DirectorReportsPage } from "./DirectorReportsPage";
import { DirectorTeamPage } from "./DirectorTeamPage";
import { DirectorTasksPage } from "./DirectorTasksPage";
import { DirectorAnalyticsPage } from "./DirectorAnalyticsPage";
import { DirectorApprovalsPage } from "./DirectorApprovalsPage";
import { DirectorProfilePage } from "./DirectorProfilePage";

export function DirectorWorkspacePage() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const access = buildItrAccess(profile?.position, profile?.allowedSections);
  const rawSection = searchParams.get("section");
  const fallbackSection = access.sections[0] ?? "home";
  const activeSection: ItrSection = access.hasSection(rawSection as ItrSection) ? (rawSection as ItrSection) : fallbackSection;

  useEffect(() => {
    if (!access.hasSection(rawSection as ItrSection)) {
      const nextParams = new URLSearchParams(searchParams);
      if (fallbackSection === "home") {
        nextParams.delete("section");
      } else {
        nextParams.set("section", fallbackSection);
      }
      setSearchParams(nextParams, { replace: true });
    }
  }, [access, fallbackSection, rawSection, searchParams, setSearchParams]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [access.sections, activeSection, rawSection]);

  return (
    <div className="page-stack">
      <section className="page-stack">
        <div className="rounded-2xl p-0 sm:p-1">
          {activeSection === "home" && access.hasSection("home") ? <DirectorHomePage /> : null}
          {activeSection === "reports" && access.hasSection("reports") ? <DirectorReportsPage /> : null}
          {activeSection === "team" && access.hasSection("team") ? <DirectorTeamPage /> : null}
          {activeSection === "tasks" && access.hasSection("tasks") ? <DirectorTasksPage /> : null}
          {activeSection === "analytics" && access.hasSection("analytics") ? <DirectorAnalyticsPage /> : null}
          {activeSection === "approvals" && access.hasSection("approvals") ? <DirectorApprovalsPage /> : null}
          {activeSection === "profile" && access.hasSection("profile") ? <DirectorProfilePage /> : null}
        </div>
      </section>
    </div>
  );
}
