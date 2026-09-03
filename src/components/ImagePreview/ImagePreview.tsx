import React from 'react';
import type { ImageMetadata } from '../../types/image.types';
import { formatFileSize, calcSavedPercent } from '../../utils/file-size.util';
import { formatDimensions, computeAspectRatio } from '../../utils/format.util';

interface ImagePreviewProps {
  metadata: ImageMetadata;
  onRemove?: () => void;
  onCrop?: () => void;
  onResize?: () => void;
  /** Optional compressed result size to show savings */
  outputSize?: number;
  outputWidth?: number;
  outputHeight?: number;
  isProcessing?: boolean;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({
  metadata,
  onRemove,
  onCrop,
  onResize,
  outputSize,
  outputWidth,
  outputHeight,
  isProcessing = false,
}) => {
  const savings = outputSize != null ? calcSavedPercent(metadata.size, outputSize) : null;

  return (
    <div className="image-preview">
      <div className="image-preview__thumbnail-wrap">
        <img
          src={metadata.objectUrl}
          alt={metadata.name}
          className="image-preview__thumbnail"
        />
        {isProcessing && (
          <div className="image-preview__overlay">
            <div className="spinner spinner--sm" />
          </div>
        )}
        {onRemove && (
          <button
            className="image-preview__remove"
            onClick={onRemove}
            aria-label="Remove image"
            title="Remove"
          >
            ×
          </button>
        )}
      </div>

      <div className="image-preview__meta">
        <p className="image-preview__name" title={metadata.name}>{metadata.name}</p>
        <div className="image-preview__stats">
          <span className="stat">
            <span className="stat__label">Size</span>
            <span className="stat__value">{formatFileSize(metadata.size)}</span>
          </span>
          <span className="stat">
            <span className="stat__label">Dims</span>
            <span className="stat__value">{formatDimensions(metadata.width, metadata.height)}</span>
          </span>
          <span className="stat">
            <span className="stat__label">Ratio</span>
            <span className="stat__value">{computeAspectRatio(metadata.width, metadata.height)}</span>
          </span>
          <span className="stat">
            <span className="stat__label">Type</span>
            <span className="stat__value">{metadata.type.replace('image/', '').toUpperCase()}</span>
          </span>
        </div>

        {/* Quick Edit Tools: Crop & Resize */}
        {!isProcessing && (onCrop || onResize) && (
          <div className="image-preview__tools">
            {onCrop && (
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={onCrop}
                title="Crop image area"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15" />
                  <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15" />
                </svg>
                Crop
              </button>
            )}
            {onResize && (
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={onResize}
                title="Manual pixel resize"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
                Resize
              </button>
            )}
          </div>
        )}

        {outputSize != null && outputWidth != null && outputHeight != null && (
          <div className="image-preview__output-stats">
            <div className="output-stat-row">
              <span>Output: {formatFileSize(outputSize)}</span>
              <span>{formatDimensions(outputWidth, outputHeight)}</span>
              {savings !== null && savings > 0 && (
                <span className="savings-badge">–{savings.toFixed(1)}%</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImagePreview;
