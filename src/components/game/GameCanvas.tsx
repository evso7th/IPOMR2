
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, LevelData, Tile, GameAction } from '@/types/game';
import {
  GRAVITY,
  PLAYER_SPEED,
  JUMP_STRENGTH,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_COLOR,
  TILE_COLOR_GROUND,
  PLATFORM_SPEED, // Import PLATFORM_SPEED
} from '@/config/gameConfig';
import { useToast } from "@/hooks/use-toast";
import { checkCollision } from '@/game/utils/collision';
import { renderPlayer } from '@/game/entities/playerRenderer';
import { renderLevel } from '@/game/entities/levelRenderer';

interface GameCanvasProps {
  levelPath: string;
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
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const [assets, setAssets] = useState<{
    playerImage: HTMLImageElement | null;
    tileImage: HTMLImageElement | null;
    playerImageLoaded: boolean;
    tileImageLoaded: boolean;
  }>({
    playerImage: null,
    tileImage: null,
    playerImageLoaded: false,
    tileImageLoaded: false,
  });

  useEffect(() => {
    setIsClient(true);
    const pImg = new Image();
    pImg.src = 'https://placehold.co/32x32/388E3C/E8F5E9.png?text=P';
    pImg.setAttribute('data-ai-hint', 'player character');
    pImg.onload = () => setAssets(prev => ({ ...prev, playerImage: pImg, playerImageLoaded: true }));
    pImg.onerror = () => {
        console.error("Failed to load player image.");
        setAssets(prev => ({ ...prev, playerImageLoaded: true }));
    };

    const tImg = new Image();
    tImg.src = 'https://placehold.co/32x30/795548/E8F5E9.png?text=T';
    tImg.setAttribute('data-ai-hint', 'ground tile');
    tImg.onload = () => setAssets(prev => ({ ...prev, tileImage: tImg, tileImageLoaded: true }));
    tImg.onerror = () => {
        console.error("Failed to load tile image.");
        setAssets(prev => ({ ...prev, tileImageLoaded: true }));
    };
  }, []);

  useEffect(() => {
    if(!isClient) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      const container = canvas.parentElement;
      let newWidth = 800; 
      let newHeight = 600;

      if (container) {
        if (container.clientWidth > 0) {
          newWidth = container.clientWidth;
        }
        if (container.clientHeight > 0) {
          newHeight = container.clientHeight;
        }
      }
      
      setCanvasSize(currentSize => {
        if (canvas.width !== newWidth) canvas.width = newWidth;
        if (canvas.height !== newHeight) canvas.height = newHeight;
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          return { width: newWidth, height: newHeight };
        }
        return currentSize;
      });
    };
    
    updateSize();

    let resizeObserver: ResizeObserver | null = null;
    if (canvas.parentElement && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(canvas.parentElement);
    } else {
        window.addEventListener('resize', updateSize);
    }
    
