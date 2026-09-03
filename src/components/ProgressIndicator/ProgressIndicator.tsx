import React from 'react';

interface ProgressIndicatorProps {
  progress: number; // 0-100
  stage?: string;
  onCancel?: () => void;
  label?: string;
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  progress,
  stage,
  onCancel,
  label = 'Processing',
}) => {
  const clamped = Math.max(0, Math.min(100, progress));

  return (
    <div className="progress-indicator" role="status" aria-live="polite">
      <div className="progress-indicator__header">
        <span className="progress-indicator__label">{label}</span>
        <span className="progress-indicator__pct">{Math.round(clamped)}%</span>
      </div>

      <div className="progress-bar" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="progress-bar__fill"
          style={{ width: `${clamped}%` }}
        />
      </div>

      {stage && (
        <p className="progress-indicator__stage">{stage}</p>
      )}

      {onCancel && (
        <button
          className="btn btn--ghost btn--sm progress-indicator__cancel"
          onClick={onCancel}
          id="cancel-processing-btn"
        >
          Cancel
        </button>
      )}
    </div>
  );
};

export default ProgressIndicator;
