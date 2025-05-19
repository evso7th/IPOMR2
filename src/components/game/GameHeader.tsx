
"use client";

import React from 'react';
import { Medal, Gem, Coins, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GameHeaderProps {
  onExitToStart?: () => void;
  // В будущем можно передавать значения через props
  // score: number;
  // level: number;
  // lives: number;
}

export default function GameHeader({ onExitToStart }: GameHeaderProps) {
  // Заглушки для значений
  const score = 0;
  const level = 1; // Should probably reflect current level
  const lives = 3;
  const maxLives = 7;

  return (
    <header className="h-16 bg-primary text-primary-foreground shadow-md flex items-center shrink-0">
      <div className="container mx-auto px-4 flex justify-between items-center w-full">
        <h1 className="text-xl font-bold whitespace-nowrap">IPO Mad Racing</h1>
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className="flex items-center" title="Level">
            <Medal className="w-4 h-4 sm:w-5 sm:h-5 mr-1" />
            <span className="text-sm sm:text-base">Lvl: {level}</span>
          </div>
          <div className="flex items-center" title="Score">
            <Gem className="w-4 h-4 sm:w-5 sm:h-5 mr-1" />
            <span className="text-sm sm:text-base">{score}</span>
          </div>
          <div className="flex items-center" title="Lives/Collected">
            <Coins className="w-4 h-4 sm:w-5 sm:h-5 mr-1 text-[hsl(var(--chart-4))]" />
            <span className="text-sm sm:text-base">{lives} ({maxLives})</span>
          </div>
          {onExitToStart && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onExitToStart}
              className="text-primary-foreground hover:bg-primary-foreground/10 active:bg-primary-foreground/20"
              aria-label="Exit to Start Screen"
            >
              <Home className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
