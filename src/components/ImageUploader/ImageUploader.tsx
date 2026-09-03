import React, { useCallback, useRef, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';

interface ImageUploaderProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  multiple?: boolean;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPTED_EXTENSIONS = '.jpg,.jpeg,.png,.webp';

const ImageUploader: React.FC<ImageUploaderProps> = ({
  onFilesSelected,
  disabled = false,
  multiple = true,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList).filter((f) =>
        ACCEPTED_TYPES.includes(f.type) ||
        /\.(jpg|jpeg|png|webp)$/i.test(f.name)
      );
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [onFilesSelected]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (disabled) return;
      const { files } = e.dataTransfer;
      if (files && files.length > 0) {
        processFiles(files);
      }
    },
    [disabled, processFiles]
  );

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files);
        // Reset input so the same file can be re-selected
        e.target.value = '';
      }
    },
    [processFiles]
  );

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div
      className={`uploader${isDragging ? ' uploader--dragging' : ''}${disabled ? ' uploader--disabled' : ''}`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Upload images by clicking or dragging files here"
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
      id="image-uploader"
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        multiple={multiple}
        onChange={handleInputChange}
        className="uploader__input"
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="uploader__content">
        <div className="uploader__icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="48" height="48" rx="12" fill="currentColor" fillOpacity="0.08"/>
            <path d="M24 16V32M16 24H32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M14 36H34M12 28C10 25 10 21 12 18C14 15 17 13 20 13C21 11 23 10 24 10C25 10 27 11 28 13C31 13 34 15 36 18C38 21 38 25 36 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
        <div className="uploader__text">
          <p className="uploader__headline">
            {isDragging ? 'Drop your images here' : 'Drag & drop images here'}
          </p>
          <p className="uploader__subtext">
            or <span className="uploader__link">click to browse</span>
          </p>
        </div>
        <div className="uploader__formats">
          <span>JPG</span>
          <span>PNG</span>
          <span>WebP</span>
          {multiple && <span className="uploader__multi">· Multiple files supported</span>}
        </div>
      </div>
    </div>
  );
};

export default ImageUploader;
