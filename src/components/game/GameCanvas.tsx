
"use client";

import React, { useEffect, useRef, useState } from 'react';

interface GameCanvasProps {
  levelPath: string;
  // Props are kept for interface consistency with PlatformerPage, though not all are used in this simplified version
  playerRef?: React.MutableRefObject<any | null>; // Using 'any' for simplicity in diagnostic phase
  executeAction?: string | null; // Using 'string' for simplicity
  resetExecuteAction?: () => void;
}

export default function GameCanvas({
  levelPath,
}: GameCanvasProps) {
  const [isClient, setIsClient] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // ctxRef is not strictly necessary if context is used locally in the effect
  // const ctxRef = useRef<CanvasRenderingContext2D | null>(null); 
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  console.log(`[GameCanvas] Component body. levelPath: ${levelPath}, isClient: ${isClient}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);

  // Effect 1: Set isClient to true after mount
  useEffect(() => {
    console.log("[GameCanvas Effect 1] Setting isClient to true.");
    setIsClient(true);
  }, []);

  // Effect 2: Observe parent element size and update canvasSize state
  useEffect(() => {
    console.log("[GameCanvas Effect 2] Running: Observe parent size. isClient:", isClient);
    if (!isClient || !canvasRef.current?.parentElement) {
      if (!isClient) console.log("[GameCanvas Effect 2] Not client yet.");
      if (isClient && !canvasRef.current?.parentElement) console.log("[GameCanvas Effect 2] Client, but no parentElement for canvasRef.");
      return;
    }

    const parentElement = canvasRef.current.parentElement;
    console.log("[GameCanvas Effect 2] Parent element found:", parentElement);

    const updateCanvasSizeState = () => {
      const newWidth = parentElement.clientWidth;
      const newHeight = parentElement.clientHeight;
      console.log(`[GameCanvas Effect 2 updateCanvasSizeState] Parent dims: W:${newWidth}, H:${newHeight}`);

      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          // Only update if dimensions are valid and different
          if ((newWidth > 0 && newHeight > 0) || (newWidth === 0 && newHeight === 0 && (currentSize.width !== 0 || currentSize.height !== 0) )) { // Allow update to 0,0 if it changed
            console.log(`[GameCanvas Effect 2 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
            return { width: newWidth, height: newHeight };
          } else {
            console.log(`[GameCanvas Effect 2 updateCanvasSizeState] Invalid or unchanged new dimensions W:${newWidth} H:${newHeight}, not updating from W:${currentSize.width} H:${currentSize.height}`);
            return currentSize;
          }
        }
        return currentSize;
      });
    };

    updateCanvasSizeState(); // Initial call

    const resizeObserver = new ResizeObserver(updateCanvasSizeState);
    resizeObserver.observe(parentElement);
    console.log("[GameCanvas Effect 2] ResizeObserver observing parent.");

    const handleWindowResize = () => {
      console.log("[GameCanvas Effect 2] Window resize event detected.");
      updateCanvasSizeState();
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      console.log("[GameCanvas Effect 2] Cleanup: Disconnecting ResizeObserver, removing window resize listener.");
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [isClient]); // Dependency on isClient

  // Effect 3: Setup canvas attributes, get context, and draw when canvasSize is valid
  useEffect(() => {
    console.log("[GameCanvas Effect 3] Running: Canvas Setup & Draw. canvasRef.current:", !!canvasRef.current, "canvasSize:", canvasSize);
    if (canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      const canvas = canvasRef.current;
      // These set the drawing buffer size
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;
      console.log(`[GameCanvas Effect 3] Canvas attributes (buffer) set to W:${canvasSize.width}, H:${canvasSize.height}`);

      const context = canvas.getContext('2d');
      if (context) {
        console.log("[GameCanvas Effect 3] Canvas context obtained.");
        // Perform diagnostic drawing immediately
        context.clearRect(0, 0, canvas.width, canvas.height);

        context.fillStyle = 'lime';
        context.fillRect(0, 0, canvas.width, canvas.height);
        console.log(`[GameCanvas Effect 3] Lime green fill drawn. W:${canvas.width}, H:${canvas.height}`);

        context.fillStyle = 'blue';
        const rectWidth = Math.floor(canvas.width / 3); // Ensure integer values
        const rectHeight = Math.floor(canvas.height / 3);
        const rectX = Math.floor(canvas.width / 10);
        const rectY = Math.floor(canvas.height / 10);
        context.fillRect(rectX, rectY, rectWidth, rectHeight);
        console.log(`[GameCanvas Effect 3] Blue test rectangle drawn. X:${rectX}, Y:${rectY}, W:${rectWidth}, H:${rectHeight}`);
      } else {
        console.error("[GameCanvas Effect 3] Failed to get 2D context.");
      }
    } else {
      console.log("[GameCanvas Effect 3] Conditions not met for canvas setup/drawing (canvasRef or canvasSize invalid). canvasRef.current:", !!canvasRef.current, "canvasSize:", canvasSize);
      // If canvas exists but size is 0,0, try to clear it to avoid stale drawings
      if (canvasRef.current && canvasSize.width === 0 && canvasSize.height === 0) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          console.log("[GameCanvas Effect 3] Clearing canvas due to 0x0 size.");
          ctx.clearRect(0,0,canvasRef.current.width, canvasRef.current.height);
        }
      }
    }
  }, [canvasSize]); // Re-run this effect if canvasSize changes

  if (!isClient) {
    console.log("[GameCanvas] Rendering null because not client-side yet (isClient is false).");
    return null;
  }

  console.log("[GameCanvas] Rendering canvas element because isClient is true.");
  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block', // Ensure it's a block element
        width: canvasSize.width > 0 ? `${canvasSize.width}px` : '0px', // Set CSS width from state
        height: canvasSize.height > 0 ? `${canvasSize.height}px` : '0px', // Set CSS height from state
        border: '3px solid deeppink', // Prominent border
        backgroundColor: 'rgba(200, 200, 255, 0.1)', // Light background to see the canvas element
      }}
      // The actual drawing buffer size is set by canvas.width and canvas.height in Effect 3
      // width={canvasSize.width} // HTML attribute for drawing buffer width
      // height={canvasSize.height} // HTML attribute for drawing buffer height
      aria-label="Game Canvas Diagnostic"
    />
  );
}
