import React from 'react';
import type { ProcessedImage, ImageMetadata } from '../../types/image.types';
import { formatFileSize } from '../../utils/file-size.util';
import { formatDimensions } from '../../utils/format.util';

interface ResultCardProps {
  original: ImageMetadata;
  result: ProcessedImage;
  processingType: 'compressed' | 'enhanced' | 'enhanced+compressed';
  targetSizeKB?: number;
  onDownload: () => void;
  onViewComparison?: () => void;
}

const ResultCard: React.FC<ResultCardProps> = ({
  original,
  result,
  processingType,
  targetSizeKB,
  onDownload,
  onViewComparison,
}) => {
  const savedBytes = original.size - result.size;
  const savedPct = ((savedBytes / original.size) * 100);
  const grew = savedBytes < 0;

  const typeLabel: Record<typeof processingType, string> = {
    'compressed': 'Compressed',
    'enhanced': 'AI-Upscaled',
    'enhanced+compressed': 'AI-Upscaled + Compressed',
  };

  return (
    <div className="result-card">
      <div className="result-card__preview">
        <img src={result.objectUrl} alt="Processed result" className="result-card__img" />
        <div className="result-card__type-badge">{typeLabel[processingType]}</div>
      </div>

      <div className="result-card__stats">
        <div className="stat-row">
          <div className="stat-col">
            <span className="stat-col__label">Before</span>
            <span className="stat-col__value">{formatFileSize(original.size)}</span>
            <span className="stat-col__sub">{formatDimensions(original.width, original.height)}</span>
          </div>
          <div className="stat-col stat-col--arrow">→</div>
          <div className="stat-col">
            <span className="stat-col__label">After</span>
            <span className="stat-col__value">{formatFileSize(result.size)}</span>
            <span className="stat-col__sub">{formatDimensions(result.width, result.height)}</span>
          </div>
          <div className={`stat-col stat-col--delta ${grew ? 'stat-col--grew' : 'stat-col--shrunk'}`}>
            <span className="stat-col__label">Change</span>
            <span className="stat-col__value">
              {grew ? '+' : '–'}{Math.abs(savedPct).toFixed(1)}%
            </span>
            <span className="stat-col__sub">
              {grew ? 'larger' : formatFileSize(Math.abs(savedBytes)) + ' saved'}
            </span>
          </div>
        </div>
      </div>

      {targetSizeKB && (
        <div
          className="result-card__target-info"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px',
            background: 'var(--clr-bg-surface)',
            borderRadius: 'var(--r-md)',
            fontSize: '0.85rem',
            margin: '0 16px 12px',
            border: '1px solid var(--clr-border)',
          }}
        >
          <span style={{ color: 'var(--clr-text-muted)' }}>Target: ≤ {targetSizeKB} KB</span>
          <span
            style={{
              fontWeight: 600,
              color:
                result.size <= targetSizeKB * 1024
                  ? 'var(--clr-success, #10b981)'
                  : 'var(--clr-warn, #f59e0b)',
            }}
          >
            {result.size <= targetSizeKB * 1024
              ? `✓ Target Met (${formatFileSize(result.size)})`
              : `At limit (${formatFileSize(result.size)})`}
          </span>
        </div>
      )}

      <div className="result-card__actions">
        {onViewComparison && (
          <button
            className="btn btn--ghost"
            onClick={onViewComparison}
            id="view-comparison-btn"
          >
            Compare
          </button>
        )}
        <button
          className="btn btn--primary"
          onClick={onDownload}
          id="download-single-btn"
        >
          Download
        </button>
      </div>
    </div>
  );
};

export default ResultCard;
