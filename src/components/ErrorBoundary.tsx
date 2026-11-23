import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected application error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0B0F14] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#121821] border border-white/10 rounded-xl p-6 space-y-4">
            <h1 className="text-xl font-semibold text-white">Application Recovery</h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Something interrupted the interface state. You can reset the view below.
            </p>
            <p className="text-xs font-mono text-rose-300 bg-rose-950/40 border border-rose-500/20 rounded-lg p-3 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
            >
              Reload Interface
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
