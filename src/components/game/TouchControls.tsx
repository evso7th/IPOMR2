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
    <div className="fixed bottom-4 left-0 right-0 flex justify-around items-center p-4 sm:justify-start sm:gap-8 z-50">
      <div className="flex gap-4">
        <Button
          variant="outline"
          size="lg"
          className="p-4 aspect-square !bg-accent/80 !text-accent-foreground hover:!bg-accent active:!bg-accent/90 backdrop-blur-sm"
          onTouchStart={(e) => handleTouchStart('moveLeft', e)}
          onTouchEnd={(e) => handleTouchEnd('moveLeft', e)}
          onMouseDown={() => handleMouseDown('moveLeft')}
          onMouseUp={() => handleMouseUp('moveLeft')}
          aria-label="Move Left"
        >
          <ArrowLeft size={32} />
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="p-4 aspect-square !bg-accent/80 !text-accent-foreground hover:!bg-accent active:!bg-accent/90 backdrop-blur-sm"
          onTouchStart={(e) => handleTouchStart('moveRight', e)}
          onTouchEnd={(e) => handleTouchEnd('moveRight', e)}
          onMouseDown={() => handleMouseDown('moveRight')}
          onMouseUp={() => handleMouseUp('moveRight')}
          aria-label="Move Right"
        >
          <ArrowRight size={32} />
        </Button>
      </div>
      <Button
        variant="outline"
        size="lg"
        className="p-4 aspect-square !bg-accent/80 !text-accent-foreground hover:!bg-accent active:!bg-accent/90 backdrop-blur-sm sm:ml-auto"
        onTouchStart={(e) => handleTouchStart('jump', e)}
        onMouseDown={() => handleMouseDown('jump')}
        aria-label="Jump"
      >
        <ArrowUp size={32} />
      </Button>
    </div>
  );
}
