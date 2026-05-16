import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../ui/button";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ПТО] Ошибка интерфейса", error, info.componentStack);
  }

  private reload = () => {
    sessionStorage.removeItem("pto-chunk-reload-once");
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
        <h2 className="text-lg font-semibold text-slate-900 theme-dark:text-slate-100">
          Что-то пошло не так
        </h2>
        <p className="text-sm text-slate-600 theme-dark:text-slate-300">
          Обновите страницу. Если ошибка повторяется — очистите кэш (Ctrl+F5) или войдите снова.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={this.reload}>
            Обновить страницу
          </Button>
          <Button type="button" variant="secondary" onClick={() => this.setState({ error: null })}>
            Попробовать снова
          </Button>
        </div>
      </div>
    );
  }
}
