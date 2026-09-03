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
    // Don't call e.preventDefault() here — it's in a passive listener context;
    // we rely on touch-action:none on the container instead
    setIsDragging(true);
    updatePosition(e.touches[0].clientX);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => updatePosition(e.clientX);
    const handleTouchMove = (e: TouchEvent) => {
      // Passive listener — cannot call preventDefault, but touch-action:none on
      // the container element prevents scroll interference
      updatePosition(e.touches[0].clientX);
    };
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
    /*
     * CLS note: the container is sized by aspect-ratio in CSS (16/9 or 4/3 on mobile),
     * so the layout slot is reserved before images load — no layout shift.
     * touch-action:none is set via CSS to prevent scroll interference during drag.
     */
    <div className="ba-slider" ref={containerRef} aria-label="Before/After image comparison">
      {/* After image — full width background layer */}
      <div className="ba-slider__after">
        <img
          src={afterUrl}
          alt={afterLabel}
          className="ba-slider__img"
          draggable={false}
          // width/height are not set because dimensions vary per image;
          // CLS is prevented by the aspect-ratio on the container instead
          aria-hidden="true"
        />
        <span className="ba-slider__label ba-slider__label--after" aria-hidden="true">
          {afterLabel}
        </span>
      </div>

      {/* Before image — clipped to the left of the handle position */}
      <div
        className="ba-slider__before"
        style={{ width: `${position}%` }}
        aria-hidden="true"
      >
        {/*
         * The before-image must always render at the FULL container width
         * (not the clipped width). The parent div clips via overflow:hidden.
         * We use 100vw as a safe upper bound and let object-fit:contain handle
         * the actual image scaling within the rendered box.
         */}
        <img
          src={beforeUrl}
          alt={beforeLabel}
          className="ba-slider__img ba-slider__img--before"
          draggable={false}
        />
        <span className="ba-slider__label ba-slider__label--before" aria-hidden="true">
          {beforeLabel}
        </span>
      </div>

      {/* Drag handle */}
      <div
        className={`ba-slider__handle${isDragging ? ' ba-slider__handle--active' : ''}`}
        style={{ left: `${position}%` }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        role="slider"
        aria-label="Drag to compare before and after. Use arrow keys to adjust."
        aria-valuenow={Math.round(position)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${Math.round(position)}% before, ${100 - Math.round(position)}% after`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setPosition((p) => Math.max(0, p - 2));
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            setPosition((p) => Math.min(100, p + 2));
          }
          if (e.key === 'Home') { e.preventDefault(); setPosition(0); }
          if (e.key === 'End')  { e.preventDefault(); setPosition(100); }
        }}
      >
        <div className="ba-slider__handle-circle">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M7 10L4 7M4 7L7 4M4 7H16M13 10L16 13M16 13L13 16M16 13H4"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="ba-slider__line" />
      </div>
    </div>
  );
};

export default BeforeAfterSlider;
