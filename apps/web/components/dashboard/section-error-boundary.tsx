"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  sectionName: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[Dashboard] Section "${this.props.sectionName}" crashed:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="domus-card space-y-3 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8" style={{ color: "var(--domus-warning-text)" }} />
          <p className="domus-heading text-sm font-medium">Something went wrong in {this.props.sectionName}</p>
          <p className="domus-muted text-xs">This section encountered an error. Other sections are unaffected.</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="domus-badge cursor-pointer text-xs hover:opacity-80"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
