import React, { useState, useEffect } from 'react';
import type { ImageMetadata } from '../../types/image.types';
import { loadImageFromUrl, canvasToBlob } from '../../utils/image.util';

interface ResizeModalProps {
  image: ImageMetadata;
  isOpen: boolean;
  onClose: () => void;
  onApplyResize: (resizedBlob: Blob, newWidth: number, newHeight: number) => void;
}

export const ResizeModal: React.FC<ResizeModalProps> = ({
  image,
  isOpen,
  onClose,
  onApplyResize,
}) => {
  const [width, setWidth] = useState(image.width);
  const [height, setHeight] = useState(image.height);
  const [lockAspect, setLockAspect] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setWidth(image.width);
      setHeight(image.height);
      setLockAspect(true);
    }
  }, [isOpen, image.width, image.height]);

  const handleWidthChange = (val: number) => {
    const w = Math.max(1, Math.min(10000, val));
    setWidth(w);
    if (lockAspect && image.width > 0) {
      const h = Math.max(1, Math.round(w * (image.height / image.width)));
      setHeight(h);
    }
  };

  const handleHeightChange = (val: number) => {
    const h = Math.max(1, Math.min(10000, val));
    setHeight(h);
    if (lockAspect && image.height > 0) {
      const w = Math.max(1, Math.round(h * (image.width / image.height)));
      setWidth(w);
    }
  };

  const handlePreset = (percentage: number) => {
    const w = Math.max(1, Math.round(image.width * (percentage / 100)));
    const h = Math.max(1, Math.round(image.height * (percentage / 100)));
    setWidth(w);
    setHeight(h);
  };

  const handleApply = async () => {
    try {
      const img = await loadImageFromUrl(image.objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not acquire canvas context.');

      ctx.drawImage(img, 0, 0, width, height);

      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.95);
      onApplyResize(blob, width, height);
      onClose();
    } catch (err) {
      console.error('Failed to resize image:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="resize-modal" onClick={(e) => e.stopPropagation()}>
        <div className="resize-modal__header">
          <h3 className="resize-modal__title">Manual Pixel Resize</h3>
          <button className="resize-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="resize-modal__body">
          <p className="resize-modal__hint">
            Specify target canvas dimensions in pixels. Independent of AI super-resolution.
          </p>

          {/* Quick presets */}
          <div className="resize-presets">
            <span className="resize-presets__label">Scale Presets:</span>
            {[25, 50, 75, 100, 150, 200].map((pct) => (
              <button
                key={pct}
                type="button"
                className="tab tab--sm"
                onClick={() => handlePreset(pct)}
              >
                {pct}%
              </button>
            ))}
          </div>

          {/* Dimensions input grid */}
          <div className="resize-grid">
            <div className="field">
              <label className="field__label" htmlFor="resize-width">
                Width (px)
              </label>
              <input
                id="resize-width"
                type="number"
                min="10"
                max="10000"
                value={width}
                onChange={(e) => handleWidthChange(parseInt(e.target.value) || 1)}
                className="input"
              />
            </div>

            <div className="resize-lock-wrap">
              <button
                type="button"
                className={`resize-lock-btn ${lockAspect ? 'resize-lock-btn--locked' : ''}`}
                onClick={() => setLockAspect((prev) => !prev)}
                title={lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
              >
                {lockAspect ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                )}
              </button>
              <span className="resize-lock-label">{lockAspect ? 'Locked' : 'Unlocked'}</span>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="resize-height">
                Height (px)
              </label>
              <input
                id="resize-height"
                type="number"
                min="10"
                max="10000"
                value={height}
                onChange={(e) => handleHeightChange(parseInt(e.target.value) || 1)}
                className="input"
              />
            </div>
          </div>

          <div className="resize-modal__info">
            <span>
              Original: <strong>{image.width} × {image.height} px</strong>
            </span>
            <span>
              New size: <strong>{width} × {height} px</strong> (
              {((width * height) / (image.width * image.height) * 100).toFixed(0)}% pixels)
            </span>
          </div>
        </div>

        <div className="resize-modal__footer">
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={handleApply}>
            Apply Resize
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResizeModal;
