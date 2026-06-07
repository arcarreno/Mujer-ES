import type { ReactNode, MouseEvent } from 'react'

interface SubmitButtonProps {
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
  className?: string
}

export default function SubmitButton({
  loading = false,
  disabled = false,
  type = 'submit',
  onClick,
  children,
  className = 'login-submit privacy-modal-btn submit-btn',
}: SubmitButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      className={className}
      data-loading={loading || undefined}
    >
      <span className="submit-btn-content">{children}</span>
      {loading && (
        <span className="submit-btn-loader" aria-hidden="true">
          <span className="submit-btn-loader-spin" />
        </span>
      )}
    </button>
  )
}
