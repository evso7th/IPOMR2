
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, LevelData, Tile, GameAction } from '@/types/game';
// import { loadLevel } from '@/lib/levelLoader'; // Temporarily unused
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
  levelPath: string; // Temporarily unused but kept for prop consistency
  onPlayerAction: (action: GameAction) => void; 
  playerRef: React.MutableRefObject<PlayerState | null>;
  executeAction: GameAction | null;
  resetExecuteAction: () => void;
}

export default function GameCanvas({ levelPath, onPlayerAction, playerRef: parentPlayerRef, executeAction, resetExecuteAction }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [level, setLevel] = useState<LevelData | null>(null);
  const playerInstanceRef = useRef<PlayerState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast(); // Kept in case of future error messages
  const [isClient, setIsClient] = useState(false);

  const [assets, setAssets] = useState<{ playerImage: HTMLImageElement | null; tileImage: HTMLImageElement | null }>({
    playerImage: null,
    tileImage: null,
  });

  useEffect(() => {
    setIsClient(true);
    const pImg = new Image();
    pImg.src = 'https://placehold.co/32x32/388E3C/E8F5E9.png?text=P'; 
    pImg.setAttribute('data-ai-hint', 'player character');
    pImg.onload = () => setAssets(prev => ({ ...prev, playerImage: pImg }));
    pImg.onerror = () => console.error("Failed to load player image");

    const tImg = new Image();
    tImg.src = 'https://placehold.co/32x30/795548/E8F5E9.png?text=T';
    tImg.setAttribute('data-ai-hint', 'ground tile');
    tImg.onload = () => setAssets(prev => ({ ...prev, tileImage: tImg }));
    tImg.onerror = () => console.error("Failed to load tile image");
  }, []);

  useEffect(() => {
    if (!isClient) return;

    const initGame = () => {
      setIsLoading(true);

      // Define level data directly:
      // Platform 1: x=100, y=500, width=150, height=12
      // Platform 2: x=300, y=400, width=150, height=12
      // Player start x=110, player's feet at y=500 (on platform 1)
      const playerInitialYTop = 500 - PLAYER_HEIGHT; // Player's y is top-edge

      const customLevelData: LevelData = {
          playerStart: { xPx: 110, yPx: playerInitialYTop },
          tiles: [
              { 
                x: 100, y: 500, width: 150, height: 12, type: 1, 
                color: TILE_COLOR_GROUND, 
                // image field will be implicitly handled by renderLevel if assets.tileImage is present
              },
              { 
                x: 300, y: 400, width: 150, height: 12, type: 1, 
                color: TILE_COLOR_GROUND,
              }
          ],
          tileWidth: TILE_SIZE, 
          tileHeight: TILE_SIZE,
          layout: [[]], // Dummy layout
      };
      
      setLevel(customLevelData);
      const newPlayer: PlayerState = {
        x: customLevelData.playerStart.xPx,
        y: customLevelData.playerStart.yPx,
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
      
      setIsLoading(false);
    };
    
    // Initialize game once client-side and assets are potentially loaded
    // The gameLoop depends on `level` which is set by `initGame`.
    // `assets` in dependency array ensures re-run if assets change, initGame will re-setup.
    initGame();

  }, [isClient, assets.playerImage, assets.tileImage, parentPlayerRef ]); // levelPath and toast removed from deps for hardcoded level

  useEffect(() => {
    if (!isClient || isLoading || !level || !playerInstanceRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    let animationFrameId: number;

    const gameLoop = () => {
      const player = playerInstanceRef.current;
      if (!player || !level) {
          animationFrameId = requestAnimationFrame(gameLoop);
          return;
      }

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
        resetExecuteAction();
      }
      
      if (player.isMovingLeft) player.vx = -PLAYER_SPEED;
      else if (player.isMovingRight) player.vx = PLAYER_SPEED;
      else player.vx = 0;
      
      player.x += player.vx;

      level.tiles.forEach(tile => {
        if (checkCollision(player, tile)) {
          if (player.vx > 0) {
            player.x = tile.x - player.width;
          } else if (player.vx < 0) {
            player.x = tile.x + tile.width;
          }
          player.vx = 0;
        }
      });

      player.vy += GRAVITY;
      player.y += player.vy;
      player.isOnGround = false;

      level.tiles.forEach(tile => {
        if (checkCollision(player, tile)) {
          if (player.vy > 0) {
            player.y = tile.y - player.height;
            player.vy = 0;
            player.isOnGround = true;
          } else if (player.vy < 0) {
            player.y = tile.y + tile.height;
            player.vy = 0;
          }
        }
      });
      
      if (player.x < 0) player.x = 0;
      if (canvas.width > 0 && player.x + player.width > canvas.width) player.x = canvas.width - player.width;
      if (canvas.height > 0 && player.y + player.height > canvas.height) {
         player.y = canvas.height - player.height;
         player.vy = 0;
         player.isOnGround = true;
      }


      if (parentPlayerRef) parentPlayerRef.current = { ...player };

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderLevel(ctx, level);
      renderPlayer(ctx, player);

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isLoading, level, executeAction, resetExecuteAction, parentPlayerRef, isClient, assets.tileImage]); // assets.tileImage is used in renderLevel

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

  useEffect(() => {
    if(!isClient) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (container) {
        if (container.clientWidth > 0 && container.clientHeight > 0) {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        } else {
            const fallbackWidth = 800; // Default or minimum width
            const fallbackHeight = 600; // Default or minimum height
            canvas.width = fallbackWidth;
            canvas.height = fallbackHeight;
        }
      }
    };
    
    resizeCanvas();
    let resizeObserver: ResizeObserver | null = null;
    if (canvas.parentElement && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resizeCanvas);
        resizeObserver.observe(canvas.parentElement);
    } else {
        window.addEventListener('resize', resizeCanvas);
    }
    
    return () => {
        if (resizeObserver && canvas.parentElement) {
            resizeObserver.unobserve(canvas.parentElement);
        } else {
            window.removeEventListener('resize', resizeCanvas);
        }
    };
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
       if (assets.tileImage?.complete && tile.type === 1) {
         ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
       } else {
         ctx.fillStyle = tile.color; 
         ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
       }
    });
  };

  if (!isClient) {
    return <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground rounded-md">Loading Game...</div>;
  }
  
  if (isLoading) {
    return <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground rounded-md">Loading Level...</div>;
  }

  return (
    <canvas 
      ref={canvasRef} 
      className="border border-primary rounded-md shadow-lg w-full h-full"
      tabIndex={0}
    />
  );
}
