
"use client";

import React from 'react';
import type { GameStats } from '@/types/game';
import { Medal, Gem, Coins, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GameHeaderProps {
  onExitToStart?: () => void;
  stats?: GameStats; // Make stats optional for initial rendering
}

export default function GameHeader({ onExitToStart, stats }: GameHeaderProps) {
  const score = 0; // Placeholder
  const level = 1; // Placeholder, should reflect current level path

  const uncollectedInPair = stats?.uncollectedInPair ?? 0;
  const currentPairDisplay = (stats?.currentPairNum ?? 0) + 1;
  const totalPairsNum = stats?.totalPairsNum ?? 0;
  const collectedThisPair = 2 - uncollectedInPair;


  return (
    <header className="h-16 bg-primary text-primary-foreground shadow-md flex items-center shrink-0">
      <div className="container mx-auto px-4 flex justify-between items-center w-full">
        <div className="flex items-center space-x-3">
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
          <h1 className="text-xl font-bold whitespace-nowrap">IPO Mad Racing</h1>
        </div>
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className="flex items-center" title="Level">
            <Medal className="w-4 h-4 sm:w-5 sm:h-5 mr-1" />
            <span className="text-sm sm:text-base">Lvl: {level}</span>
          </div>
          <div className="flex items-center" title="Score">
            <Gem className="w-4 h-4 sm:w-5 sm:h-5 mr-1" />
            <span className="text-sm sm:text-base">{score}</span>
          </div>
          <div className="flex items-center" title={`Coins: ${collectedThisPair} collected in current pair. Pair ${currentPairDisplay} of ${totalPairsNum}`}>
            <Coins className="w-4 h-4 sm:w-5 sm:h-5 mr-1 text-[hsl(var(--chart-4))]" />
            {stats ? (
              <span className="text-sm sm:text-base">
                {collectedThisPair}/2 ({currentPairDisplay}/{totalPairsNum})
              </span>
            ) : (
              <span className="text-sm sm:text-base">0/2 (1/?)</span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