    return () => {
        if (resizeObserver && canvas.parentElement) {
            resizeObserver.unobserve(canvas.parentElement);
        } else {
            window.removeEventListener('resize', updateSize);
        }
    };
  }, [isClient]); 

  useEffect(() => {
    if (!isClient || canvasSize.width === 0 || canvasSize.height === 0 || !assets.playerImageLoaded || !assets.tileImageLoaded) {
      setIsLoading(true);
      return;
    }

    const currentCanvasWidth = canvasSize.width;
    const currentCanvasHeight = canvasSize.height;
    const platformWidth = 150;
    const platformHeight = 16;

    const p1_y_bottom_offset = 300;
    const p1_y = currentCanvasHeight - p1_y_bottom_offset - platformHeight;
    const p1_x = 50;

    const p2_y_bottom_offset = 150;
    const p2_y = currentCanvasHeight - p2_y_bottom_offset - platformHeight;
    const p2_x = currentCanvasWidth - platformWidth - 50;

    const playerInitialX = p2_x + 10;
    const playerInitialYTop = p2_y - PLAYER_HEIGHT;

    const customLevelData: LevelData = {
        playerStart: { xPx: playerInitialX, yPx: playerInitialYTop },
        tiles: [
            {
              x: p1_x, y: p1_y, width: platformWidth, height: platformHeight, type: 1,
              color: TILE_COLOR_GROUND,
              vx: PLATFORM_SPEED, // P1 starts moving right
              direction: 1,
            },
            {
              x: p2_x, y: p2_y, width: platformWidth, height: platformHeight, type: 1,
              color: TILE_COLOR_GROUND,
              vx: PLATFORM_SPEED, // P2 starts moving left
              direction: -1,
            }
        ],
        tileWidth: platformWidth, // Effectively, since these are custom
        tileHeight: platformHeight,
        layout: [[]], 
    };
    
    setLevel(customLevelData);

    const newPlayer: PlayerState = {
      x: playerInitialX,
      y: playerInitialYTop,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      vx: 0,
      vy: 0,
      isOnGround: false,
      isMovingLeft: false,
      isMovingRight: false,
      color: PLAYER_COLOR,
      image: assets.playerImage,
    };
    playerInstanceRef.current = newPlayer;
    if (parentPlayerRef) parentPlayerRef.current = newPlayer;
    
    setIsLoading(false);

  }, [isClient, canvasSize, assets.playerImage, assets.tileImage, assets.playerImageLoaded, assets.tileImageLoaded, parentPlayerRef]);


  useEffect(() => {
    if (!isClient || isLoading || !level || !playerInstanceRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const gameLoop = () => {
      const player = playerInstanceRef.current;
      if (!player || !level) {
          animationFrameId = requestAnimationFrame(gameLoop);
          return;
      }

      // 1. Handle player input actions
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
      
      // 2. Update player.vx based on movement state
      if (player.isMovingLeft) player.vx = -PLAYER_SPEED;
      else if (player.isMovingRight) player.vx = PLAYER_SPEED;
      else player.vx = 0;
      
      // 3. Update platform positions
      level.tiles.forEach(tile => {
        if (tile.vx !== undefined && tile.direction !== undefined && canvas.width > 0) {
            tile.x += (tile.vx * tile.direction);

            if (tile.x <= 0) {
                tile.x = 0;
                tile.direction *= -1;
            } else if (tile.x + tile.width >= canvas.width) {
                tile.x = canvas.width - tile.width;
                tile.direction *= -1;
            }
        }
      });

      // 4. Apply gravity to player
      player.vy += GRAVITY;
      
      // 5. Tentative vertical update for player
      const tentativePlayerY = player.y + player.vy;
      let newPlayerY = tentativePlayerY;
      player.isOnGround = false;
      let platformInducedMoveX = 0;

      // 6. Vertical collision resolution for player
      level.tiles.forEach(tile => {
        const tempPlayerStateForVerticalCheck = { ...player, y: tentativePlayerY };
        if (checkCollision(tempPlayerStateForVerticalCheck, tile)) {
          if (player.vy > 0) { // Moving down
            newPlayerY = tile.y - player.height;
            player.vy = 0;
            player.isOnGround = true;
            if (tile.vx !== undefined && tile.direction !== undefined) {
              platformInducedMoveX = (tile.vx * tile.direction);
            }
          } else if (player.vy < 0) { // Moving up
            newPlayerY = tile.y + tile.height;
            player.vy = 0;
          }
        }
      });
      player.y = newPlayerY;
      
      // 7. Tentative horizontal update for player (input + platform carry)
      const tentativePlayerX = player.x + player.vx + platformInducedMoveX;
      let newPlayerX = tentativePlayerX;

      // 8. Horizontal collision resolution for player
      level.tiles.forEach(tile => {
        const tempPlayerStateForHorizontalCheck = { ...player, x: tentativePlayerX };
        if (checkCollision(tempPlayerStateForHorizontalCheck, tile)) {
          const totalIntentVx = player.vx + platformInducedMoveX;
          if (totalIntentVx > 0) { 
            newPlayerX = tile.x - player.width;
          } else if (totalIntentVx < 0) { 
            newPlayerX = tile.x + tile.width;
          }
        }
      });
      player.x = newPlayerX;
      
      // 9. Boundary checks for canvas edges (player)
      if (player.x < 0) player.x = 0;
      if (canvas.width > 0 && player.x + player.width > canvas.width) player.x = canvas.width - player.width;
      
      if (canvas.height > 0 && player.y + player.height > canvas.height) {
         player.y = canvas.height - player.height;
         player.vy = 0;
         player.isOnGround = true;
      }

      if (parentPlayerRef) parentPlayerRef.current = { ...player };

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderLevel(ctx, level, assets.tileImage);
      renderPlayer(ctx, player, assets.playerImage);

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isClient, isLoading, level, executeAction, resetExecuteAction, parentPlayerRef, assets.tileImage, assets.playerImage, canvasSize]);

  useEffect(() => {
    if(!isClient) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const player = playerInstanceRef.current;
      if (!player) return;
      // Use onPlayerAction to centralize action dispatching for touch/keyboard parity
      if (e.key === 'ArrowLeft') onPlayerAction('moveLeft');
      if (e.key === 'ArrowRight') onPlayerAction('moveRight');
      if (e.key === 'ArrowUp' || e.key === ' ') {
         // Jump action is handled directly in executeAction logic for isOnGround check
         onPlayerAction('jump');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPlayerAction('stopMoveLeft');
      if (e.key === 'ArrowRight') onPlayerAction('stopMoveRight');
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onPlayerAction, isClient]);


  if (!isClient) {
    return <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground rounded-md">Loading Game...</div>;
  }
  
  return (
    <div className="relative w-full h-full"> 
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        tabIndex={0}
      />
      {isLoading && (
        <div className="absolute inset-0 bg-muted/80 backdrop-blur-sm flex items-center justify-center text-muted-foreground rounded-md z-10">
          Initializing Canvas...
        </div>
      )}
    </div>
  );
}
