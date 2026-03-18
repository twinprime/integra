import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
    children: ReactNode
    fallback?: ReactNode
    label?: string
}

interface ErrorBoundaryState {
    hasError: boolean
    error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(
            `[ErrorBoundary${this.props.label ? ` – ${this.props.label}` : ''}]`,
            error,
            info
        )
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null })
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback
            return (
                <div className="flex flex-col items-center justify-center h-full p-6 gap-3 text-center">
                    <p className="text-sm font-medium text-red-400">
                        {this.props.label ? `${this.props.label} error` : 'Something went wrong'}
                    </p>
                    <p className="text-xs text-gray-500 font-mono max-w-xs break-all">
                        {this.state.error?.message ?? 'Unknown error'}
                    </p>
                    <button
                        onClick={this.handleReset}
                        className="mt-1 px-3 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                    >
                        Try again
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}
