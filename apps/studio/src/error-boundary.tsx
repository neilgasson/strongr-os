import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
}

interface AppErrorBoundaryState {
  readonly hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // M3.0 intentionally has no telemetry. Sensitive browser state must not be logged.
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="fatal-state" id="main-content">
          <p className="eyebrow">Strongr Studio</p>
          <h1>We could not display this screen.</h1>
          <p>
            No governed action was assumed to have succeeded. Reload to restore the view from
            canonical records.
          </p>
          <a className="button-link" href="/">
            Reload Studio
          </a>
        </main>
      );
    }
    return this.props.children;
  }
}
