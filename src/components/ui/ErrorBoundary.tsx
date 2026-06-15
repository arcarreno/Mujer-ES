import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem' }}>
          <p style={{ color: '#1a1c2e', fontSize: '1rem' }}>Algo salió mal.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              background: '#1a1c2e',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '0.5rem 1.5rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
