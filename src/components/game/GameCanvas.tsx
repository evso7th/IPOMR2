
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

  const p3TopY = canvasHeight - 1; // Верхняя поверхность P3 (наша "земля")

  // Нижняя граница зоны спауна (для верхнего края монетки)
  // Монетка должна быть на COIN_VERTICAL_SPAWN_BOTTOM_OFFSET выше P3
  const ySpawnZoneBottomCoinTopEdge = p3TopY - COIN_VERTICAL_SPAWN_BOTTOM_OFFSET - COIN_SIZE;

  // Верхняя граница зоны спауна (для верхнего края монетки)
  let ySpawnZoneTopCoinTopEdge: number;
  const gamePlatforms = processedTiles.filter(tile => tile.id !== 'p3' && tile.type === 1); // Игровые платформы (не земля P3)

  if (gamePlatforms.length > 0) {
    const actualHighestPlatformTopY = Math.min(...gamePlatforms.map(tile => tile.y));
    ySpawnZoneTopCoinTopEdge = actualHighestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;
  } else {
    // Если других платформ нет, монеты должны быть досягаемы прыжком с P3
    ySpawnZoneTopCoinTopEdge = p3TopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;
  }

  // Убедимся, что верхняя граница зоны не ниже нижней
  if (ySpawnZoneTopCoinTopEdge >= ySpawnZoneBottomCoinTopEdge) {
    console.warn("Coin spawn zone is invalid (top is below or at bottom based on P3 ground). No coins will be generated.");
    return [];
  }

  const newPair: CoinState[] = [];
  const midPoint = canvasWidth / 2;
  const horizontalSpawnMargin = COIN_SIZE * 2;

  const currentTime = Date.now();

  // Coin 1 (left half)
  const leftHalfWidth = midPoint - horizontalSpawnMargin - COIN_SIZE;
  if (leftHalfWidth > 0) {
    const coin1X = Math.max(0, Math.random() * leftHalfWidth);
    const coin1Y = Math.random() * (ySpawnZoneBottomCoinTopEdge - ySpawnZoneTopCoinTopEdge) + ySpawnZoneTopCoinTopEdge;
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
  }

  // Coin 2 (right half)
  const rightHalfBaseX = midPoint + horizontalSpawnMargin;
  const rightHalfWidth = canvasWidth - rightHalfBaseX - COIN_SIZE;
  if (rightHalfWidth > 0) {
    const coin2X = rightHalfBaseX + (Math.random() * rightHalfWidth);
    const coin2Y = Math.random() * (ySpawnZoneBottomCoinTopEdge - ySpawnZoneTopCoinTopEdge) + ySpawnZoneTopCoinTopEdge;
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

    // For Y, positive yOffsetPx for bottom anchors means "distance from bottom edge upwards"
    // For Y, positive yOffsetPx for top anchors means "distance from top edge downwards"
    // For Y, positive yOffsetPx for center anchors means "distance from center downwards"
    switch (rawTile.positioning.anchor) {
      case 'top-left':    tileY = yOffset; break;
      case 'top-center':  tileY = yOffset; break;
      case 'top-right':   tileY = yOffset; break;
      case 'center-left': tileY = (canvasHeight / 2) - (tileHeight / 2) + yOffset; break;
      case 'center':      tileY = (canvasHeight / 2) - (tileHeight / 2) + yOffset; break;
      case 'center-right':tileY = (canvasHeight / 2) - (tileHeight / 2) + yOffset; break;
      case 'bottom-left':   tileY = canvasHeight - tileHeight - yOffset; break; // yOffset from bottom upwards
      case 'bottom-center': tileY = canvasHeight - tileHeight - yOffset; break; // yOffset from bottom upwards
      case 'bottom-right':  tileY = canvasHeight - tileHeight - yOffset; break; // yOffset from bottom upwards
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
    const playerYOffset = rawData.playerStart.yOffsetPx || 0; 
    switch (rawData.playerStart.horizontalAlign) {
      case 'left': playerStartX = startPlatform.x + playerXOffset; break;
      case 'center': playerStartX = startPlatform.x + (startPlatform.width / 2) - (PLAYER_WIDTH / 2) + playerXOffset; break;
      case 'right': playerStartX = startPlatform.x + startPlatform.width - PLAYER_WIDTH - playerXOffset; break;
    }
    playerStartY = startPlatform.y - PLAYER_HEIGHT - playerYOffset; 
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
  const lastFrameTime = useRef<number>(Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });


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
    setActiveCoins([]);

    loadLevel(levelPath)
      .then(data => {
        if (data) {
          setRawLevelData(data);
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
    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !assets.playerImageLoaded || !assets.tileImageLoaded || !assets.coinImageLoaded) {
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
        image: assets.playerImage,
      };
      playerInstanceRef.current = newPlayer;
      if (parentPlayerRef) parentPlayerRef.current = newPlayer;
      
      if (newProcessedLevel.tiles && canvasSize.width > 0 && canvasSize.height > 0) {
        setActiveCoins(spawnNewCoinPair(newProcessedLevel.tiles, canvasSize.width, canvasSize.height));
      }

      setIsLoading(false);
    } catch (error) {
        console.error("Error processing level data:", error);
        toast({ title: "Processing Error", description: "Failed to process level data.", variant: "destructive" });
        setIsLoading(false);
    }
  }, [isClient, rawLevelData, canvasSize, assets, parentPlayerRef, toast]);


  useEffect(() => {
    if (!isClient || isLoading || !processedLevel || !processedLevel.tiles || canvasSize.width === 0 || canvasSize.height === 0) return;

    const allCollectedAndParticlesGone = activeCoins.length > 0 && activeCoins.every(c => c.isCollected && c.particles.length === 0);

    if (allCollectedAndParticlesGone) {
      setActiveCoins(spawnNewCoinPair(processedLevel.tiles, canvasSize.width, canvasSize.height));
    }
  }, [activeCoins, isClient, isLoading, processedLevel, canvasSize]);


  useEffect(() => {
    if (!isClient || isLoading || !processedLevel || !playerInstanceRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    lastFrameTime.current = Date.now(); 

    const gameLoop = () => {
      const currentTime = Date.now();
      const deltaTime = (currentTime - lastFrameTime.current); 
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

      currentLevel.tiles.forEach(tile => {
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

      const updatedCoins = activeCoins.map(coin => {
        let newCoin = { ...coin };

        if (newCoin.particles.length > 0) {
          newCoin.particles = newCoin.particles
            .map(p => {
              const particleDeltaTimeFactor = deltaTime / (1000 / 60); 
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

        if (!newCoin.isCollected && currentTime >= newCoin.targetSpawnTime && newCoin.currentOpacity < 1) {
          const opacityIncrease = deltaTime / COIN_FADE_IN_DURATION;
          newCoin.currentOpacity = Math.min(1, newCoin.currentOpacity + opacityIncrease);
        }

        const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
        if (!newCoin.isCollected && newCoin.currentOpacity > 0.5 && checkCollision(playerRect, newCoin as Rect)) { 
          newCoin.isCollected = true;
          newCoin.collectionTime = currentTime;
          newCoin.currentOpacity = 0; 

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
        }
        return newCoin;
      });

      setActiveCoins(updatedCoins);

      if (parentPlayerRef) parentPlayerRef.current = { ...player };

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderLevel(ctx, currentLevel, assets.tileImage); 
      renderCoins(ctx, activeCoins, assets.coinImage); 
      renderPlayer(ctx, player, assets.playerImage);

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isClient, isLoading, processedLevel, executeAction, resetExecuteAction, parentPlayerRef, assets, canvasSize, activeCoins, setActiveCoins]); // Removed toast from deps

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


