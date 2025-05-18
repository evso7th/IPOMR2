"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, LevelData, Tile, GameAction } from '@/types/game';
import { loadLevel } from '@/lib/levelLoader';
import {
  TILE_SIZE,
  GRAVITY,
  PLAYER_SPEED,
  JUMP_STRENGTH,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_COLOR,
  TILE_COLOR_GROUND,
} from '@/config/gameConfig';
import { useToast } from "@/hooks/use-toast";

interface GameCanvasProps {
  levelPath: string;
  onPlayerAction: (action: GameAction) => void; // For touch controls to interact
  playerRef: React.MutableRefObject<PlayerState | null>; // Allow parent to access player state if needed
  executeAction: GameAction | null; // Action from touch controls
  resetExecuteAction: () => void; // Callback to reset the action
}

export default function GameCanvas({ levelPath, onPlayerAction, playerRef: parentPlayerRef, executeAction, resetExecuteAction }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [level, setLevel] = useState<LevelData | null>(null);
  const playerInstanceRef = useRef<PlayerState | null>(null); // Internal player state ref
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);

  const [assets, setAssets] = useState<{ playerImage: HTMLImageElement | null; tileImage: HTMLImageElement | null }>({
    playerImage: null,
    tileImage: null,
  });

  useEffect(() => {
    setIsClient(true);
    // Load images
    const pImg = new Image();
    pImg.src = 'https://placehold.co/32x32/388E3C/E8F5E9.png?text=P'; // Player: Primary on Background
    pImg.onload = () => setAssets(prev => ({ ...prev, playerImage: pImg }));
    pImg.onerror = () => console.error("Failed to load player image");

    const tImg = new Image();
    tImg.src = 'https://placehold.co/32x30/795548/E8F5E9.png?text=T'; // Tile: Accent on Background
    tImg.onload = () => setAssets(prev => ({ ...prev, tileImage: tImg }));
    tImg.onerror = () => console.error("Failed to load tile image");
  }, []);


  // Initialize game
  useEffect(() => {
    if (!isClient) return;

    const initGame = async () => {
      setIsLoading(true);
      const loadedLevel = await loadLevel(levelPath);
      if (loadedLevel) {
        setLevel(loadedLevel);
        const newPlayer: PlayerState = {
          x: loadedLevel.playerStart.xTile * TILE_SIZE,
          y: loadedLevel.playerStart.yTile * TILE_SIZE - PLAYER_HEIGHT, // Position feet at tile start
          width: PLAYER_WIDTH,
          height: PLAYER_HEIGHT,
          vx: 0,
          vy: 0,
          isOnGround: false,
          isMovingLeft: false,
          isMovingRight: false,
          color: PLAYER_COLOR,
          image: assets.playerImage || undefined,
        };
        playerInstanceRef.current = newPlayer;
        if (parentPlayerRef) parentPlayerRef.current = newPlayer;
      } else {
        toast({ title: "Error", description: "Failed to load level.", variant: "destructive" });
      }
      setIsLoading(false);
    };
    initGame();
  }, [levelPath, toast, parentPlayerRef, isClient, assets.playerImage]);


  // Game loop
  useEffect(() => {
    if (!isClient || isLoading || !level || !playerInstanceRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    let animationFrameId: number;

    const gameLoop = () => {
      const player = playerInstanceRef.current;
      if (!player || !level) { // Ensure player and level are not null
          animationFrameId = requestAnimationFrame(gameLoop);
          return;
      }


      // Handle actions from touch controls
      if (executeAction) {
        switch (executeAction) {
          case 'moveLeft': player.isMovingLeft = true; break;
          case 'moveRight': player.isMovingRight = true; break;
          case 'stopMoveLeft': player.isMovingLeft = false; break;
          case 'stopMoveRight': player.isMovingRight = false; break;
          case 'jump': 
            if (player.isOnGround) {
              player.vy = JUMP_STRENGTH;
              player.isOnGround = false;
            }
            break;
        }
        resetExecuteAction(); // Reset action after processing
      }
      
      // Update player horizontal movement
      if (player.isMovingLeft) player.vx = -PLAYER_SPEED;
      else if (player.isMovingRight) player.vx = PLAYER_SPEED;
      else player.vx = 0;
      
      player.x += player.vx;

      // Horizontal collision with tiles
      level.tiles.forEach(tile => {
        if (checkCollision(player, tile)) {
          if (player.vx > 0) { // Moving right
            player.x = tile.x - player.width;
          } else if (player.vx < 0) { // Moving left
            player.x = tile.x + tile.width;
          }
          player.vx = 0;
        }
      });

      // Apply gravity
      player.vy += GRAVITY;
      player.y += player.vy;
      player.isOnGround = false;

      // Vertical collision with tiles
      level.tiles.forEach(tile => {
        if (checkCollision(player, tile)) {
          if (player.vy > 0) { // Falling
            player.y = tile.y - player.height;
            player.vy = 0;
            player.isOnGround = true;
          } else if (player.vy < 0) { // Jumping up
            player.y = tile.y + tile.height;
            player.vy = 0;
          }
        }
      });
      
      // Keep player within canvas bounds (simple example)
      if (player.x < 0) player.x = 0;
      if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
      // if (player.y < 0) { player.y = 0; player.vy = 0; } // Hit ceiling
      if (player.y + player.height > canvas.height) { // Fall off screen (reset or game over)
         player.y = canvas.height - player.height;
         player.vy = 0;
         player.isOnGround = true;
      }

      // Update parent ref
      if (parentPlayerRef) parentPlayerRef.current = { ...player };

      // Render
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderLevel(ctx, level);
      renderPlayer(ctx, player);

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isLoading, level, executeAction, resetExecuteAction, parentPlayerRef, isClient, assets.tileImage]);

  // Keyboard input
  useEffect(() => {
    if(!isClient) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const player = playerInstanceRef.current;
      if (!player) return;
      if (e.key === 'ArrowLeft') { player.isMovingLeft = true; onPlayerAction('moveLeft'); }
      if (e.key === 'ArrowRight') { player.isMovingRight = true; onPlayerAction('moveRight'); }
      if (e.key === 'ArrowUp' || e.key === ' ') {
        if (player.isOnGround) {
          player.vy = JUMP_STRENGTH;
          player.isOnGround = false;
          onPlayerAction('jump');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const player = playerInstanceRef.current;
      if (!player) return;
      if (e.key === 'ArrowLeft') { player.isMovingLeft = false; onPlayerAction('stopMoveLeft'); }
      if (e.key === 'ArrowRight') { player.isMovingRight = false; onPlayerAction('stopMoveRight'); }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onPlayerAction, isClient]);

  // Canvas resize
  useEffect(() => {
    if(!isClient) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      // Simple full-width, fixed-height approach or scale based on aspect ratio
      // For this example, we'll make it fill a portion of the screen
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = Math.min(window.innerHeight * 0.7, 600); // Example height
      }
    };
    
    resizeCanvas(); // Initial size
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [isClient]);

  const checkCollision = (rect1: PlayerState | Tile, rect2: Tile) => {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
  };

  const renderPlayer = (ctx: CanvasRenderingContext2D, player: PlayerState) => {
    if (player.image && assets.playerImage?.complete) {
      ctx.drawImage(player.image, player.x, player.y, player.width, player.height);
    } else {
      ctx.fillStyle = player.color;
      ctx.fillRect(player.x, player.y, player.width, player.height);
    }
  };

  const renderLevel = (ctx: CanvasRenderingContext2D, currentLevel: LevelData) => {
    currentLevel.tiles.forEach(tile => {
       if (assets.tileImage?.complete) {
         ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
       } else {
         ctx.fillStyle = tile.color;
         ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
       }
    });
  };

  if (!isClient) {
    return <div className="w-full h-[600px] bg-muted flex items-center justify-center text-muted-foreground">Loading Game...</div>;
  }
  
  if (isLoading) {
    return <div className="w-full h-[600px] bg-muted flex items-center justify-center text-muted-foreground">Loading Level...</div>;
  }

  return (
    <canvas 
      ref={canvasRef} 
      className="border border-primary rounded-md shadow-lg"
      // Width and height are set by JS to be responsive
      // Default/fallback size
      width={800} 
      height={600}
      tabIndex={0} // Make canvas focusable for keyboard events
    />
  );
}
