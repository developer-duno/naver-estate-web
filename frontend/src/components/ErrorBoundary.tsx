"use client";

import React from "react";

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>오류가 발생했습니다</h2>
          <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
            {String(this.state.error)}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 24px",
              fontSize: 14,
              borderRadius: 8,
              border: "1px solid #D1D5DB",
              background: "#F9FAFB",
              cursor: "pointer",
            }}
          >
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
