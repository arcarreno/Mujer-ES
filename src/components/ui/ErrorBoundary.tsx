import { Component, type ReactNode } from 'react'
import NotFoundPage from './NotFoundPage'

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
        <NotFoundPage
          title="Ups"
          subtitle="Algo salió mal"
          description="Ocurrió un error inesperado. Reintentá o volvé al inicio para continuar."
          showReload
          onHome={() => {
            window.location.href = '/'
          }}
        />
      )
    }
    return this.props.children
  }
}