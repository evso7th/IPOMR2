"use client";

import React, { useRef, useState, useCallback } from 'react';
import GameCanvas from '@/components/game/GameCanvas';
import TouchControls from '@/components/game/TouchControls';
import type { PlayerState, GameAction } from '@/types/game';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function PlatformerPage() {
  const playerRef = useRef<PlayerState | null>(null);
  const [executeAction, setExecuteAction] = useState<GameAction | null>(null);

  const handlePlayerAction = useCallback((action: GameAction) => {
    // This function can be used to trigger actions on the player
    // For example, by passing it to GameCanvas or by updating a shared state
    // For now, TouchControls will signal GameCanvas directly via props.
    setExecuteAction(action);
  }, []);

  const resetExecuteAction = useCallback(() => {
    setExecuteAction(null);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background text-foreground">
      <header className="mb-8 text-center">
        <h1 className="text-5xl font-bold text-primary">Platformer Port</h1>
        <p className="text-muted-foreground mt-2">A Next.js & Canvas Adventure</p>
      </header>

      <Card className="w-full max-w-4xl mb-6 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="text-accent w-5 h-5" /> Important Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-sm space-y-1">
            <p>Welcome to Platformer Port! This is a basic scaffold for a platformer game.</p>
            <p>
              For the game assets (images, sounds, full level data) that might have been part of your original request (e.g., from a GitHub repository), 
              <strong>you will need to manually download them and place them into the `public` directory</strong> of this Next.js project.
            </p>
            <p>For example: Images could go into <code>public/assets/sprites/</code> and Level JSON files into <code>public/assets/levels/</code>.</p>
            <p>
              The game logic is structured to load assets from such paths if you update the component. 
              Currently, placeholder graphics and a sample level (<code>public/levels/level1.json</code>) are used.
            </p>
            <p className="font-semibold mt-2">Controls: Use keyboard arrow keys (Left, Right, Up/Space for Jump) or the on-screen touch controls to play.</p>
          </CardDescription>
        </CardContent>
      </Card>
      
      <main className="w-full max-w-4xl relative">
        {/* The GameCanvas component will handle its own width/height responsiveness */}
        <GameCanvas 
          levelPath="/levels/level1.json" 
          onPlayerAction={handlePlayerAction}
          playerRef={playerRef}
          executeAction={executeAction}
          resetExecuteAction={resetExecuteAction}
        />
      </main>
      
      <TouchControls onAction={handlePlayerAction} />

      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Platformer Port. Built with Next.js.</p>
      </footer>
    </div>
  );
}
