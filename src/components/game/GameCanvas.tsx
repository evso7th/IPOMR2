
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, LevelData, Tile, GameAction } from '@/types/game';
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
        // toast({ title: "Error", description: "Failed to load player image.", variant: "destructive" });
        setAssets(prev => ({ ...prev, playerImageLoaded: true })); // Mark as "loaded" (attempted) to unblock game
    };

    const tImg = new Image();
    tImg.src = 'https://placehold.co/32x30/795548/E8F5E9.png?text=T';
    tImg.setAttribute('data-ai-hint', 'ground tile');
    tImg.onload = () => setAssets(prev => ({ ...prev, tileImage: tImg, tileImageLoaded: true }));
    tImg.onerror = () => {
        console.error("Failed to load tile image.");
        // toast({ title: "Error", description: "Failed to load tile image.", variant: "destructive" });
        setAssets(prev => ({ ...prev, tileImageLoaded: true })); // Mark as "loaded" (attempted) to unblock game
    };
  }, []);

  useEffect(() => {
    if(!isClient) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      const container = canvas.parentElement;
      let newWidth = 800; // Default/fallback width
      let newHeight = 600; // Default/fallback height

      if (container) {
        // Ensure clientWidth/Height are positive, otherwise keep defaults
        if (container.clientWidth > 0) {
          newWidth = container.clientWidth;
        }
        if (container.clientHeight > 0) {
          newHeight = container.clientHeight;
        }
      }
      
      setCanvasSize(currentSize => {
        // Only update canvas actual dimensions if they differ to avoid redundant re-renders/resets
        if (canvas.width !== newWidth) canvas.width = newWidth;
        if (canvas.height !== newHeight) canvas.height = newHeight;

        // Only update state if dimensions actually change
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          return { width: newWidth, height: newHeight };
        }
        return currentSize;
      });
    };
    
    updateSize(); // Initial size update

    let resizeObserver: ResizeObserver | null = null;
    if (canvas.parentElement && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(canvas.parentElement);
    } else {
        // Fallback for older browsers or environments where ResizeObserver is not available
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
    // Wait for client, valid canvas dimensions, and asset loading attempts to complete
    if (!isClient || canvasSize.width === 0 || canvasSize.height === 0 || !assets.playerImageLoaded || !assets.tileImageLoaded) {
      setIsLoading(true); // Keep loading screen if conditions not met
      return;
    }

    const currentCanvasWidth = canvasSize.width;
    const currentCanvasHeight = canvasSize.height;
    const platformWidth = 150;
    const platformHeight = 16; // ИЗМЕНЕНО: Толщина платформы

    // P1 (верхняя платформа)
    // Нижний край P1 находится на 300px от НИЗА холста
    // y-координата (верхний край P1) = высотаХолста - 300 - высотаПлатформы
    const p1_y_bottom_offset = 300;
    const p1_y = currentCanvasHeight - p1_y_bottom_offset - platformHeight;
    const p1_x = 50; // Слева

    // P2 (нижняя платформа)
    // Нижний край P2 находится на 150px от НИЗА холста
    // y-координата (верхний край P2) = высотаХолста - 150 - высотаПлатформы
    const p2_y_bottom_offset = 150;
    const p2_y = currentCanvasHeight - p2_y_bottom_offset - platformHeight;
    const p2_x = currentCanvasWidth - platformWidth - 50; // Справа

    const playerInitialX = p2_x + 10;
    // Игрок стоит на P2, его ноги на p2_y + platformHeight. Его верхний край = p2_y - PLAYER_HEIGHT
    const playerInitialYTop = p2_y - PLAYER_HEIGHT;


    const customLevelData: LevelData = {
        playerStart: { xPx: playerInitialX, yPx: playerInitialYTop },
        tiles: [
            {
              x: p1_x, y: p1_y, width: platformWidth, height: platformHeight, type: 1,
              color: TILE_COLOR_GROUND,
            },
            {
              x: p2_x, y: p2_y, width: platformWidth, height: platformHeight, type: 1,
              color: TILE_COLOR_GROUND,
            }
        ],
        tileWidth: TILE_SIZE, // Not strictly used for these custom tiles, but part of LevelData
        tileHeight: TILE_SIZE, // Same as above
        layout: [[]], // Not used for custom tiles
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
      image: assets.playerImage, // Assign the potentially loaded image
    };
    playerInstanceRef.current = newPlayer;
    if (parentPlayerRef) parentPlayerRef.current = newPlayer;
    
    setIsLoading(false); // Game is ready

  }, [isClient, canvasSize, assets.playerImage, assets.tileImage, assets.playerImageLoaded, assets.tileImageLoaded, parentPlayerRef]);


  useEffect(() => {
    if (!isClient || isLoading || !level || !playerInstanceRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const gameLoop = () => {
      const player = playerInstanceRef.current;
      if (!player || !level) { // Basic safety check
          animationFrameId = requestAnimationFrame(gameLoop);
          return;
      }

      // Handle actions from touch/keyboard
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
        resetExecuteAction(); // Clear the action after processing
      }
      
      // Update player horizontal velocity based on movement state
      if (player.isMovingLeft) player.vx = -PLAYER_SPEED;
      else if (player.isMovingRight) player.vx = PLAYER_SPEED;
      else player.vx = 0;
      
      // Update player horizontal position
      player.x += player.vx;

      // Horizontal collision with tiles
      level.tiles.forEach(tile => {
        if (checkCollision(player, tile)) {
          if (player.vx > 0) { // Moving right
            player.x = tile.x - player.width;
          } else if (player.vx < 0) { // Moving left
            player.x = tile.x + tile.width;
          }
          player.vx = 0; // Stop horizontal movement on collision
        }
      });

      // Apply gravity
      player.vy += GRAVITY;
      // Update player vertical position
      player.y += player.vy;
      player.isOnGround = false; // Assume not on ground until collision check

      // Vertical collision with tiles
      level.tiles.forEach(tile => {
        if (checkCollision(player, tile)) {
          if (player.vy > 0) { // Moving down
            player.y = tile.y - player.height;
            player.vy = 0;
            player.isOnGround = true;
          } else if (player.vy < 0) { // Moving up
            player.y = tile.y + tile.height;
            player.vy = 0; // Stop vertical movement (e.g., hitting head)
          }
        }
      });
      
      // Boundary checks for canvas edges
      if (player.x < 0) player.x = 0;
      // Ensure canvas.width is positive before using it
      if (canvas.width > 0 && player.x + player.width > canvas.width) player.x = canvas.width - player.width;
      
      // Bottom boundary check (floor of the canvas)
      // Ensure canvas.height is positive
      if (canvas.height > 0 && player.y + player.height > canvas.height) {
         player.y = canvas.height - player.height;
         player.vy = 0;
         player.isOnGround = true; // Player is on the "floor" of the canvas
      }

      // Update parent ref if provided
      if (parentPlayerRef) parentPlayerRef.current = { ...player };

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Render game elements
      renderLevel(ctx, level, assets.tileImage); // Pass potentially loaded tile image
      renderPlayer(ctx, player, assets.playerImage); // Pass potentially loaded player image

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isClient, isLoading, level, executeAction, resetExecuteAction, parentPlayerRef, assets.tileImage, assets.playerImage, canvasSize]); // Added canvasSize

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


  if (!isClient) {
    // SSR fallback or initial state before client-side hydration
    return <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground rounded-md">Loading Game...</div>;
  }
  
  // Canvas is always rendered once isClient is true.
  // isLoading controls the visibility of the "Initializing Canvas..." overlay.
  return (
    <div className="relative w-full h-full"> 
      <canvas
        ref={canvasRef}
        className="w-full h-full block" // Ensure canvas tries to fill its parent
        tabIndex={0} // For keyboard focus
      />
      {isLoading && (
        <div className="absolute inset-0 bg-muted/80 backdrop-blur-sm flex items-center justify-center text-muted-foreground rounded-md z-10">
          Initializing Canvas...
        </div>
      )}
    </div>
  );
}

