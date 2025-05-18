
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, TilePositioning, GameAction } from '@/types/game';
import {
  GRAVITY,
  PLAYER_SPEED,
  JUMP_STRENGTH,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_COLOR,
  // TILE_COLOR_GROUND is now in JSON
  // PLATFORM_SPEED, // PLATFORM_SPEED will come from tile.vx if defined
} from '@/config/gameConfig';
import { useToast } from "@/hooks/use-toast";
import { checkCollision } from '@/game/utils/collision';
import { renderPlayer } from '@/game/entities/playerRenderer';
import { renderLevel } from '@/game/entities/levelRenderer';
import { loadLevel } from '@/lib/levelLoader';

interface GameCanvasProps {
  levelPath: string;
  onPlayerAction: (action: GameAction) => void;
  playerRef: React.MutableRefObject<PlayerState | null>;
  executeAction: GameAction | null;
  resetExecuteAction: () => void;
}

// Helper function to parse dimension values (number, "X%", or "Xpx")
function parseDimension(value: number | string, totalSize: number): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.endsWith('%')) {
      return (parseFloat(value.substring(0, value.length - 1)) / 100) * totalSize;
    }
    if (value.endsWith('px')) {
      return parseFloat(value.substring(0, value.length - 2));
    }
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) return parsed; // Fallback for number as string
  }
  console.warn(`Could not parse dimension value: ${value} against totalSize: ${totalSize}. Defaulting to 0.`);
  return 0; 
}

function processRawLevelData(
  rawData: RawLevelData,
  canvasWidth: number,
  canvasHeight: number
): ProcessedLevelData {
  const processedTiles: ProcessedTile[] = rawData.tiles.map((rawTile: RawTileData) => {
    const tileWidth = parseDimension(rawTile.width, canvasWidth);
    const tileHeight = parseDimension(rawTile.height, canvasHeight);

    let tileX = 0;
    let tileY = 0;
    
    const xOffset = rawTile.positioning.xOffsetPx || 0;
    const yOffset = rawTile.positioning.yOffsetPx || 0;

    // Calculate X based on anchor
    switch (rawTile.positioning.anchor) {
      case 'top-left':    tileX = xOffset; break;
      case 'center-left': tileX = xOffset; break;
      case 'bottom-left': tileX = xOffset; break;
      
      case 'top-center':    tileX = (canvasWidth / 2) - (tileWidth / 2) + xOffset; break;
      case 'center':        tileX = (canvasWidth / 2) - (tileWidth / 2) + xOffset; break;
      case 'bottom-center': tileX = (canvasWidth / 2) - (tileWidth / 2) + xOffset; break;
      
      case 'top-right':     tileX = canvasWidth - tileWidth - xOffset; break;
      case 'center-right':  tileX = canvasWidth - tileWidth - xOffset; break;
      case 'bottom-right':  tileX = canvasWidth - tileWidth - xOffset; break;
      default: tileX = xOffset; // Should not happen
    }

    // Calculate Y based on anchor
    switch (rawTile.positioning.anchor) {
      case 'top-left':    tileY = yOffset; break;
      case 'top-center':  tileY = yOffset; break;
      case 'top-right':   tileY = yOffset; break;

      case 'center-left': tileY = (canvasHeight / 2) - (tileHeight / 2) + yOffset; break;
      case 'center':      tileY = (canvasHeight / 2) - (tileHeight / 2) + yOffset; break;
      case 'center-right':tileY = (canvasHeight / 2) - (tileHeight / 2) + yOffset; break;

      case 'bottom-left':   tileY = canvasHeight - tileHeight - yOffset; break;
      case 'bottom-center': tileY = canvasHeight - tileHeight - yOffset; break;
      case 'bottom-right':  tileY = canvasHeight - tileHeight - yOffset; break;
      default: tileY = yOffset; // Should not happen
    }

    return {
      id: rawTile.id,
      x: tileX,
      y: tileY,
      width: tileWidth,
      height: tileHeight,
      type: rawTile.type,
      color: rawTile.color,
      vx: rawTile.vx,
      direction: rawTile.direction,
    };
  });

  let playerStartX = 0;
  let playerStartY = 0;
  const startPlatform = processedTiles.find(tile => tile.id === rawData.playerStart.platformId);

  if (startPlatform) {
    const playerXOffset = rawData.playerStart.xOffsetPx || 0;
    const playerYOffset = rawData.playerStart.yOffsetPx || 0; // Offset from player's feet to platform top

    switch (rawData.playerStart.horizontalAlign) {
      case 'left':
        playerStartX = startPlatform.x + playerXOffset;
        break;
      case 'center':
        playerStartX = startPlatform.x + (startPlatform.width / 2) - (PLAYER_WIDTH / 2) + playerXOffset;
        break;
      case 'right':
        playerStartX = startPlatform.x + startPlatform.width - PLAYER_WIDTH - playerXOffset;
        break;
    }
    // Player's y is its top edge. Player stands on top of platform.
    playerStartY = startPlatform.y - PLAYER_HEIGHT - playerYOffset; 
  } else {
    console.warn(`Player start platform with id "${rawData.playerStart.platformId}" not found. Defaulting player position.`);
    playerStartX = 50;
    playerStartY = canvasHeight - PLAYER_HEIGHT - 50;
  }

  return {
    playerStart: { xPx: playerStartX, yPx: playerStartY },
    tiles: processedTiles,
  };
}


