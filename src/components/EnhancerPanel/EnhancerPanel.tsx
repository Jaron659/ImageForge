import React from 'react';
import type { EnhancementOptions, OutputResolution } from '../../types/enhancement.types';
import { RESOLUTION_SPECS } from '../../types/enhancement.types';
import { MODEL_CONFIG } from '../../models/model-config';

import { fitWithinResolution } from '../../utils/resolution.util';

interface EnhancerPanelProps {
  options: EnhancementOptions;
  onChange: (opts: EnhancementOptions) => void;
  inputWidth?: number;
  inputHeight?: number;
  modelAvailable?: boolean;
  showCompressionControls?: boolean;
}

const RESOLUTIONS: OutputResolution[] = ['480p', '720p', '1080p'];

const EnhancerPanel: React.FC<EnhancerPanelProps> = ({
  options,
  onChange,
  inputWidth,
  inputHeight,
  modelAvailable = true,
  showCompressionControls = true,
}) => {
  const update = (partial: Partial<EnhancementOptions>) =>
    onChange({ ...options, ...partial });

  const spec = RESOLUTION_SPECS[options.targetResolution];

  // Compute expected output dimensions matching actual pipeline logic (4x upscale then fit)
  let outW: number | null = null;
  let outH: number | null = null;
  if (inputWidth && inputHeight) {
    const fitted = fitWithinResolution(
      inputWidth * MODEL_CONFIG.UPSCALE_FACTOR,
      inputHeight * MODEL_CONFIG.UPSCALE_FACTOR,
      options.targetResolution
    );
    outW = fitted.width;
    outH = fitted.height;
  }

  return (
    <div className="panel">
      <div className="panel__header">
        <div className="panel__icon panel__icon--enhance">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L9.5 5.5H14L10.5 8L12 12.5L8 10L4 12.5L5.5 8L2 5.5H6.5L8 1Z" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.2"/>
          </svg>
        </div>
        <h2 className="panel__title">AI Enhance</h2>
        <span className="panel__badge">Real-ESRGAN · 4×</span>
      </div>

      {!modelAvailable && (
        <div className="alert alert--warn">
          <strong>Model file not found.</strong> Download <code>realesr-general-x4v3.onnx</code> from{' '}
          <a href={MODEL_CONFIG.SOURCE} target="_blank" rel="noopener noreferrer">
            HuggingFace
          </a>{' '}
          and place it at <code>public/models/realesr-general-x4v3.onnx</code>.
        </div>
      )}

      <div className="panel__body">
        <div className="model-info">
          <p className="model-info__name">realesr-general-x4v3</p>
          <p className="model-info__desc">
            SRVGGNetCompact architecture · {(MODEL_CONFIG.APPROX_SIZE_BYTES / 1e6).toFixed(1)} MB · {MODEL_CONFIG.LICENSE}
          </p>
          <p className="model-info__note">
            The model always produces a 4× upscale. A post-processing step then scales the result to your chosen output resolution.
          </p>
        </div>

        {/* Output resolution */}
        <div className="field">
          <label className="field__label">Output Resolution</label>
          <div className="tab-group">
            {RESOLUTIONS.map((res) => (
              <button
                key={res}
                id={`enhance-res-${res}`}
                className={`tab${options.targetResolution === res ? ' tab--active' : ''}`}
                onClick={() => update({ targetResolution: res })}
              >
                {res}
              </button>
            ))}
          </div>
          <p className="field__hint">
            Max {spec.maxWidth} × {spec.maxHeight} (16:9 reference, aspect ratio preserved)
            {outW && outH && ` · Your image: ${outW} × ${outH}`}
          </p>
        </div>

        {/* Post-compression (Only shown in standalone enhance mode) */}
        {showCompressionControls && (
          <>
            <div className="field">
              <label className="field__label field__label--checkbox">
                <input
                  type="checkbox"
                  checked={options.compress}
                  onChange={(e) => update({ compress: e.target.checked })}
                  id="enhance-compress-check"
                />
                Compress output after enhancing
              </label>
            </div>

            {options.compress && (
              <div className="field">
                <label className="field__label" htmlFor="enhance-quality-slider">
                  Output Quality
                  <span className="field__value">{Math.round((options.compressionQuality ?? 0.85) * 100)}%</span>
                </label>
                <input
                  id="enhance-quality-slider"
                  type="range"
                  min="30"
                  max="100"
                  value={Math.round((options.compressionQuality ?? 0.85) * 100)}
                  onChange={(e) => update({ compressionQuality: parseInt(e.target.value) / 100 })}
                  className="slider"
                />
              </div>
            )}

            {options.compress && (
              <div className="field">
                <label className="field__label">Format</label>
                <div className="tab-group">
                  {(['image/jpeg', 'image/webp'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      id={`enhance-fmt-${fmt.replace('image/', '')}`}
                      className={`tab${(options.outputFormat ?? 'image/jpeg') === fmt ? ' tab--active' : ''}`}
                      onClick={() => update({ outputFormat: fmt })}
                    >
                      {fmt.replace('image/', '').toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default EnhancerPanel;
