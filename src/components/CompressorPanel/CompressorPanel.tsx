import React, { useState } from 'react';
import type { BinarySearchStep, CompressionOptions, OutputFormat } from '../../types/image.types';

interface CompressorPanelProps {
  options: CompressionOptions;
  onChange: (opts: CompressionOptions) => void;
  binarySearchSteps?: BinarySearchStep[];
  originalSize?: number;
}

const CompressorPanel: React.FC<CompressorPanelProps> = ({
  options,
  onChange,
  binarySearchSteps = [],
  originalSize,
}) => {
  const [showSteps, setShowSteps] = useState(false);

  const update = (partial: Partial<CompressionOptions>) =>
    onChange({ ...options, ...partial });

  return (
    <div className="panel">
      <div className="panel__header">
        <div className="panel__icon panel__icon--compress">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 8H14M8 2V14M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <h2 className="panel__title">Compress</h2>
      </div>

      <div className="panel__body">
        {/* Mode selector */}
        <div className="field">
          <label className="field__label">Mode</label>
          <div className="tab-group">
            <button
              id="compress-mode-quality"
              className={`tab${options.mode === 'quality' ? ' tab--active' : ''}`}
              onClick={() => update({ mode: 'quality' })}
            >
              Quality
            </button>
            <button
              id="compress-mode-target"
              className={`tab${options.mode === 'target-size' ? ' tab--active' : ''}`}
              onClick={() => update({ mode: 'target-size' })}
            >
              Target Size
            </button>
          </div>
        </div>

        {/* Quality slider */}
        {options.mode === 'quality' && (
          <div className="field">
            <label className="field__label" htmlFor="quality-slider">
              Quality
              <span className="field__value">{Math.round(options.quality * 100)}%</span>
            </label>
            <input
              id="quality-slider"
              type="range"
              min="1"
              max="100"
              value={Math.round(options.quality * 100)}
              onChange={(e) => update({ quality: parseInt(e.target.value) / 100 })}
              className="slider"
            />
            <div className="slider-labels">
              <span>Smaller file</span>
              <span>Better quality</span>
            </div>
          </div>
        )}

        {/* Target size */}
        {options.mode === 'target-size' && (
          <div className="field">
            <label className="field__label" htmlFor="target-size-input">
              Target Size (KB)
            </label>
            <input
              id="target-size-input"
              type="number"
              min="10"
              max="10000"
              value={options.targetSizeKB ?? 200}
              onChange={(e) =>
                update({ targetSizeKB: Math.max(10, parseInt(e.target.value) || 200) })
              }
              className="input"
            />
            {originalSize && (
              <p className="field__hint">
                Original: {(originalSize / 1024).toFixed(1)} KB. Binary search finds the best quality at or under your target.
              </p>
            )}

            {/* Binary search steps visualization */}
            {binarySearchSteps.length > 0 && (
              <div className="binary-search">
                <button
                  className="binary-search__toggle"
                  onClick={() => setShowSteps((s) => !s)}
                >
                  {showSteps ? '▲' : '▼'} Search steps ({binarySearchSteps.length})
                </button>
                {showSteps && (
                  <div className="binary-search__steps">
                    {binarySearchSteps.map((step, i) => (
                      <div key={i} className="binary-search__step">
                        <span className="step-num">#{step.iteration}</span>
                        <span>Q: {Math.round(step.quality * 100)}%</span>
                        <span>→ {(step.sizeBytes / 1024).toFixed(1)} KB</span>
                        <span
                          className={`step-result ${step.sizeBytes <= (options.targetSizeKB ?? 200) * 1024 ? 'step-result--ok' : 'step-result--over'}`}
                        >
                          {step.sizeBytes <= (options.targetSizeKB ?? 200) * 1024 ? '✓' : '✗'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Output format */}
        <div className="field">
          <label className="field__label">Output Format</label>
          <div className="tab-group">
            {(['image/jpeg', 'image/webp'] as OutputFormat[]).map((fmt) => (
              <button
                key={fmt}
                id={`compress-format-${fmt.replace('image/', '')}`}
                className={`tab${options.outputFormat === fmt ? ' tab--active' : ''}`}
                onClick={() => update({ outputFormat: fmt })}
              >
                {fmt.replace('image/', '').toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompressorPanel;
