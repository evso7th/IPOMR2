
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle } from '@/types/game';
import {
  GRAVITY,
  PLAYER_SPEED,
  JUMP_STRENGTH,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_COLOR,
  COIN_SIZE,
  COIN_VERTICAL_SPAWN_BOTTOM_OFFSET,
  COIN_SPAWN_TOP_MARGIN,
  MAX_JUMP_HEIGHT,
  COIN_FADE_IN_DURATION,
  COIN_SPAWN_STAGGER_DELAY,
  COIN_PARTICLE_COUNT,
  COIN_PARTICLE_LIFESPAN,
  COIN_PARTICLE_SPEED_MULTIPLIER,
  COIN_PARTICLE_GRAVITY_FACTOR,
  COIN_PARTICLE_SIZE,
} from '@/config/gameConfig';
import { useToast } from "@/hooks/use-toast";
import { checkCollision } from '@/game/utils/collision';
import { renderPlayer } from '@/game/entities/playerRenderer';
import { renderLevel } from '@/game/entities/levelRenderer';
import { renderCoins } from '@/game/entities/coinRenderer';
import { loadLevel } from '@/lib/levelLoader';

interface GameCanvasProps {
  levelPath: string;
  onPlayerAction: (action: GameAction) => void;
  playerRef: React.MutableRefObject<PlayerState | null>;
  executeAction: GameAction | null;
  resetExecuteAction: () => void;
}

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
    if (!isNaN(parsed)) return parsed;
  }
  console.warn(`Could not parse dimension value: ${value} against totalSize: ${totalSize}. Defaulting to 0.`);
  return 0;
}

