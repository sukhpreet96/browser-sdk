import React from 'react'
import type { ErrorInfo } from 'react'
import { addReactError } from './addReactError'

interface Props {
  fallback: Fallback
  children: React.ReactNode
}

export type Fallback = (parameters: { error: Error; resetError: () => void }) => React.ReactNode

type State =
  | {
      didCatch: false
      error: null
    }
  | {
      didCatch: true
      error: Error
    }

const INITIAL_STATE: State = { didCatch: false, error: null }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = INITIAL_STATE
  }

  static getDerivedStateFromError(error: Error): State {
    return { didCatch: true, error }
  }

  resetError = () => {
    this.setState(INITIAL_STATE)
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    addReactError(error, errorInfo)
  }

  render() {
    if (this.state.didCatch) {
      return this.props.fallback({
        error: this.state.error,
        resetError: this.resetError,
      })
    }

    return this.props.children
  }
}
