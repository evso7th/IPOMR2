
"use client";

import type { GameAction } from '@/types/game';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';

interface TouchControlsProps {
  onAction: (action: GameAction) => void;
}

export default function TouchControls({ onAction }: TouchControlsProps) {
  const handleTouchStart = (action: GameAction, e: React.TouchEvent) => {
    e.preventDefault(); // Prevent screen scrolling
    onAction(action);
  };

  const handleTouchEnd = (action: GameAction, e: React.TouchEvent) => {
    e.preventDefault();
    if (action === 'moveLeft') onAction('stopMoveLeft');
    if (action === 'moveRight') onAction('stopMoveRight');
  };
  
  const handleMouseDown = (action: GameAction) => {
    onAction(action);
  };

  const handleMouseUp = (action: GameAction) => {
    if (action === 'moveLeft') onAction('stopMoveLeft');
    if (action === 'moveRight') onAction('stopMoveRight');
  };

  return (
    // Removed: fixed bottom-0 left-0 right-0 z-50
    // Added: shrink-0
    <div className="h-16 flex justify-around items-center px-4 sm:justify-center sm:gap-8 bg-accent/90 backdrop-blur-sm border-t border-border text-accent-foreground shrink-0">
      <div className="flex gap-4">
        <Button
          variant="outline"
          size="lg"
          className="p-3 aspect-square !bg-accent/80 !text-accent-foreground hover:!bg-accent active:!bg-accent/90"
          onTouchStart={(e) => handleTouchStart('moveLeft', e)}
          onTouchEnd={(e) => handleTouchEnd('moveLeft', e)}
          onMouseDown={() => handleMouseDown('moveLeft')}
          onMouseUp={() => handleMouseUp('moveLeft')}
          aria-label="Move Left"
        >
          <ArrowLeft size={28} /> {/* Slightly smaller icon for better fit */}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="p-3 aspect-square !bg-accent/80 !text-accent-foreground hover:!bg-accent active:!bg-accent/90"
          onTouchStart={(e) => handleTouchStart('moveRight', e)}
          onTouchEnd={(e) => handleTouchEnd('moveRight', e)}
          onMouseDown={() => handleMouseDown('moveRight')}
          onMouseUp={() => handleMouseUp('moveRight')}
          aria-label="Move Right"
        >
          <ArrowRight size={28} /> {/* Slightly smaller icon */}
        </Button>
      </div>
      <Button
        variant="outline"
        size="lg"
        className="p-3 aspect-square !bg-accent/80 !text-accent-foreground hover:!bg-accent active:!bg-accent/90 sm:ml-16" // Added sm:ml-16 for wider spacing from arrows
        onTouchStart={(e) => handleTouchStart('jump', e)}
        onMouseDown={() => handleMouseDown('jump')}
        aria-label="Jump"
      >
        <ArrowUp size={28} /> {/* Slightly smaller icon */}
      </Button>
    </div>
  );
}
