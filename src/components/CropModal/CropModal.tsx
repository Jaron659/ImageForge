import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ImageMetadata } from '../../types/image.types';
import { loadImageFromUrl, canvasToBlob } from '../../utils/image.util';

interface CropModalProps {
  image: ImageMetadata;
  isOpen: boolean;
  onClose: () => void;
  onApplyCrop: (croppedBlob: Blob, newWidth: number, newHeight: number) => void;
}

type AspectPreset = 'free' | '1:1' | '4:3' | '16:9';

export const CropModal: React.FC<CropModalProps> = ({
  image,
  isOpen,
  onClose,
  onApplyCrop,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState<AspectPreset>('free');

  // Crop box normalized coords (0 to 1 relative to displayed image)
  const [crop, setCrop] = useState({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragHandle, setDragHandle] = useState<string | null>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initialCrop: typeof crop }>({
    mouseX: 0,
    mouseY: 0,
    initialCrop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  });

  // Calculate rendered image dimensions in container
  useEffect(() => {
    if (!isOpen) return;

    const imgAspect = image.width / image.height;
    const maxW = Math.min(window.innerWidth * 0.75, 700);
    const maxH = Math.min(window.innerHeight * 0.55, 480);

    let w = maxW;
    let h = maxW / imgAspect;

    if (h > maxH) {
      h = maxH;
      w = maxH * imgAspect;
    }

    setDisplaySize({ width: w, height: h });
    setCrop({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
  }, [isOpen, image.width, image.height]);

  // Set aspect ratio preset
  const handleAspectChange = (newAspect: AspectPreset) => {
    setAspect(newAspect);
    if (newAspect === 'free') return;

    let targetRatio = 1;
    if (newAspect === '1:1') targetRatio = 1;
    else if (newAspect === '4:3') targetRatio = 4 / 3;
    else if (newAspect === '16:9') targetRatio = 16 / 9;

    // Convert pixel aspect ratio to normalized crop aspect ratio
    const imgRatio = image.width / image.height;
    const normalizedRatio = targetRatio / imgRatio;

    let newW = 0.8;
    let newH = newW / normalizedRatio;

    if (newH > 0.9) {
      newH = 0.9;
      newW = newH * normalizedRatio;
    }

    const newX = (1 - newW) / 2;
    const newY = (1 - newH) / 2;
    setCrop({ x: Math.max(0, newX), y: Math.max(0, newY), width: newW, height: newH });
  };

  const handleMouseDown = (e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    setIsDragging(true);
    setDragHandle(handle);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialCrop: { ...crop },
    };
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !displaySize.width || !displaySize.height) return;

      const dx = (e.clientX - dragStartRef.current.mouseX) / displaySize.width;
      const dy = (e.clientY - dragStartRef.current.mouseY) / displaySize.height;
      const init = dragStartRef.current.initialCrop;

      if (dragHandle === 'move') {
        const nextX = Math.max(0, Math.min(1 - init.width, init.x + dx));
        const nextY = Math.max(0, Math.min(1 - init.height, init.y + dy));
        setCrop((prev) => ({ ...prev, x: nextX, y: nextY }));
      } else if (dragHandle === 'se') {
        // Bottom-right handle
        const nextW = Math.max(0.1, Math.min(1 - init.x, init.width + dx));
        let nextH = Math.max(0.1, Math.min(1 - init.y, init.height + dy));

        if (aspect !== 'free') {
          const imgRatio = image.width / image.height;
          const targetRatio = aspect === '1:1' ? 1 : aspect === '4:3' ? 4 / 3 : 16 / 9;
          nextH = nextW / (targetRatio / imgRatio);
        }

        if (init.x + nextW <= 1 && init.y + nextH <= 1) {
          setCrop((prev) => ({ ...prev, width: nextW, height: nextH }));
        }
      } else if (dragHandle === 'nw') {
        // Top-left handle
        const nextX = Math.max(0, Math.min(init.x + init.width - 0.1, init.x + dx));
        const nextW = init.width + (init.x - nextX);
        const nextY = Math.max(0, Math.min(init.y + init.height - 0.1, init.y + dy));
        const nextH = init.height + (init.y - nextY);

        setCrop({ x: nextX, y: nextY, width: nextW, height: nextH });
      } else if (dragHandle === 'ne') {
        // Top-right handle
        const nextW = Math.max(0.1, Math.min(1 - init.x, init.width + dx));
        const nextY = Math.max(0, Math.min(init.y + init.height - 0.1, init.y + dy));
        const nextH = init.height + (init.y - nextY);

        setCrop({ x: init.x, y: nextY, width: nextW, height: nextH });
      } else if (dragHandle === 'sw') {
        // Bottom-left handle
        const nextX = Math.max(0, Math.min(init.x + init.width - 0.1, init.x + dx));
        const nextW = init.width + (init.x - nextX);
        const nextH = Math.max(0.1, Math.min(1 - init.y, init.height + dy));

        setCrop({ x: nextX, y: init.y, width: nextW, height: nextH });
      }
    },
    [isDragging, displaySize, dragHandle, aspect, image.width, image.height]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragHandle(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Compute exact pixel crop region
  const cropPixelX = Math.round(crop.x * image.width);
  const cropPixelY = Math.round(crop.y * image.height);
  const cropPixelW = Math.max(1, Math.round(crop.width * image.width));
  const cropPixelH = Math.max(1, Math.round(crop.height * image.height));

  const handleApply = async () => {
    try {
      const img = await loadImageFromUrl(image.objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = cropPixelW;
      canvas.height = cropPixelH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not acquire canvas context.');

      ctx.drawImage(
        img,
        cropPixelX,
        cropPixelY,
        cropPixelW,
        cropPixelH,
        0,
        0,
        cropPixelW,
        cropPixelH
      );

      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.95);
      onApplyCrop(blob, cropPixelW, cropPixelH);
      onClose();
    } catch (err) {
      console.error('Failed to crop image:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="crop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="crop-modal__header">
          <h3 className="crop-modal__title">Crop Image</h3>
          <button className="crop-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="crop-modal__body">
          {/* Aspect ratio presets */}
          <div className="crop-modal__presets">
            <span className="crop-modal__presets-label">Aspect Ratio:</span>
            {(['free', '1:1', '4:3', '16:9'] as AspectPreset[]).map((p) => (
              <button
                key={p}
                className={`tab tab--sm ${aspect === p ? 'tab--active' : ''}`}
                onClick={() => handleAspectChange(p)}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Crop preview container */}
          <div
            ref={containerRef}
            className="crop-container"
            style={{
              width: displaySize.width ? `${displaySize.width}px` : '100%',
              height: displaySize.height ? `${displaySize.height}px` : '320px',
            }}
          >
            <img
              src={image.objectUrl}
              alt={image.name}
              className="crop-container__img"
              draggable={false}
            />

            {/* Darkened overlay outside crop box */}
            <div
              className="crop-box"
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.width * 100}%`,
                height: `${crop.height * 100}%`,
              }}
              onMouseDown={(e) => handleMouseDown(e, 'move')}
            >
              {/* Corner Handles */}
              <div
                className="crop-handle crop-handle--nw"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleMouseDown(e, 'nw');
                }}
              />
              <div
                className="crop-handle crop-handle--ne"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleMouseDown(e, 'ne');
                }}
              />
              <div
                className="crop-handle crop-handle--sw"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleMouseDown(e, 'sw');
                }}
              />
              <div
                className="crop-handle crop-handle--se"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleMouseDown(e, 'se');
                }}
              />

              {/* Grid lines */}
              <div className="crop-grid">
                <div className="crop-grid__h1" />
                <div className="crop-grid__h2" />
                <div className="crop-grid__v1" />
                <div className="crop-grid__v2" />
              </div>
            </div>
          </div>

          <div className="crop-modal__info">
            <span>
              Selection: <strong>{cropPixelW} × {cropPixelH} px</strong>
            </span>
            <span className="crop-modal__info-orig">
              Original: {image.width} × {image.height} px
            </span>
          </div>
        </div>

        <div className="crop-modal__footer">
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={handleApply}>
            Apply Crop
          </button>
        </div>
      </div>
    </div>
  );
};

export default CropModal;
