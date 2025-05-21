
"use client";

import type { ReactNode } from 'react'; // Keep for potential future use if props are re-added
import React, { useRef, useEffect, useState } from 'react';

// Minimal props for this test, matching what PlatformerPage might still pass
interface GameCanvasProps {
  levelPath: string; // Kept for prop consistency, but not used in this minimal version
  onPlayerAction?: (action: any) => void; // Kept for prop consistency
  playerRef?: React.MutableRefObject<any | null>; // Kept for prop consistency
  executeAction?: any | null; // Kept for prop consistency
  resetExecuteAction?: () => void; // Kept for prop consistency
}

export default function GameCanvas({ levelPath }: GameCanvasProps) {
  const [isClient, setIsClient] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Effect 1: Set isClient
    console.log("[GameCanvas Minimal] Effect 1: setIsClient(true) will be called.");
    setIsClient(true);
  }, []);

  useEffect(() => {
    // Effect 2: Basic canvas drawing test
    if (!isClient) {
      console.log("[GameCanvas Minimal] Effect 2: Not client yet, returning.");
      return;
    }
    if (!canvasRef.current) {
      console.log("[GameCanvas Minimal] Effect 2: Canvas ref not available yet, returning.");
      return;
    }

    console.log("[GameCanvas Minimal] Effect 2: Attempting to draw on canvas.");
    const canvas = canvasRef.current;
    // Explicitly set canvas dimensions for this test.
    // In a real scenario, these would come from parent or calculations.
    canvas.width = 300;
    canvas.height = 150;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      console.log("[GameCanvas Minimal] Effect 2: Got 2D context. Drawing red rectangle.");
      ctx.fillStyle = 'red';
      ctx.fillRect(10, 10, 100, 50); // Draw a visible red rectangle
      console.log("[GameCanvas Minimal] Effect 2: Red rectangle drawn.");
    } else {
      console.error("[GameCanvas Minimal] Effect 2: Failed to get 2D context.");
    }
  }, [isClient]); // Depends only on isClient

  console.log(`[GameCanvas Minimal] Rendering. isClient: ${isClient}. Level path (prop): ${levelPath}`);

  if (!isClient) {
    // Important for dynamic imports with ssr:false, 
    // or to prevent server/client mismatch if not dynamically imported correctly.
    console.log("[GameCanvas Minimal] Not client yet, returning null for render (or a placeholder).");
    return <div className="w-full h-full flex items-center justify-center bg-muted/20"><p>GameCanvas waiting for client...</p></div>; // Placeholder for SSR or pre-client
  }

  // Render the canvas once isClient is true
  return (
    <canvas 
      ref={canvasRef} 
      className="border-4 border-blue-500 w-full h-full" // Basic styling to see the canvas
      // Explicit width/height attributes are set by useEffect
    >
      Your browser does not support the HTML5 canvas tag.
    </canvas>
  );
}
