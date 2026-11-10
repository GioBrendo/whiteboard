import React from 'react';

export default function RemoteCursors({ cursors, zoom, panOffset, currentUserId }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
      {Object.entries(cursors).map(([socketId, data]) => {
        if (socketId === currentUserId || !data || data.x === undefined) return null;

        // Convert canvas world coordinates to current viewport screen coordinates
        const screenX = data.x * zoom + panOffset.x;
        const screenY = data.y * zoom + panOffset.y;

        // Skip if offscreen
        if (
          screenX < -50 ||
          screenY < -50 ||
          screenX > window.innerWidth + 50 ||
          screenY > window.innerHeight + 50
        ) {
          return null;
        }

        const color = data.color || '#3b82f6';
        const name = data.name || 'Convidado';

        return (
          <div
            key={socketId}
            style={{
              transform: `translate3d(${screenX}px, ${screenY}px, 0)`,
              transition: 'transform 0.08s ease-out'
            }}
            className="absolute top-0 left-0 flex flex-col items-start pointer-events-none select-none will-change-transform"
          >
            {/* Custom SVG cursor */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              className="drop-shadow-sm -translate-x-1 -translate-y-1"
            >
              <path
                d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z"
                fill={color}
                stroke="white"
                strokeWidth="1.5"
              />
            </svg>

            {/* User name tag */}
            <div
              style={{ backgroundColor: color }}
              className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-white shadow-md shadow-black/10 ml-3 -mt-1 whitespace-nowrap"
            >
              {name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
