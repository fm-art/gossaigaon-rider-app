import type {ToastMessage, ToastType} from '../types/rider';

interface ToastContainerProps {
  toasts: ToastMessage[];
}

function getToastIcon(type: ToastType): string {
  switch (type) {
    case 'success':
      return 'fa-circle-check';
    case 'danger':
      return 'fa-circle-exclamation';
    case 'warning':
      return 'fa-triangle-exclamation';
    default:
      return 'fa-circle-info';
  }
}

export function ToastContainer({toasts}: ToastContainerProps) {
  const visibleToasts = toasts.slice(-2);
  return (
    <div id="toast-container" aria-live="polite">
      {visibleToasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <i className={`fa-solid ${getToastIcon(t.type)}`} />
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
