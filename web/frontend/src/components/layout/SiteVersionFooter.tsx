import { getSiteBuildDisplay } from "../../lib/buildInfo";
import { cn } from "../../lib/utils";

type SiteVersionFooterProps = {
  className?: string;
  /** В шапке приложения или на экране входа */
  placement?: "app" | "auth";
};

export function SiteVersionFooter({ className, placement = "app" }: SiteVersionFooterProps) {
  const { line, detail } = getSiteBuildDisplay();

  return (
    <footer
      role="contentinfo"
      aria-label="Версия сайта"
      className={cn(
        "border-t border-slate-200/70 bg-slate-100/95 px-3 py-1.5 text-center backdrop-blur-sm theme-dark:border-slate-700/70 theme-dark:bg-slate-900/95",
        placement === "app" && "mx-auto w-full shrink-0 md:rounded-b-2xl",
        placement === "auth" && "mt-4 rounded-xl border border-slate-200/80",
        className
      )}
    >
      <p className="font-mono text-[10px] font-medium leading-snug text-slate-600 theme-dark:text-slate-300">
        <span className="text-slate-500 theme-dark:text-slate-400">Версия сайта: </span>
        <span className="select-all">{line}</span>
      </p>
      <p className="mt-0.5 text-[9px] leading-snug text-slate-500 theme-dark:text-slate-400">{detail}</p>
    </footer>
  );
}