export default function GameCanvas({ levelPath, onPlayerAction, playerRef: parentPlayerRef, executeAction, resetExecuteAction }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [rawLevelData, setRawLevelData] = useState<RawLevelData | null>(null);
  const [processedLevel, setProcessedLevel] = useState<ProcessedLevelData | null>(null);
  
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
    tileImage: null, // Generic tile image, not currently used per tile
    playerImageLoaded: false,
    tileImageLoaded: true, // Assume true as we're not loading a generic tile image for now
  });

  useEffect(() => {
    setIsClient(true);
    const pImg = new Image();
    pImg.src = 'https://placehold.co/48x75/388E3C/E8F5E9.png?text=P';
    pImg.setAttribute('data-ai-hint', 'player character');
    pImg.onload = () => setAssets(prev => ({ ...prev, playerImage: pImg, playerImageLoaded: true }));
    pImg.onerror = () => {
        console.error("Failed to load player image.");
        setAssets(prev => ({ ...prev, playerImageLoaded: true })); // Mark as attempt complete
    };
    // No generic tile image loading for now, so tileImageLoaded remains true.
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
        if (container.clientWidth > 0) newWidth = container.clientWidth;
        if (container.clientHeight > 0) newHeight = container.clientHeight;
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
    if (!isClient || !levelPath) return;
    setIsLoading(true);
    setRawLevelData(null); 
    setProcessedLevel(null);

    loadLevel(levelPath)
      .then(data => {
        if (data) {
          setRawLevelData(data);
          // Processing will happen in the next effect that depends on rawLevelData and canvasSize
        } else {
          toast({ title: "Error", description: `Failed to load level: ${levelPath}`, variant: "destructive" });
          setIsLoading(false);
        }
      })
      .catch(error => {
        console.error("Error in loadLevel promise chain:", error);
        toast({ title: "Error", description: "An unexpected error occurred while loading level data.", variant: "destructive" });
        setIsLoading(false);
      });
  }, [levelPath, isClient, toast]);

  useEffect(() => {
    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !assets.playerImageLoaded || !assets.tileImageLoaded) {
      if(!rawLevelData || canvasSize.width === 0 || canvasSize.height === 0) {
         // Only set isLoading to true if essential data for processing is missing.
         // If rawLevelData is null, the previous effect is still loading it.
         if (isLoading === false && (!rawLevelData || canvasSize.width === 0 || canvasSize.height === 0)) {
            setIsLoading(true);
         }
      }
      return;
    }
    
    try {
      const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
      setProcessedLevel(newProcessedLevel);

      const newPlayer: PlayerState = {
        x: newProcessedLevel.playerStart.xPx,
        y: newProcessedLevel.playerStart.yPx,
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
    } catch (error) {
        console.error("Error processing level data:", error);
        toast({ title: "Processing Error", description: "Failed to process level data.", variant: "destructive" });
        setIsLoading(false); 
    }

  }, [isClient, rawLevelData, canvasSize, assets.playerImage, assets.playerImageLoaded, assets.tileImageLoaded, parentPlayerRef, toast, isLoading]);


  useEffect(() => {
    if (!isClient || isLoading || !processedLevel || !playerInstanceRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const gameLoop = () => {
      const player = playerInstanceRef.current;
      if (!player || !processedLevel) {
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
      
      processedLevel.tiles.forEach(tile => {
        if (tile.vx !== undefined && tile.direction !== undefined && canvas.width > 0) {
            tile.x += (tile.vx * tile.direction);
            if (tile.x <= 0 && tile.direction === -1) { // Check direction to prevent sticking
                tile.x = 0;
                tile.direction *= -1;
            } else if (tile.x + tile.width >= canvas.width && tile.direction === 1) { // Check direction
                tile.x = canvas.width - tile.width;
                tile.direction *= -1;
            }
        }
      });

      player.vy += GRAVITY;
      
      const tentativePlayerY = player.y + player.vy;
      let newPlayerY = tentativePlayerY;
      player.isOnGround = false;
      let platformInducedMoveX = 0;

      processedLevel.tiles.forEach(tile => {
        const tempPlayerStateForVerticalCheck = { ...player, y: tentativePlayerY };
        if (checkCollision(tempPlayerStateForVerticalCheck, tile)) {
          if (player.vy > 0) { 
            newPlayerY = tile.y - player.height;
            player.vy = 0;
            player.isOnGround = true;
            if (tile.vx !== undefined && tile.direction !== undefined) {
              platformInducedMoveX = (tile.vx * tile.direction);
            }
          } else if (player.vy < 0) { 
            newPlayerY = tile.y + tile.height;
            player.vy = 0;
          }
        }
      });
      player.y = newPlayerY;
      
      const tentativePlayerX = player.x + player.vx + platformInducedMoveX;
      let newPlayerX = tentativePlayerX;

      processedLevel.tiles.forEach(tile => {
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
      
      if (player.x < 0) player.x = 0;
      if (canvas.width > 0 && player.x + player.width > canvas.width) player.x = canvas.width - player.width;
      
      if (canvas.height > 0 && player.y + player.height > canvas.height) {
         player.y = canvas.height - player.height;
         player.vy = 0;
         player.isOnGround = true;
      }

      if (parentPlayerRef) parentPlayerRef.current = { ...player };

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderLevel(ctx, processedLevel, assets.tileImage); 
      renderPlayer(ctx, player, assets.playerImage);

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isClient, isLoading, processedLevel, executeAction, resetExecuteAction, parentPlayerRef, assets.tileImage, assets.playerImage, canvasSize]);

  useEffect(() => {
    if(!isClient) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const player = playerInstanceRef.current;
      if (!player) return;
      if (e.key === 'ArrowLeft') onPlayerAction('moveLeft');
      if (e.key === 'ArrowRight') onPlayerAction('moveRight');
      if (e.key === 'ArrowUp' || e.key === ' ') {
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
