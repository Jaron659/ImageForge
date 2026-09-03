import React, { useState } from 'react';

interface DownloadButtonProps {
  onDownload: () => void | Promise<void>;
  label?: string;
  variant?: 'primary' | 'secondary';
  id?: string;
  disabled?: boolean;
}

const DownloadButton: React.FC<DownloadButtonProps> = ({
  onDownload,
  label = 'Download',
  variant = 'primary',
  id = 'download-btn',
  disabled = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (disabled || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onDownload();
    } catch (e) {
      setError((e as Error).message || 'Download failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="download-btn-wrap">
      <button
        id={id}
        className={`btn btn--${variant} btn--download${loading ? ' btn--loading' : ''}`}
        onClick={handleClick}
        disabled={disabled || loading}
        aria-label={loading ? 'Preparing download...' : label}
      >
        {loading ? (
          <span className="spinner spinner--sm" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2V11M5 8L8 11L11 8M3 14H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {loading ? 'Preparing...' : label}
      </button>
      {error && <p className="download-btn-wrap__error">{error}</p>}
    </div>
  );
};

export default DownloadButton;
