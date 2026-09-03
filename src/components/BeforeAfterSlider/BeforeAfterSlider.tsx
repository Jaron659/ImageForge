import React, { useCallback, useEffect, useRef, useState } from 'react';

interface BeforeAfterSliderProps {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
}

const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({
  beforeUrl,
  afterUrl,
  beforeLabel = 'Original',
  afterLabel = 'AI-Upscaled',
}) => {
  const [position, setPosition] = useState(50); // 0-100
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition((x / rect.width) * 100);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updatePosition(e.clientX);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    updatePosition(e.touches[0].clientX);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => updatePosition(e.clientX);
    const handleTouchMove = (e: TouchEvent) => updatePosition(e.touches[0].clientX);
    const stopDrag = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', stopDrag);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', stopDrag);
    };
  }, [isDragging, updatePosition]);

  return (
    <div className="ba-slider" ref={containerRef}>
      {/* After image (full width) */}
      <div className="ba-slider__after">
        <img src={afterUrl} alt={afterLabel} className="ba-slider__img" draggable={false} />
        <span className="ba-slider__label ba-slider__label--after">{afterLabel}</span>
      </div>

      {/* Before image (clipped to left of position) */}
      <div
        className="ba-slider__before"
        style={{ width: `${position}%` }}
      >
        <img
          src={beforeUrl}
          alt={beforeLabel}
          className="ba-slider__img"
          style={{ width: containerRef.current ? `${containerRef.current.offsetWidth}px` : '100%' }}
          draggable={false}
        />
        <span className="ba-slider__label ba-slider__label--before">{beforeLabel}</span>
      </div>

      {/* Drag handle */}
      <div
        className={`ba-slider__handle${isDragging ? ' ba-slider__handle--active' : ''}`}
        style={{ left: `${position}%` }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        role="slider"
        aria-label="Before/After comparison slider"
        aria-valuenow={Math.round(position)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setPosition((p) => Math.max(0, p - 2));
          if (e.key === 'ArrowRight') setPosition((p) => Math.min(100, p + 2));
        }}
      >
        <div className="ba-slider__handle-circle">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M7 10L4 7M4 7L7 4M4 7H16M13 10L16 13M16 13L13 16M16 13H4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className="ba-slider__line" />
      </div>
    </div>
  );
};

export default BeforeAfterSlider;
