
"use client";

import React, { useEffect, useState, useRef } from 'react';

interface GameCanvasProps {
  levelPath: string;
  // Temporarily remove other props for stability testing
  // onPlayerAction: (action: GameAction) => void;
  // playerRef: React.MutableRefObject<PlayerState | null>;
  // executeAction: GameAction | null;
  // resetExecuteAction: () => void;
}

export default function GameCanvas({ levelPath }: GameCanvasProps) {
  const [isMountedClient, setIsMountedClient] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  console.log(`[GameCanvas Simplified Step 1] Component body. levelPath: ${levelPath}. isMountedClient: ${isMountedClient}`);

  useEffect(() => {
    console.log("[GameCanvas Simplified Step 1] Effect to set isMountedClient and get context running.");
    setIsMountedClient(true);
    if (canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        ctxRef.current = context;
        context.fillStyle = 'blue';
        context.fillRect(20, 20, 100, 50); // Draw a blue rectangle
        console.log("[GameCanvas Simplified Step 1] Canvas context obtained and test rectangle drawn.");
      } else {
        console.error("[GameCanvas Simplified Step 1] Failed to get 2D context.");
      }
    } else {
        console.log("[GameCanvas Simplified Step 1] canvasRef.current is null in useEffect.");
    }
  }, []); // Empty dependency array ensures this runs once on mount

  if (!isMountedClient) {
    console.log("[GameCanvas Simplified Step 1] Rendering pre-mount message because isMountedClient is false.");
    return (
      <div className="w-full h-full flex items-center justify-center bg-yellow-100 text-yellow-700">
        <p>GameCanvas: Waiting for client mount (Step 1)...</p>
      </div>
    );
  }

  console.log("[GameCanvas Simplified Step 1] Rendering canvas element.");
  return (
    <canvas 
      ref={canvasRef} 
      width={300} // Fixed size for now
      height={150} // Fixed size for now
      className="border-4 border-green-500" // Visible border
    ></canvas>
  );
}
