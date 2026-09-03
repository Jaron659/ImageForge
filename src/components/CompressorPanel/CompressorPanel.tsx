import React, { useState } from 'react';
import type { BinarySearchStep, CompressionOptions, OutputFormat } from '../../types/image.types';

interface CompressorPanelProps {
  options: CompressionOptions;
  onChange: (opts: CompressionOptions) => void;
  binarySearchSteps?: BinarySearchStep[];
  originalSize?: number;
}

const TARGET_PRESETS = [
  { label: '20 KB', value: 20 },
  { label: '50 KB', value: 50 },
  { label: '100 KB', value: 100 },
  { label: '200 KB', value: 200 },
  { label: '500 KB', value: 500 },
  { label: '1 MB', value: 1000 },
];

const CompressorPanel: React.FC<CompressorPanelProps> = ({
  options,
  onChange,
  binarySearchSteps = [],
  originalSize,
}) => {
  const [showSteps, setShowSteps] = useState(false);

  const update = (partial: Partial<CompressionOptions>) =>
    onChange({ ...options, mode: 'target-size', ...partial });

  const currentTargetKB = options.targetSizeKB ?? 50;

  return (
    <div className="panel">
      <div className="panel__header">
        <div className="panel__icon panel__icon--compress">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 8H14M8 2V14M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <h2 className="panel__title">Target File Size</h2>
      </div>

      <div className="panel__body">
        {/* Target Size Presets & Custom Input */}
        <div className="field">
          <label className="field__label" htmlFor="target-size-input">
            Target Max Size
            <span className="field__value">{currentTargetKB} KB</span>
          </label>

          {/* Quick Preset Buttons */}
          <div
            className="preset-group"
            style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}
          >
            {TARGET_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                id={`preset-${preset.value}kb`}
                className={`tab tab--sm${currentTargetKB === preset.value ? ' tab--active' : ''}`}
                onClick={() => update({ targetSizeKB: preset.value })}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom Size Input */}
          <div className="input-with-unit" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              id="target-size-input"
              type="number"
              min="5"
              max="50000"
              value={currentTargetKB}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                update({ targetSizeKB: isNaN(val) ? 50 : Math.max(1, val) });
              }}
              className="input"
              placeholder="e.g. 50"
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: '0.85rem', color: 'var(--clr-text-muted)', fontWeight: 600 }}>KB</span>
          </div>

          {originalSize && (
            <p className="field__hint">
              Original size: {(originalSize / 1024).toFixed(1)} KB. The optimizer automatically adjusts compression and dimensions behind the scenes to strictly meet ≤ {currentTargetKB} KB at maximum visual quality.
            </p>
          )}

          {/* Binary search step breakdown */}
          {binarySearchSteps.length > 0 && (
            <div className="binary-search" style={{ marginTop: '10px' }}>
              <button
                type="button"
                className="binary-search__toggle"
                onClick={() => setShowSteps((s) => !s)}
              >
                {showSteps ? '▲ Hide' : '▼ View'} optimization steps ({binarySearchSteps.length})
              </button>
              {showSteps && (
                <div className="binary-search__steps">
                  {binarySearchSteps.map((step, i) => (
                    <div key={i} className="binary-search__step">
                      <span className="step-num">#{step.iteration}</span>
                      <span>Quality: {Math.round(step.quality * 100)}%</span>
                      <span>→ {(step.sizeBytes / 1024).toFixed(1)} KB</span>
                      <span
                        className={`step-result ${
                          step.sizeBytes <= currentTargetKB * 1024 ? 'step-result--ok' : 'step-result--over'
                        }`}
                      >
                        {step.sizeBytes <= currentTargetKB * 1024 ? '✓ OK' : '✗ Over'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

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
