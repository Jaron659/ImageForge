import React from 'react';

interface HeaderProps {
  batchCount?: number;
}

const Header: React.FC<HeaderProps> = ({ batchCount = 0 }) => {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-brand">
          <div className="header-logo">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="28" height="28" rx="8" fill="url(#logoGrad)"/>
              <path d="M7 18L11 12L14 15L17 9L21 18H7Z" fill="white" fillOpacity="0.9"/>
              <circle cx="19" cy="10" r="2" fill="#A78BFA"/>
              <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6D28D9"/>
                  <stop offset="1" stopColor="#2563EB"/>
                </linearGradient>
              </defs>
            </svg>
            <h1 className="header-title">ImageForge</h1>
          </div>
          <span className="header-tagline">Client-side image compression &amp; AI upscaling</span>
        </div>

        <div className="header-badges">
          <span className="badge badge-privacy">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M6 0L1 2.5V6c0 3 2.5 5.5 5 6 2.5-.5 5-3 5-6V2.5L6 0z"/>
            </svg>
            100% Local
          </span>
          <span className="badge badge-ai">AI-Powered</span>
          {batchCount > 1 && (
            <span className="badge badge-batch">{batchCount} images</span>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
