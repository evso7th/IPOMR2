
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
    <div 
      className="h-16 flex justify-around items-center px-4 sm:justify-center sm:gap-8 border-t border-border text-accent-foreground shrink-0"
      style={{ 
        backgroundImage: "url('/assets/images/groundfloor.png')", 
        backgroundSize: 'cover', 
        backgroundPosition: 'center' 
      }}
      data-ai-hint="ground texture"
    >
      <div className="flex gap-4">
        <Button
          variant="outline"
          size="lg"
          className="p-3 rounded-full aspect-square bg-[#ff6600] text-white hover:bg-[#ff6600]/90 active:bg-[#ff6600]/80 border-black/20"
          onTouchStart={(e) => handleTouchStart('moveLeft', e)}
          onTouchEnd={(e) => handleTouchEnd('moveLeft', e)}
          onMouseDown={() => handleMouseDown('moveLeft')}
          onMouseUp={() => handleMouseUp('moveLeft')}
          aria-label="Move Left"
        >
          <ArrowLeft size={28} />
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="p-3 rounded-full aspect-square bg-[#ff6600] text-white hover:bg-[#ff6600]/90 active:bg-[#ff6600]/80 border-black/20"
          onTouchStart={(e) => handleTouchStart('moveRight', e)}
          onTouchEnd={(e) => handleTouchEnd('moveRight', e)}
          onMouseDown={() => handleMouseDown('moveRight')}
          onMouseUp={() => handleMouseUp('moveRight')}
          aria-label="Move Right"
        >
          <ArrowRight size={28} />
        </Button>
      </div>
      <Button
        variant="outline"
        size="lg"
        className="p-3 rounded-full aspect-square bg-[#ff6600] text-white hover:bg-[#ff6600]/90 active:bg-[#ff6600]/80 border-black/20 sm:ml-16"
        onTouchStart={(e) => handleTouchStart('jump', e)}
        onMouseDown={() => handleMouseDown('jump')}
        aria-label="Jump"
      >
        <ArrowUp size={28} />
      </Button>
    </div>
  );
}

