
"use client";

import React, { useState, useEffect, useRef } from 'react';

// Props for the simplified version (adjust if DynamicGameCanvas passes more that cause issues)
interface GameCanvasProps {
  levelPath: string;
  playerRef?: React.MutableRefObject<any | null>; // Keep essential props to avoid breaking PlatformerPage
  executeAction?: any | null;
  resetExecuteAction?: () => void;
}

export default function GameCanvas({ levelPath }: GameCanvasProps) {
  const [internalLoading, setInternalLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  console.log('[GameCanvas Simplified] Component body. LevelPath:', levelPath);

  useEffect(() => {
    console.log('[GameCanvas Simplified] Mount useEffect running.');
    // Simulate loading process
    const timer = setTimeout(() => {
      console.log('[GameCanvas Simplified] Setting internalLoading to false.');
      setInternalLoading(false);
    }, 500); // Simulate some loading time

    return () => clearTimeout(timer);
  }, []); // Runs once on mount

  useEffect(() => {
    if (!internalLoading && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        console.log('[GameCanvas Simplified] Drawing simple rectangle.');
        ctx.clearRect(0,0, canvas.width, canvas.height);
        ctx.fillStyle = 'red';
        ctx.fillRect(20, 20, 100, 50);
        ctx.font = "12px Arial";
        ctx.fillStyle = "black";
        ctx.fillText("Simplified Canvas OK", 25, 45);
      }
    }
  }, [internalLoading]);


  if (internalLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-blue-100">
        <p className="text-blue-700">GameCanvas: Internal Loading Test...</p>
      </div>
    );
  }

  console.log('[GameCanvas Simplified] Rendering canvas element.');
  return (
    <canvas
      ref={canvasRef}
      width={300} // Fixed small size for testing
      height={150}
      className="border-4 border-green-500 bg-white" // Visible border and background
    />
  );
}
