import React from 'react';
import type { CompressionOptions } from '../../types/image.types';
import type { EnhancementOptions } from '../../types/enhancement.types';

export type Pipeline = 'compress-only' | 'enhance-only' | 'enhance-then-compress';

interface OutputSettingsProps {
  pipeline: Pipeline;
  onPipelineChange: (p: Pipeline) => void;
  compressionOptions: CompressionOptions;
  onCompressionChange: (o: CompressionOptions) => void;
  enhancementOptions: EnhancementOptions;
  onEnhancementChange: (o: EnhancementOptions) => void;
}

const PIPELINE_OPTIONS: { value: Pipeline; label: string; desc: string }[] = [
  {
    value: 'compress-only',
    label: 'Compress Only',
    desc: 'Reduce file size using Canvas API quality control.',
  },
  {
    value: 'enhance-only',
    label: 'AI Enhance Only',
    desc: 'AI-upscale with Real-ESRGAN (4×), then fit to target resolution.',
  },
  {
    value: 'enhance-then-compress',
    label: 'Enhance → Compress',
    desc: 'Recommended. AI-upscale first, then compress for optimal quality.',
  },
];

const OutputSettings: React.FC<OutputSettingsProps> = ({
  pipeline,
  onPipelineChange,
}) => {
  return (
    <div className="output-settings">
      <h3 className="output-settings__title">Processing Pipeline</h3>
      <div className="pipeline-options">
        {PIPELINE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`pipeline-option${pipeline === opt.value ? ' pipeline-option--active' : ''}`}
            htmlFor={`pipeline-${opt.value}`}
          >
            <input
              type="radio"
              id={`pipeline-${opt.value}`}
              name="pipeline"
              value={opt.value}
              checked={pipeline === opt.value}
              onChange={() => onPipelineChange(opt.value)}
              className="pipeline-option__radio"
            />
            <div className="pipeline-option__content">
              <span className="pipeline-option__label">{opt.label}</span>
              {pipeline === opt.value && opt.value === 'enhance-then-compress' && (
                <span className="pipeline-option__recommended">Recommended</span>
              )}
              <span className="pipeline-option__desc">{opt.desc}</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
};

export default OutputSettings;
