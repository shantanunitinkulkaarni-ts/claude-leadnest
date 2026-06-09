'use client'

import React from 'react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
  name?: string
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name || 'unknown'}]`, error, info.componentStack)
    // Sentry.captureException(error) — auto-captured by Sentry SDK if installed
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '40px 24px', gap: 12,
          color: '#6B7280', textAlign: 'center'
        }}>
          <span style={{ fontSize: 32 }}>⚠️</span>
          <p style={{ margin: 0, fontWeight: 500, color: '#374151' }}>Something went wrong</p>
          <p style={{ margin: 0, fontSize: 13 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            style={{
              marginTop: 8, padding: '8px 20px', borderRadius: 8,
              background: '#4F46E5', color: '#fff', border: 'none',
              cursor: 'pointer', fontSize: 14
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
