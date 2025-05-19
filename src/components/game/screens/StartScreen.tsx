
"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

interface StartScreenProps {
  onStartGame: () => void;
}

export default function StartScreen({ onStartGame }: StartScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground p-4">
      <div className="text-center space-y-8 bg-card p-8 rounded-xl shadow-2xl max-w-md w-full">
        <Image
          src="https://placehold.co/600x400.png" // Replace with your game's logo or a thematic image
          alt="Platformer Port Title Image"
          width={300}
          height={200}
          className="mx-auto rounded-lg shadow-lg"
          data-ai-hint="game logo"
          priority // Good for LCP
        />
        <h1 className="text-4xl sm:text-5xl font-bold text-primary">
          Platformer Port
        </h1>
        <p className="text-lg text-muted-foreground">
          Готовы к приключениям? Нажмите кнопку ниже, чтобы начать игру!
        </p>
        <Button
          onClick={onStartGame}
          size="lg"
          className="w-full sm:w-auto text-lg py-3 px-8 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg shadow-md transition-transform duration-150 ease-in-out hover:scale-105 active:scale-95"
          aria-label="Запустить игру"
        >
          Запустить игру!
        </Button>
        <p className="text-xs text-muted-foreground pt-4">
          Для лучшего опыта игра попытается перейти в полноэкранный режим.
        </p>
      </div>
    </div>
  );
}
