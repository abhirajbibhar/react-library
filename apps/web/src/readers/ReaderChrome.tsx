import type { ReactNode } from 'react';

/** Small round icon button used across the readers. */
export function ReaderIconButton({
  icon,
  title,
  onClick,
  active = false,
  disabled = false
}: {
  icon: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`reader-icon-btn${active ? ' active' : ''}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      <i className={`pi ${icon}`} />
    </button>
  );
}

export function ReaderHeader({
  title,
  subtitle,
  onBack,
  actions
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  actions?: ReactNode;
}) {
  return (
    <header className="reader-header">
      <ReaderIconButton icon="pi-arrow-left" title="Back" onClick={onBack} />
      <span className="reader-header-title" title={title}>
        {title}
      </span>
      {subtitle ? (
        <span className="reader-header-subtitle" title={subtitle}>
          {subtitle}
        </span>
      ) : null}
      <div className="reader-header-actions">{actions}</div>
    </header>
  );
}
