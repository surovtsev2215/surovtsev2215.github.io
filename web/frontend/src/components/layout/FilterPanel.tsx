import { type ReactNode } from "react";
import { cn } from "../../lib/utils";

type FilterPanelProps = {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  tone?: "default" | "accent";
};

export function FilterPanel({ title = "Фильтры", children, actions, className, tone = "default" }: FilterPanelProps) {
  return (
    <section
      className={cn("page-filters", tone === "accent" && "page-filters-accent", className)}
      aria-label={title}
    >
      <div className="page-filters-head">
        <h3 className="page-filters-title">{title}</h3>
        {actions ? <div className="page-filters-actions">{actions}</div> : null}
      </div>
      <div className="page-filters-body">{children}</div>
    </section>
  );
}
