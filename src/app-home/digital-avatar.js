"use client";

import { useEffect, useRef, useState } from "react";

const GREETING_DURATION_MS = 2800;

export function DigitalAvatar() {
  const [interactionNumber, setInteractionNumber] = useState(0);
  const [isGreetingVisible, setIsGreetingVisible] = useState(false);
  const hideGreetingTimerRef = useRef(null);

  useEffect(() => () => {
    if (hideGreetingTimerRef.current !== null) {
      window.clearTimeout(hideGreetingTimerRef.current);
    }
  }, []);

  function handleInteraction() {
    if (hideGreetingTimerRef.current !== null) {
      window.clearTimeout(hideGreetingTimerRef.current);
    }

    setInteractionNumber((currentNumber) => currentNumber + 1);
    setIsGreetingVisible(true);
    hideGreetingTimerRef.current = window.setTimeout(() => {
      setIsGreetingVisible(false);
      hideGreetingTimerRef.current = null;
    }, GREETING_DURATION_MS);
  }

  return (
    <aside className="digital-avatar-dock" aria-label="智能服务数字人">
      {isGreetingVisible ? (
        <div className="digital-avatar-speech" role="status">
          您好，很高兴为您服务！
        </div>
      ) : null}

      <button
        type="button"
        className="digital-avatar-button"
        onClick={handleInteraction}
        aria-label="和智能服务数字人打招呼"
      >
        <span
          className={`digital-avatar-figure ${interactionNumber > 0 ? "is-interacting" : ""}`}
          key={interactionNumber}
          aria-hidden="true"
        >
          <svg viewBox="0 0 160 215" role="img">
            <title>智能服务员</title>
            <ellipse className="avatar-shadow" cx="80" cy="201" rx="38" ry="8" fill="#253d55" opacity="0.16" />

            <g className="avatar-character">
              <rect x="57" y="161" width="18" height="32" rx="8" fill="#273f5d" />
              <rect x="85" y="161" width="18" height="32" rx="8" fill="#273f5d" />
              <ellipse cx="64" cy="194" rx="16" ry="7" fill="#182b40" />
              <ellipse cx="98" cy="194" rx="16" ry="7" fill="#182b40" />

              <path
                className="avatar-left-arm"
                d="M51 105 C36 113 33 132 39 149"
                fill="none"
                stroke="#f3c5a7"
                strokeWidth="14"
                strokeLinecap="round"
              />
              <circle cx="40" cy="151" r="8" fill="#f3c5a7" />

              <g className="avatar-wave-arm">
                <path
                  d="M109 105 C125 113 129 129 130 145"
                  fill="none"
                  stroke="#f3c5a7"
                  strokeWidth="14"
                  strokeLinecap="round"
                />
                <circle cx="130" cy="147" r="8" fill="#f3c5a7" />
                <path d="M126 145 L123 151 M130 144 L129 152 M134 145 L136 151" stroke="#d99c7d" strokeWidth="1.8" strokeLinecap="round" />
              </g>

              <path
                className="avatar-uniform"
                d="M51 94 C61 87 70 84 80 84 C91 84 101 87 110 94 L116 162 C95 173 64 173 44 162 Z"
                fill="#2c668f"
              />
              <path d="M58 92 L80 113 L102 92 L95 88 L80 99 L65 88 Z" fill="#f6fbff" />
              <path d="M80 99 L87 108 L82 145 L78 145 L73 108 Z" fill="#f0ad4e" />
              <path d="M51 117 C68 124 93 124 111 117" fill="none" stroke="#5790b5" strokeWidth="2" />
              <rect x="91" y="119" width="16" height="11" rx="2.5" fill="#ffffff" opacity="0.94" />
              <circle cx="95" cy="123" r="2" fill="#2d8d91" />
              <path d="M99 123 H104 M99 126 H103" stroke="#6c8799" strokeWidth="1.3" strokeLinecap="round" />

              <rect x="70" y="79" width="20" height="16" rx="8" fill="#efb797" />
              <circle cx="49" cy="58" r="9" fill="#f3c5a7" />
              <circle cx="111" cy="58" r="9" fill="#f3c5a7" />
              <rect x="49" y="23" width="62" height="70" rx="29" fill="#f3c5a7" />
              <path
                d="M50 52 C48 31 61 17 81 17 C103 17 113 32 110 53 C103 45 98 36 96 29 C84 40 67 46 50 52 Z"
                fill="#26384d"
              />
              <path d="M53 49 C50 35 58 21 71 18 C60 30 61 40 64 48 Z" fill="#1e3044" />

              <g className="avatar-eyes">
                <ellipse cx="68" cy="59" rx="3.4" ry="4.2" fill="#24374a" />
                <ellipse cx="92" cy="59" rx="3.4" ry="4.2" fill="#24374a" />
                <circle cx="69" cy="58" r="1" fill="#ffffff" />
                <circle cx="93" cy="58" r="1" fill="#ffffff" />
              </g>
              <path d="M63 50 Q68 47 73 50 M87 50 Q92 47 97 50" fill="none" stroke="#735448" strokeWidth="2" strokeLinecap="round" />
              <path d="M80 60 Q77 68 81 69" fill="none" stroke="#d99c7d" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M70 76 Q80 84 90 76" fill="#ffffff" stroke="#c67e71" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="59" cy="70" r="4" fill="#ef9d9d" opacity="0.34" />
              <circle cx="101" cy="70" r="4" fill="#ef9d9d" opacity="0.34" />

              <path d="M58 24 Q80 4 103 24" fill="#2c668f" />
              <path d="M57 25 Q80 14 104 25 L101 31 Q80 24 60 31 Z" fill="#214e70" />
              <circle cx="80" cy="22" r="4" fill="#f0ad4e" />
            </g>
          </svg>
        </span>
        <span className="digital-avatar-hint">点我打招呼</span>
      </button>

      <style jsx>{`
        .digital-avatar-dock {
          position: fixed;
          right: max(24px, calc((100vw - 1080px) / 2 - 144px));
          bottom: 26px;
          z-index: 30;
          width: 128px;
          pointer-events: none;
        }

        .digital-avatar-speech {
          position: absolute;
          right: 0;
          bottom: 174px;
          width: 188px;
          border: 1px solid #d8e6ed;
          border-radius: 16px 16px 4px 16px;
          padding: 11px 13px;
          background: rgba(255, 255, 255, 0.96);
          color: #2b4559;
          font-size: 13px;
          line-height: 1.5;
          text-align: center;
          box-shadow: 0 12px 30px rgba(35, 64, 88, 0.15);
          animation: speech-appear 220ms ease-out both;
          pointer-events: none;
        }

        .digital-avatar-speech::after {
          content: "";
          position: absolute;
          right: 15px;
          bottom: -8px;
          width: 14px;
          height: 14px;
          border-right: 1px solid #d8e6ed;
          border-bottom: 1px solid #d8e6ed;
          background: #ffffff;
          transform: rotate(45deg);
        }

        .digital-avatar-button {
          width: 128px;
          height: 184px;
          padding: 0;
          border: 0;
          border-radius: 24px;
          background: transparent;
          color: inherit;
          cursor: pointer;
          pointer-events: auto;
          -webkit-tap-highlight-color: transparent;
        }

        .digital-avatar-button:focus-visible {
          outline: 3px solid rgba(45, 141, 145, 0.44);
          outline-offset: 4px;
        }

        .digital-avatar-figure {
          display: block;
          width: 128px;
          height: 172px;
          transform-origin: center bottom;
          animation: avatar-idle 3.8s ease-in-out infinite;
          filter: drop-shadow(0 12px 12px rgba(32, 55, 76, 0.11));
        }

        .digital-avatar-figure svg {
          display: block;
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        .digital-avatar-figure.is-interacting {
          animation: avatar-hop 720ms cubic-bezier(0.22, 0.78, 0.24, 1) both, avatar-idle 3.8s ease-in-out 720ms infinite;
        }

        .avatar-character {
          transform-origin: center bottom;
          animation: avatar-breathe 3.1s ease-in-out infinite;
        }

        .avatar-eyes {
          transform-box: fill-box;
          transform-origin: center;
          animation: avatar-blink 4.8s ease-in-out infinite;
        }

        .avatar-shadow {
          transform-box: fill-box;
          transform-origin: center;
          animation: shadow-breathe 3.8s ease-in-out infinite;
        }

        .avatar-wave-arm {
          transform-box: view-box;
          transform-origin: 109px 105px;
        }

        .is-interacting .avatar-wave-arm {
          animation: avatar-wave 720ms ease-in-out both;
        }

        .digital-avatar-hint {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 24px;
          margin-top: -12px;
          border: 1px solid #dbe7ed;
          border-radius: 999px;
          padding: 4px 10px;
          background: rgba(255, 255, 255, 0.94);
          color: #5e7789;
          font-size: 11px;
          box-shadow: 0 6px 16px rgba(35, 64, 88, 0.1);
        }

        .digital-avatar-button:hover .digital-avatar-figure {
          filter: drop-shadow(0 15px 14px rgba(32, 55, 76, 0.17));
        }

        .digital-avatar-button:hover .digital-avatar-hint {
          border-color: #9fcfd0;
          color: #277d83;
        }

        @keyframes avatar-idle {
          0%, 100% {
            transform: translateY(0) rotate(-0.5deg);
          }
          50% {
            transform: translateY(-7px) rotate(0.7deg);
          }
        }

        @keyframes avatar-breathe {
          0%, 100% {
            transform: scaleY(1);
          }
          50% {
            transform: scaleY(1.012);
          }
        }

        @keyframes avatar-blink {
          0%, 44%, 48%, 100% {
            transform: scaleY(1);
          }
          46% {
            transform: scaleY(0.08);
          }
        }

        @keyframes shadow-breathe {
          0%, 100% {
            transform: scaleX(1);
            opacity: 0.16;
          }
          50% {
            transform: scaleX(0.84);
            opacity: 0.1;
          }
        }

        @keyframes avatar-hop {
          0%, 100% {
            transform: translateY(0) rotate(0);
          }
          32% {
            transform: translateY(-18px) rotate(-3deg);
          }
          58% {
            transform: translateY(-7px) rotate(3deg);
          }
          78% {
            transform: translateY(-12px) rotate(-1deg);
          }
        }

        @keyframes avatar-wave {
          0%, 100% {
            transform: rotate(0deg);
          }
          28% {
            transform: rotate(-76deg);
          }
          44% {
            transform: rotate(-58deg);
          }
          60% {
            transform: rotate(-78deg);
          }
          76% {
            transform: rotate(-60deg);
          }
        }

        @keyframes speech-appear {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @media (max-width: 1320px) {
          .digital-avatar-dock {
            right: 18px;
            bottom: 198px;
            width: 104px;
          }

          .digital-avatar-button,
          .digital-avatar-figure {
            width: 104px;
          }

          .digital-avatar-button {
            height: 152px;
          }

          .digital-avatar-figure {
            height: 142px;
          }

          .digital-avatar-speech {
            bottom: 146px;
          }
        }

        @media (max-width: 720px) {
          .digital-avatar-dock {
            right: 8px;
            bottom: 190px;
            width: 78px;
          }

          .digital-avatar-button,
          .digital-avatar-figure {
            width: 78px;
          }

          .digital-avatar-button {
            height: 112px;
          }

          .digital-avatar-figure {
            height: 108px;
          }

          .digital-avatar-hint {
            display: none;
          }

          .digital-avatar-speech {
            right: 2px;
            bottom: 112px;
            width: 158px;
            font-size: 12px;
          }
        }

        @media (max-width: 420px) {
          .digital-avatar-dock {
            bottom: 238px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .digital-avatar-figure,
          .digital-avatar-figure.is-interacting,
          .avatar-character,
          .avatar-eyes,
          .avatar-shadow,
          .is-interacting .avatar-wave-arm,
          .digital-avatar-speech {
            animation: none;
          }
        }
      `}</style>
    </aside>
  );
}