function spawnNewCoinPair(
  processedTiles: ProcessedTile[],
  canvasWidth: number,
  canvasHeight: number
): CoinState[] {
  if (canvasWidth <= 0 || canvasHeight <= 0) return [];

  let highestPlatformTopY = canvasHeight;
  if (processedTiles.length > 0) {
    highestPlatformTopY = Math.min(...processedTiles.map(tile => tile.y));
  } else {
     // Fallback if no platforms, coins spawn lower. Adjust as needed.
     highestPlatformTopY = MAX_JUMP_HEIGHT + COIN_SPAWN_TOP_MARGIN + COIN_SIZE + 10;
  }

  // Top of the spawn zone for the top edge of the coin
  const ySpawnZoneTop = highestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;
  // Bottom of the spawn zone for the top edge of the coin
  const ySpawnZoneBottom = canvasHeight - COIN_VERTICAL_SPAWN_BOTTOM_OFFSET - COIN_SIZE;


  if (ySpawnZoneTop >= ySpawnZoneBottom) {
    console.warn("Coin spawn zone is invalid (top is below or at bottom). No coins will be generated.");
    return [];
  }

  const newPair: CoinState[] = [];
  const midPoint = canvasWidth / 2;
  const horizontalSpawnMargin = COIN_SIZE * 2; 

  const currentTime = Date.now();

  // Coin 1 (left half)
  // Ensure there's enough space in the left half for a coin
  const leftHalfWidth = midPoint - horizontalSpawnMargin - COIN_SIZE;
  if (leftHalfWidth > 0) {
    const coin1X = Math.max(0, Math.random() * leftHalfWidth); // Ensure coin is not placed at negative X
    const coin1Y = Math.random() * (ySpawnZoneBottom - ySpawnZoneTop) + ySpawnZoneTop;
    newPair.push({
      id: `coin-${currentTime}-1`,
      x: coin1X,
      y: coin1Y,
      width: COIN_SIZE,
      height: COIN_SIZE,
      isCollected: false,
      targetSpawnTime: currentTime,
      currentOpacity: 0,
      particles: [],
    });
  } else {
    // console.warn("Not enough space in the left half to spawn a coin.");
  }

  // Coin 2 (right half)
  const rightHalfBaseX = midPoint + horizontalSpawnMargin;
  const rightHalfWidth = canvasWidth - rightHalfBaseX - COIN_SIZE; // Space available in right half
  if (rightHalfWidth > 0) {
    const coin2X = rightHalfBaseX + (Math.random() * rightHalfWidth);
    const coin2Y = Math.random() * (ySpawnZoneBottom - ySpawnZoneTop) + ySpawnZoneTop;
    newPair.push({
      id: `coin-${currentTime}-2`,
      x: coin2X,
      y: coin2Y,
      width: COIN_SIZE,
      height: COIN_SIZE,
      isCollected: false,
      targetSpawnTime: currentTime + COIN_SPAWN_STAGGER_DELAY,
      currentOpacity: 0,
      particles: [],
    });
  } else {
    // console.warn("Not enough space in the right half to spawn a coin.");
  }
  
  return newPair;
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
      default: tileX = xOffset;
    }

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
      default: tileY = yOffset;
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

  let playerStartX = 50;
  let playerStartY = canvasHeight - PLAYER_HEIGHT - 50; // Default if platform not found
  const startPlatform = processedTiles.find(tile => tile.id === rawData.playerStart.platformId);

  if (startPlatform) {
    const playerXOffset = rawData.playerStart.xOffsetPx || 0;
    const playerYOffset = rawData.playerStart.yOffsetPx || 0; // Offset from top of platform
    switch (rawData.playerStart.horizontalAlign) {
      case 'left': playerStartX = startPlatform.x + playerXOffset; break;
      case 'center': playerStartX = startPlatform.x + (startPlatform.width / 2) - (PLAYER_WIDTH / 2) + playerXOffset; break;
      case 'right': playerStartX = startPlatform.x + startPlatform.width - PLAYER_WIDTH - playerXOffset; break;
    }
    playerStartY = startPlatform.y - PLAYER_HEIGHT - playerYOffset; // Player's feet are on top of platform - yOffset
  } else {
    console.warn(`Player start platform with id "${rawData.playerStart.platformId}" not found. Defaulting player position.`);
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
  const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  const playerInstanceRef = useRef<PlayerState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const lastFrameTime = useRef<number>(Date.now());


  const [assets, setAssets] = useState<{
    playerImage: HTMLImageElement | null;
    tileImage: HTMLImageElement | null;
    coinImage: HTMLImageElement | null;
    playerImageLoaded: boolean;
    tileImageLoaded: boolean; 
    coinImageLoaded: boolean; 
  }>({
    playerImage: null,
    tileImage: null,
    coinImage: null,
    playerImageLoaded: false,
    tileImageLoaded: false, 
    coinImageLoaded: false, 
  });

  useEffect(() => {
    setIsClient(true);
    const pImg = new Image();
    pImg.src = `https://placehold.co/${PLAYER_WIDTH}x${PLAYER_HEIGHT}/388E3C/E8F5E9.png?text=P`;
    pImg.setAttribute('data-ai-hint', 'player character');
    pImg.onload = () => setAssets(prev => ({ ...prev, playerImage: pImg, playerImageLoaded: true }));
    pImg.onerror = () => {
      console.error("Failed to load player image.");
      setAssets(prev => ({ ...prev, playerImageLoaded: true })); 
    };

    const tImg = new Image(); 
    tImg.src = `https://placehold.co/1x1/8D6E63/FFFFFF.png?text=T`; 
    tImg.setAttribute('data-ai-hint', 'platform tile');
    tImg.onload = () => setAssets(prev => ({...prev, tileImage: tImg, tileImageLoaded: true}));
    tImg.onerror = () => {
        console.error("Failed to load tile image.");
        setAssets(prev => ({...prev, tileImageLoaded: true}));
    };

    const cImg = new Image();
    cImg.src = `https://placehold.co/${COIN_SIZE}x${COIN_SIZE}/FFD700/000000.png?text=C`;
    cImg.setAttribute('data-ai-hint', 'coin gold');
    cImg.onload = () => setAssets(prev => ({ ...prev, coinImage: cImg, coinImageLoaded: true }));
    cImg.onerror = () => {
      console.error("Failed to load coin image.");
      setAssets(prev => ({ ...prev, coinImageLoaded: true })); 
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
        if (container.clientWidth > 0) newWidth = container.clientWidth;
        if (container.clientHeight > 0) newHeight = container.clientHeight;
      }
      
      setCanvasSize(currentSize => {
        if (canvas.width !== newWidth) canvas.width = newWidth;
        if (canvas.height !== newHeight) canvas.height = newHeight;
        // Only return new object if size actually changed to avoid unnecessary re-renders/effects
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          return { width: newWidth, height: newHeight };
        }
        return currentSize;
      });
    };
    
    updateSize(); // Initial size set

    let resizeObserver: ResizeObserver | null = null;
    if (canvas.parentElement && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(canvas.parentElement);
    } else {
        // Fallback for older browsers or environments without ResizeObserver
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
    setRawLevelData(null); // Reset raw data on level change
    setProcessedLevel(null); // Reset processed level
    setActiveCoins([]); // Reset coins

    loadLevel(levelPath)
      .then(data => {
        if (data) {
          setRawLevelData(data);
          // Processing will happen in the next useEffect dependent on rawLevelData and canvasSize
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
    // This effect depends on rawLevelData, canvasSize, and asset loading status
    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !assets.playerImageLoaded || !assets.tileImageLoaded || !assets.coinImageLoaded) {
      // If not loading but dependencies aren't met, set to loading (e.g., canvas resized before images loaded)
      if (!isLoading && (!rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !assets.playerImageLoaded || !assets.tileImageLoaded || !assets.coinImageLoaded )) {
         if (!isLoading) setIsLoading(true);
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
        image: assets.playerImage, // Use loaded player image
      };
      playerInstanceRef.current = newPlayer;
      if (parentPlayerRef) parentPlayerRef.current = newPlayer;
      
      // Spawn initial coins only if newProcessedLevel.tiles exists and is not empty
      if (newProcessedLevel.tiles) {
        setActiveCoins(spawnNewCoinPair(newProcessedLevel.tiles, canvasSize.width, canvasSize.height));
      }

      setIsLoading(false); // All ready, stop loading
    } catch (error) {
        console.error("Error processing level data:", error);
        toast({ title: "Processing Error", description: "Failed to process level data.", variant: "destructive" });
        setIsLoading(false); // Stop loading on error
    }
  }, [isClient, rawLevelData, canvasSize, assets, parentPlayerRef, toast]);


  useEffect(() => {
    if (!isClient || isLoading || !processedLevel || !processedLevel.tiles || canvasSize.width === 0 || canvasSize.height === 0) return;

    const allCollectedAndParticlesGone = activeCoins.length > 0 && activeCoins.every(c => c.isCollected && c.particles.length === 0);

    if (allCollectedAndParticlesGone) {
      // Ensure new coins are spawned based on the current (and potentially updated) processedLevel.tiles
      setActiveCoins(spawnNewCoinPair(processedLevel.tiles, canvasSize.width, canvasSize.height));
    }
  }, [activeCoins, isClient, isLoading, processedLevel, canvasSize]); // Added processedLevel dependency


  useEffect(() => {
    if (!isClient || isLoading || !processedLevel || !playerInstanceRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    lastFrameTime.current = Date.now(); // Reset lastFrameTime before starting the loop

    const gameLoop = () => {
      const currentTime = Date.now();
      const deltaTime = currentTime - lastFrameTime.current; 
      lastFrameTime.current = currentTime;

      const player = playerInstanceRef.current;
      const currentLevel = processedLevel; 
      
      if (!player || !currentLevel || !currentLevel.tiles) {
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
      
      currentLevel.tiles.forEach(tile => {
        if (tile.vx !== undefined && tile.direction !== undefined && canvas.width > 0) {
            tile.x += (tile.vx * tile.direction);
            if (tile.x <= 0 && tile.direction === -1) {
                tile.x = 0;
                tile.direction *= -1;
            } else if (tile.x + tile.width >= canvas.width && tile.direction === 1) {
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

      currentLevel.tiles.forEach(tile => {
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
            player.vy = 0; // Stop upward movement
          }
        }
      });
      player.y = newPlayerY;
      
      const tentativePlayerX = player.x + player.vx + platformInducedMoveX;
      let newPlayerX = tentativePlayerX;

      currentLevel.tiles.forEach(tile => {
        const tempPlayerStateForHorizontalCheck = { ...player, x: tentativePlayerX };
        if (checkCollision(tempPlayerStateForHorizontalCheck, tile)) {
          const totalIntentVx = player.vx + platformInducedMoveX;
          if (totalIntentVx > 0) { // Moving right
            newPlayerX = tile.x - player.width;
          } else if (totalIntentVx < 0) { // Moving left
            newPlayerX = tile.x + tile.width;
          }
          // If platformInducedMoveX is the only horizontal movement and causes collision,
          // this logic might need refinement. For now, it stops player if they would enter tile.
        }
      });
      player.x = newPlayerX;
      
      // Boundary checks for player
      if (player.x < 0) player.x = 0;
      if (canvas.width > 0 && player.x + player.width > canvas.width) player.x = canvas.width - player.width;
      
      // Fall off bottom of screen (or land on bottom)
      if (canvas.height > 0 && player.y + player.height > canvas.height) {
         player.y = canvas.height - player.height;
         player.vy = 0;
         player.isOnGround = true; // Treat bottom of canvas as ground
      }

      // Update and process coins
      const updatedCoins = activeCoins.map(coin => {
        let newCoin = { ...coin };

        // Particle update
        if (newCoin.particles.length > 0) {
          newCoin.particles = newCoin.particles
            .map(p => {
              const particleDeltaTimeFactor = deltaTime / (1000 / 60); // Normalize based on 60fps
              const newParticle: Particle = {
                ...p,
                x: p.x + p.vx * particleDeltaTimeFactor,
                y: p.y + p.vy * particleDeltaTimeFactor,
                vy: p.vy + GRAVITY * COIN_PARTICLE_GRAVITY_FACTOR * particleDeltaTimeFactor,
                life: p.life - deltaTime,
                opacity: Math.max(0, (p.life - deltaTime) / COIN_PARTICLE_LIFESPAN),
              };
              return newParticle;
            })
            .filter(p => p.life > 0);
        }

        // Coin fade-in
        if (!newCoin.isCollected && currentTime >= newCoin.targetSpawnTime && newCoin.currentOpacity < 1) {
          const opacityIncrease = deltaTime / COIN_FADE_IN_DURATION;
          newCoin.currentOpacity = Math.min(1, newCoin.currentOpacity + opacityIncrease);
        }

        // Coin collection logic
        const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
        if (!newCoin.isCollected && newCoin.currentOpacity > 0.5 && checkCollision(playerRect, newCoin as Rect)) { // Check opacity to avoid collecting during fade-in
          newCoin.isCollected = true;
          newCoin.collectionTime = currentTime;
          newCoin.currentOpacity = 0; // Hide original coin immediately

          // Generate particles
          newCoin.particles = [];
          for (let i = 0; i < COIN_PARTICLE_COUNT; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * COIN_PARTICLE_SPEED_MULTIPLIER + 0.5;
            newCoin.particles.push({
              x: newCoin.x + newCoin.width / 2,
              y: newCoin.y + newCoin.height / 2,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              size: COIN_PARTICLE_SIZE,
              opacity: 1,
              life: COIN_PARTICLE_LIFESPAN,
            });
          }
          // toast({ title: "Coin Collected!", description: `You collected ${newCoin.id}` });
        }
        return newCoin;
      });

      setActiveCoins(updatedCoins);

      if (parentPlayerRef) parentPlayerRef.current = { ...player };

      // Drawing
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderLevel(ctx, currentLevel, assets.tileImage); 
      renderCoins(ctx, activeCoins, assets.coinImage); // Pass activeCoins and coinImage
      renderPlayer(ctx, player, assets.playerImage); // Pass player image

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isClient, isLoading, processedLevel, executeAction, resetExecuteAction, parentPlayerRef, assets, canvasSize, activeCoins, setActiveCoins]);

  useEffect(() => {
    if(!isClient) return; // Only run on client
    const handleKeyDown = (e: KeyboardEvent) => {
      const player = playerInstanceRef.current;
      if (!player) return; // Player might not be initialized yet
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
  }, [onPlayerAction, isClient]); // isClient ensures this runs only after client-side mount


  if (!isClient) {
    // Render a placeholder or nothing on the server
    return <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground rounded-md">Loading Game...</div>;
  }
  
  return (
    <div className="relative w-full h-full"> 
      <canvas
        ref={canvasRef}
        className="w-full h-full block" // Ensure canvas tries to fill its parent
        tabIndex={0} // Make canvas focusable for keyboard events if needed directly (though we use window events)
      />
      {isLoading && (
        <div className="absolute inset-0 bg-muted/80 backdrop-blur-sm flex items-center justify-center text-muted-foreground rounded-md z-10">
          Initializing Canvas...
        </div>
      )}
    </div>
  );
}

