
"use client";

import React, { useEffect, useState } from 'react';

interface GameCanvasProps {
  levelPath: string;
  // Other props are temporarily removed for this test
}

export default function GameCanvas({ levelPath }: GameCanvasProps) {
  const [isMountedClient, setIsMountedClient] = useState(false);

  console.log(`[GameCanvas Simplified Test] Component body. levelPath: ${levelPath}. isMountedClient: ${isMountedClient}`);

  useEffect(() => {
    console.log("[GameCanvas Simplified Test] Effect to set isMountedClient to true running.");
    setIsMountedClient(true);
    console.log("[GameCanvas Simplified Test] isMountedClient has been set to true.");
  }, []);

  if (!isMountedClient) {
    console.log("[GameCanvas Simplified Test] Rendering pre-mount message because isMountedClient is false.");
    // This might not be visible if PlatformerPage's loading indicator for DynamicGameCanvas is still active
    return (
      <div className="w-full h-full flex items-center justify-center bg-yellow-100 text-yellow-700">
        <p>GameCanvas: Waiting for client mount...</p>
      </div>
    );
  }

  console.log("[GameCanvas Simplified Test] Rendering 'GameCanvas Mounted (Client)' div.");
  return (
    <div className="w-full h-full flex items-center justify-center border-4 border-purple-500 bg-purple-100">
      <p className="text-2xl font-bold text-purple-700">
        GameCanvas Mounted (Client) - Level: {levelPath}
      </p>
    </div>
  );
}
