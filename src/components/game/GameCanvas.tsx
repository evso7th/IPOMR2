
"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { PlayerState, GameAction } from '@/types/game'; // Restore types

// Restore most props
interface GameCanvasProps {
  levelPath: string;
  playerRef?: React.MutableRefObject<PlayerState | null>; 
  executeAction?: GameAction | null; 
  resetExecuteAction?: () => void; 
}

export default function GameCanvas({
  levelPath,
  playerRef: parentPlayerRef,
  executeAction,
  resetExecuteAction,
}: GameCanvasProps) {
  const [isClient, setIsClient] = useState(false);
  // isLoading will be managed by more complex logic later
  // const [isLoading, setIsLoading] = useState(true); 
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  console.log(`[GameCanvas] Component body. levelPath: ${levelPath}, isClient: ${isClient}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);

  // Effect 1: Set isClient and draw test rect if canvas is ready
  useEffect(() => {
    setIsClient(true);
    console.log("[GameCanvas Effect 1] Running: Set isClient. Client mode activated.");
    
    if (canvasRef.current && ctxRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      const ctx = ctxRef.current;
      // Clear canvas before drawing new frame or test rect
      ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
      
      ctx.fillStyle = 'blue';
      // Draw a rectangle that's 1/3 of canvas size, offset a bit
      const rectWidth = canvasSize.width / 3;
      const rectHeight = canvasSize.height / 3;
      const rectX = canvasSize.width / 10;
      const rectY = canvasSize.height / 10;
      ctx.fillRect(rectX, rectY, rectWidth, rectHeight);
      console.log(`[GameCanvas Effect 1] Blue test rectangle drawn. X:${rectX.toFixed(0)}, Y:${rectY.toFixed(0)}, W:${rectWidth.toFixed(0)}, H:${rectHeight.toFixed(0)}`);
    } else {
      console.log("[GameCanvas Effect 1] Conditions not met for drawing test rectangle (canvas/ctx not ready or size is 0). canvasRef.current:", !!canvasRef.current, "ctxRef.current:", !!ctxRef.current, "canvasSize:", canvasSize);
    }
  }, [canvasSize, isClient]); // Redraw if canvasSize changes or after isClient is set

  // Effect 2: Apply canvasSize to canvas attributes and get context
  useEffect(() => {
    console.log("[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize:", canvasSize);
    if (canvasRef.current) {
      if (canvasSize.width > 0 && canvasSize.height > 0) {
        canvasRef.current.width = canvasSize.width;
        canvasRef.current.height = canvasSize.height;
        console.log(`[GameCanvas Effect 2] Canvas attributes set to W:${canvasSize.width}, H:${canvasSize.height}`);
        
        const context = canvasRef.current.getContext('2d');
        if (context) {
          ctxRef.current = context;
          console.log("[GameCanvas Effect 2] Canvas context obtained/confirmed.");
        } else {
          console.error("[GameCanvas Effect 2] Failed to get 2D context after resize.");
        }
      } else {
        console.log("[GameCanvas Effect 2] canvasSize width or height is 0, not setting attributes yet.");
      }
    }
  }, [canvasSize]);

  // Effect 3: Observe parent size to set canvas dimensions
  useEffect(() => {
    console.log("[GameCanvas Effect 3] Running: Observe parent size. isClient:", isClient);
    if (!isClient || !canvasRef.current?.parentElement) {
      if (!isClient) console.log("[GameCanvas Effect 3] Not client yet.");
      if (isClient && !canvasRef.current?.parentElement) console.log("[GameCanvas Effect 3] Client, but no parentElement for canvasRef.");
      return;
    }

    const parentElement = canvasRef.current.parentElement;
    console.log("[GameCanvas Effect 3] Parent element found:", parentElement);

    const updateCanvasSizeState = () => {
      const newWidth = parentElement.clientWidth;
      const newHeight = parentElement.clientHeight;
      console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Parent dims: W:${newWidth}, H:${newHeight}`);

      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          if (newWidth > 0 && newHeight > 0) { // Only update if new dimensions are valid
            console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
            return { width: newWidth, height: newHeight };
          } else {
            console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Invalid new dimensions W:${newWidth} H:${newHeight}, not updating.`);
            return currentSize; // Keep current size if new dimensions are invalid
          }
        }
        return currentSize; // No change
      });
    };
    
    updateCanvasSizeState(); // Initial size update

    const resizeObserver = new ResizeObserver(updateCanvasSizeState);
    resizeObserver.observe(parentElement);
    console.log("[GameCanvas Effect 3] ResizeObserver observing parent.");

    window.addEventListener('resize', updateCanvasSizeState);

    return () => {
      console.log("[GameCanvas Effect 3] Cleanup: Disconnecting ResizeObserver, removing window resize listener.");
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateCanvasSizeState);
    };
  }, [isClient]);


  if (!isClient) {
    console.log("[GameCanvas] Rendering null because not client-side yet (isClient is false).");
    return null; // Or some minimal placeholder if you prefer
  }
  
  console.log("[GameCanvas] Rendering canvas element because isClient is true.");
  return (
    <canvas
      ref={canvasRef}
      // Width and height are set by Effect 2 from canvasSize state
      className="absolute top-0 left-0 w-full h-full border-2 border-pink-500" 
      style={{ backgroundColor: 'rgba(200, 200, 255, 0.3)' }} // Light blueish semi-transparent background
    ></canvas>
  );
}

    