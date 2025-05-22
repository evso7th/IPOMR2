
"use client";

import type { DependencyList } from 'react';
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
import {
  GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
  COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
  COIN_FADE_IN_DURATION, COIN_SPAWN_STAGGER_DELAY, // COIN_SPAWN_STAGGER_DELAY will be effectively 0 for this step
  COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE,
  ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, PLATFORM_SPEED,
  COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR,
  P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION,
  NUMBER_OF_COIN_PAIRS // Used for HUD, not for spawning logic in this simplified version
} from '@/config/gameConfig';
// import { useToast } from "@/hooks/use-toast";
import { checkCollision } from '@/game/utils/collision';
import { renderPlayer } from '@/game/entities/playerRenderer';
import { renderCoins } from '@/game/entities/coinRenderer';
// import { renderEnemies } from '@/game/entities/enemyRenderer'; // Enemies are off for now
import { loadLevel } from '@/lib/levelLoader';

interface AssetContainer {
  playerImage: HTMLImageElement | null;
  tileImage: HTMLImageElement | null;
  coinImage: HTMLImageElement | null;
  stoneImage: HTMLImageElement | null;
  tree1Image: HTMLImageElement | null;
  tree2Image: HTMLImageElement | null;
  flowersImage: HTMLImageElement | null; // For small bushes
  smallBushImage: HTMLImageElement | null; // Alias for flowersImage
  largeBushImage: HTMLImageElement | null;
  houseImage: HTMLImageElement | null;

  playerImageLoaded: boolean;
  tileImageLoaded: boolean;
  coinImageLoaded: boolean;
  stoneImageLoaded: boolean;
  tree1ImageLoaded: boolean;
  tree2ImageLoaded: boolean;
  flowersImageLoaded: boolean;
  smallBushImageLoaded: boolean; // Alias
  largeBushImageLoaded: boolean;
  houseImageLoaded: boolean;
}

interface GameCanvasProps {
  levelPath: string;
  playerRef?: React.MutableRefObject<PlayerState | null>;
  executeAction: GameAction | null;
  resetExecuteAction: () => void;
  onGameStatsUpdate?: (stats: { uncollectedInPair: number; currentPairNum: number; totalPairsNum: number }) => void;
}

export default function GameCanvas({
  levelPath,
  playerRef: parentPlayerRef,
  executeAction,
  resetExecuteAction,
  onGameStatsUpdate,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  
  const [rawLevelData, setRawLevelData] = useState<RawLevelData | null>(null);
  const [processedLevel, setProcessedLevel] = useState<ProcessedLevelData | null>(null);
  const processedLevelRef = useRef<ProcessedLevelData | null>(null);
  
  const playerInstanceRef = useRef<PlayerState | null>(null);
  
  const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  const activeCoinsRef = useRef<CoinState[]>(activeCoins);
  
  const [currentPairIndex, setCurrentPairIndex] = useState(0); // Will not be used to trigger pair spawns for now
  const currentPairIndexRef = useRef<number>(currentPairIndex);
  
  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]); // Enemies are off
  const activeEnemiesRef = useRef<EnemyState[]>(activeEnemies);

  const [assets, setAssets] = useState<AssetContainer>({
    playerImage: null, tileImage: null, coinImage: null, stoneImage: null,
    tree1Image: null, tree2Image: null, flowersImage: null,
    smallBushImage: null, largeBushImage: null, houseImage: null,
    playerImageLoaded: false, tileImageLoaded: false, coinImageLoaded: false, stoneImageLoaded: false,
    tree1ImageLoaded: false, tree2ImageLoaded: false, flowersImageLoaded: false,
    smallBushImageLoaded: false, largeBushImageLoaded: false, houseImageLoaded: false,
  });

  const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const p3CurrentTargetIndexRef = useRef<number>(0);
  const p3MovementStateRef = useRef<{ startTime: number; startX: number; startY: number; targetX: number; targetY: number } | null>(null);
  
  const lastFrameTime = useRef<number>(Date.now());
  const animationFrameIdRef = useRef<number | null>(null);
  const executeActionRef = useRef<GameAction | null>(executeAction);
  
  const parseDimension = useCallback((value: string | number, totalSize: number): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      if (value.endsWith('%')) return (parseFloat(value) / 100) * totalSize;
      if (value.endsWith('px')) return parseFloat(value);
      return parseFloat(value);
    }
    return 0;
  }, []);

  const processRawLevelData = useCallback((
    currentRawLevelData: RawLevelData,
    currentCanvasWidth: number,
    currentCanvasHeight: number
  ): ProcessedLevelData | null => {
    if (!currentRawLevelData || currentCanvasWidth === 0 || currentCanvasHeight === 0) {
      return null;
    }

    let processedTiles: ProcessedTile[] = currentRawLevelData.tiles.map(rawTile => {
      const tileWidth = parseDimension(rawTile.width, currentCanvasWidth);
      const tileHeight = parseDimension(rawTile.height, currentCanvasHeight);
      let tileX = 0;
      let tileY = 0;
      const xOffset = rawTile.positioning.xOffsetPx || 0;
      const yOffset = rawTile.positioning.yOffsetPx || 0;

      switch (rawTile.positioning.anchor) {
        case 'top-left': tileX = xOffset; tileY = yOffset; break;
        case 'top-center': tileX = (currentCanvasWidth / 2) - (tileWidth / 2) + xOffset; tileY = yOffset; break;
        case 'top-right': tileX = currentCanvasWidth - tileWidth - xOffset; tileY = yOffset; break;
        case 'center-left': tileX = xOffset; tileY = (currentCanvasHeight / 2) - (tileHeight / 2) + yOffset; break;
        case 'center': tileX = (currentCanvasWidth / 2) - (tileWidth / 2) + xOffset; tileY = (currentCanvasHeight / 2) - (tileHeight / 2) + yOffset; break;
        case 'center-right': tileX = currentCanvasWidth - tileWidth - xOffset; tileY = (currentCanvasHeight / 2) - (tileHeight / 2) + yOffset; break;
        case 'bottom-left': tileX = xOffset; tileY = currentCanvasHeight - tileHeight - yOffset; break;
        case 'bottom-center': tileX = (currentCanvasWidth / 2) - (tileWidth / 2) + xOffset; tileY = currentCanvasHeight - tileHeight - yOffset; break;
        case 'bottom-right': tileX = currentCanvasWidth - tileWidth - xOffset; tileY = currentCanvasHeight - tileHeight - yOffset; break;
        default: tileX = xOffset; tileY = yOffset;
      }
      return { ...rawTile, x: tileX, y: tileY, width: tileWidth, height: tileHeight };
    });
    
    let playerStartX = 50; 
    let playerStartY = currentCanvasHeight - PLAYER_HEIGHT - 50; 

    const startPlatform = processedTiles.find(tile => tile.id === currentRawLevelData.playerStart.platformId);
    if (startPlatform) {
      switch (currentRawLevelData.playerStart.horizontalAlign) {
        case 'left': playerStartX = startPlatform.x + (currentRawLevelData.playerStart.xOffsetPx || 0); break;
        case 'center': playerStartX = startPlatform.x + (startPlatform.width / 2) - (PLAYER_WIDTH / 2) + (currentRawLevelData.playerStart.xOffsetPx || 0); break;
        case 'right': playerStartX = startPlatform.x + startPlatform.width - PLAYER_WIDTH - (currentRawLevelData.playerStart.xOffsetPx || 0); break;
      }
      playerStartY = startPlatform.y - PLAYER_HEIGHT - (currentRawLevelData.playerStart.yOffsetPx || 0);
    } else {
      console.warn(`[processRawLevelData] Start platform with id "${currentRawLevelData.playerStart.platformId}" not found! Using default player start.`);
    }

    const newPlayer: PlayerState = {
      x: playerStartX,
      y: playerStartY,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      vx: 0,
      vy: 0,
      isOnGround: false,
      isMovingLeft: false,
      isMovingRight: false,
      color: PLAYER_COLOR,
      image: assets.playerImage || undefined,
      facingDirection: 'right',
      activePlatformId: null,
    };
    playerInstanceRef.current = newPlayer;
    if (parentPlayerRef) parentPlayerRef.current = newPlayer;

    if (levelPath === '/levels/level2.json') {
      const p_ground_tile = processedTiles.find(t => t.id === 'p_ground');
      if (p_ground_tile) {
        const p_ground_top_y = p_ground_tile.y;
        const p3_x = (currentCanvasWidth / 2) - (P3_SIZE_W / 2);
        const p3_y = p_ground_top_y - 300;

        p3BasePositionRef.current = { x: p3_x, y: p3_y };
        p3InterestPointsRef.current = [
            { x: p3_x - P3_DRIFT_RANGE, y: p3_y - P3_DRIFT_RANGE },
            { x: p3_x + P3_DRIFT_RANGE, y: p3_y - P3_DRIFT_RANGE },
            { x: p3_x + P3_DRIFT_RANGE, y: p3_y + P3_DRIFT_RANGE },
            { x: p3_x - P3_DRIFT_RANGE, y: p3_y + P3_DRIFT_RANGE },
        ];
        p3CurrentTargetIndexRef.current = 0;
        p3MovementStateRef.current = null; 

        const p3Tile: ProcessedTile = {
            id: 'p3',
            x: p3_x,
            y: p3_y,
            width: P3_SIZE_W,
            height: P3_SIZE_H,
            type: 1,
            color: 'hsl(var(--muted))', 
            vx: 0, 
            direction: 0,
        };
        processedTiles.push(p3Tile);
      } else {
        console.warn("[processRawLevelData] Level 2: p_ground not found for P3 positioning.");
      }
    }
    return {
      playerStart: { xPx: playerStartX, yPx: playerStartY },
      tiles: processedTiles,
    };
  }, [levelPath, assets.playerImage, parentPlayerRef, P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, parseDimension]);

  const spawnNewCoinPair = useCallback(
    (currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number, currentCanvasHeight: number): CoinState[] => {
        if (!currentProcessedLevel || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
            return [];
        }

        const p_ground = currentProcessedLevel.tiles.find(tile => tile.id === 'p_ground');
        if (!p_ground) {
            console.warn("[spawnNewCoinPair] 'p_ground' tile not found for coin spawning. Cannot determine spawn zone. No coins spawned.");
            return [];
        }
        const p_groundTopY = p_ground.y;

        const gamePlatforms = currentProcessedLevel.tiles.filter(tile => tile.type === 1 && tile.id !== 'p_ground' && tile.id !== 'p_top_boundary');
        
        let actualHighestPlatformTopY = p_groundTopY; 
        if (gamePlatforms.length > 0) {
            actualHighestPlatformTopY = Math.min(...gamePlatforms.map(p => p.y));
        }

        const ySpawnZoneBottomCoinTopEdge = p_groundTopY - COIN_VERTICAL_SPAWN_BOTTOM_OFFSET - COIN_SIZE;
        let ySpawnZoneTopCoinTopEdge = actualHighestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;
        
        if (ySpawnZoneTopCoinTopEdge < COIN_SPAWN_TOP_MARGIN) { 
            ySpawnZoneTopCoinTopEdge = COIN_SPAWN_TOP_MARGIN;
        }
        if (ySpawnZoneTopCoinTopEdge >= ySpawnZoneBottomCoinTopEdge) {
            console.warn(`[spawnNewCoinPair] Invalid spawn zone: Top (${ySpawnZoneTopCoinTopEdge}) is below or at Bottom (${ySpawnZoneBottomCoinTopEdge}). No coins spawned.`);
            return [];
        }

        const newCoins: CoinState[] = [];
        const numberOfCoinsToSpawn = 10; // Spawn all 10 coins at once

        for (let i = 0; i < numberOfCoinsToSpawn; i++) {
            const coinX = Math.random() * (currentCanvasWidth - COIN_SIZE); // Random X across the canvas
            const coinY = ySpawnZoneTopCoinTopEdge + Math.random() * (ySpawnZoneBottomCoinTopEdge - ySpawnZoneTopCoinTopEdge);
            const rotationSpeed = COIN_ROTATION_SPEED_MIN + Math.random() * (COIN_ROTATION_SPEED_MAX - COIN_ROTATION_SPEED_MIN);

            newCoins.push({
                id: `coin-${Date.now()}-all-${i}`, // Simplified ID for "all at once" spawn
                x: coinX,
                y: coinY,
                width: COIN_SIZE,
                height: COIN_SIZE,
                isCollected: false,
                targetSpawnTime: Date.now(), // Appear immediately
                currentOpacity: 1, // Fully visible
                isVisuallyPresent: true,
                particles: [],
                rotationAngle: Math.random() * Math.PI * 2,
                rotationSpeed: rotationSpeed,
            });
        }
        console.log(`[spawnNewCoinPair] Created ${newCoins.length} coins at once.`);
        return newCoins;
    },
    [COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX]
  );

  // Effect 1: Set isClient, Load Assets
  useEffect(() => {
    setIsClient(true);
    const assetConfigs = [
      { key: 'playerImage', path: '/assets/images/hero_jeans3.png', hint: 'character hero jeans' },
      { key: 'tileImage', path: '/assets/images/platform_grass.png', hint: 'grass platform surface' },
      { key: 'coinImage', path: '/assets/images/thankscoin.png', hint: 'collectible coin gold' },
      { key: 'stoneImage', path: '/assets/images/stone1.jpg', hint: 'stone rock texture' },
      { key: 'tree1Image', path: '/assets/images/tree1.png', hint: 'tree nature tall' },
      { key: 'tree2Image', path: '/assets/images/tree2.png', hint: 'tree nature smaller' },
      { key: 'flowersImage', path: '/assets/images/flowers.png', hint: 'flowers plant colorful' },
      { key: 'smallBushImage', path: '/assets/images/flowers.png', hint: 'bush flowers small' },
      { key: 'largeBushImage', path: '/assets/images/bush1.png', hint: 'bush large green' },
      { key: 'houseImage', path: '/assets/images/house1.png', hint: 'house building simple' },
    ] as const;

    assetConfigs.forEach(config => {
      const imageKey = config.key as keyof Pick<AssetContainer, `${string}Image`>;
      const loadedKey = `${imageKey}Loaded` as keyof AssetContainer;
      
      if (!assets[imageKey] && !assets[loadedKey]) {
        const img = new Image();
        img.src = config.path;
        img.setAttribute('data-ai-hint', config.hint);
        img.onload = () => setAssets(prev => ({ ...prev, [imageKey]: img, [loadedKey]: true as any }));
        img.onerror = () => {
          console.error(`Failed to load ${imageKey} from ${config.path}.`);
          setAssets(prev => ({ ...prev, [loadedKey]: true as any }));
        };
      }
    });
  }, []); // Empty dependency array: runs once on mount. assets state is managed internally.

  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    if (canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      if (!ctxRef.current) {
        ctxRef.current = canvasRef.current.getContext('2d');
      }
    }
  }, [canvasSize]);

  // Effect 3: Observe parent element size and update canvasSize state
  useEffect(() => {
    if (!isClient || !canvasRef.current?.parentElement) return;
    const parentElement = canvasRef.current.parentElement;

    const updateCanvasSizeState = () => {
      const newWidth = parentElement.clientWidth;
      const newHeight = parentElement.clientHeight;
      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
           if ((newWidth > 0 && newHeight > 0) || (newWidth === 0 && newHeight === 0 && (currentSize.width !== 0 || currentSize.height !== 0))) {
            return { width: newWidth, height: newHeight };
           }
        }
        return currentSize;
      });
    };
    updateCanvasSizeState(); 
    const resizeObserver = new ResizeObserver(updateCanvasSizeState);
    resizeObserver.observe(parentElement);
    
    const initialSizer = () => {
        if (canvasRef.current?.parentElement) updateCanvasSizeState();
    };
    window.addEventListener('resize', initialSizer);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', initialSizer);
    };
  }, [isClient]);

  // Effect 4: Load raw level data
  useEffect(() => {
    if (!isClient || !levelPath) return;
    
    setIsLoading(true); 
    setRawLevelData(null);
    setProcessedLevel(null); 
    processedLevelRef.current = null;
    setActiveCoins([]); 
    activeCoinsRef.current = [];
    setCurrentPairIndex(0); 
    currentPairIndexRef.current = 0;
    setActiveEnemies([]); 
    activeEnemiesRef.current = [];
    
    loadLevel(levelPath)
      .then(data => {
        if (data) {
          setRawLevelData(data);
        } else {
          setRawLevelData(null); 
          setIsLoading(false); 
        }
      })
      .catch(error => {
        console.error(`Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
        setIsLoading(false);
      });
  }, [levelPath, isClient]);

  const allAssetsLoaded = assets.playerImageLoaded && assets.tileImageLoaded && assets.coinImageLoaded && assets.stoneImageLoaded && assets.tree1ImageLoaded && assets.tree2ImageLoaded && assets.flowersImageLoaded && assets.smallBushImageLoaded && assets.largeBushImageLoaded && assets.houseImageLoaded;

  // Effect 5: Process raw level data when available and canvas is sized
  useEffect(() => {
    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded) {
      if (processedLevel !== null) { 
        setProcessedLevel(null); 
        processedLevelRef.current = null;
        playerInstanceRef.current = null;
      }
      return;
    }
    
    const newProcessedLevelData = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
    if (newProcessedLevelData) {
      setProcessedLevel(newProcessedLevelData);
      // playerInstanceRef and parentPlayerRef are set inside processRawLevelData
    } else {
      setProcessedLevel(null);
      playerInstanceRef.current = null;
    }
  }, [isClient, rawLevelData, canvasSize, allAssetsLoaded, processRawLevelData]);

  // Effect 6: Update refs when their corresponding state changes
  useEffect(() => { processedLevelRef.current = processedLevel; }, [processedLevel]);
  useEffect(() => { activeCoinsRef.current = activeCoins; }, [activeCoins]);
  useEffect(() => { currentPairIndexRef.current = currentPairIndex; }, [currentPairIndex]);
  useEffect(() => { activeEnemiesRef.current = activeEnemies; }, [activeEnemies]);

  // Effect 7: Initial entity spawn and finish loading
  useEffect(() => {
    if (!isClient || !processedLevel || canvasSize.width === 0 || canvasSize.height === 0) {
      return;
    }
    
    if (!isLoading) { // Only run if still loading
      return;
    }
    
    let coinsAttempted = activeCoins.length > 0;
    if (!coinsAttempted && processedLevel.tiles.length > 0) {
        const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
        setActiveCoins(newCoins); // Spawn all 10 coins at once
        coinsAttempted = true;
    } else if (processedLevel.tiles.length === 0) {
         coinsAttempted = true;
    }

    // Enemies are currently disabled for level1 and level2
    let enemiesAttempted = true; 
    // if (levelPath !== '/levels/level2.json' && levelPath !== '/levels/level1.json') { ... }
    
    if (coinsAttempted && enemiesAttempted) {
        setIsLoading(false);
    }
  }, [
    isClient, isLoading, processedLevel, canvasSize, levelPath, 
    spawnNewCoinPair // spawnSingleEnemy removed as enemies are off for now
  ]);
  
  // Effect 8: Check coin respawn logic (Simplified: no automatic respawn for "all at once" model)
  useEffect(() => {
    if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) return;

    // This effect previously handled pair-by-pair logic.
    // For "all 10 at once", we don't need to respawn more coins after the initial set.
    // The logic for collection and particle effects remains in gameLoop.
    // If all 10 coins are collected, the game might proceed to a new state (e.g., level complete),
    // but that logic is not part of this effect.
    // console.log("[GameCanvas Effect 8] Check coin respawn. Current activeCoins:", activeCoins.length);

  }, [activeCoins, isClient, isLoading, canvasSize, processedLevelRef]); // Removed spawnNewCoinPair and setCurrentPairIndex

   // Effect 8.5: Spawn coin pair when currentPairIndex changes (Disabled for "all at once" model)
   useEffect(() => {
     // This effect is disabled/simplified for the "all 10 coins at once" model.
     // It previously relied on currentPairIndex to spawn pairs.
     // console.log(`[GameCanvas Effect 8.5] currentPairIndex: ${currentPairIndex} - No action for "all at once" model.`);
   }, [currentPairIndex]); // Minimal dependencies

  // Effect to update executeActionRef when executeAction prop changes
  useEffect(() => {
    executeActionRef.current = executeAction;
  }, [executeAction]);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const currentLevel = processedLevelRef.current; 
    const player = playerInstanceRef.current;
    const currentExecuteActionVal = executeActionRef.current;
    const currentAssets = assets;
    
    const loopStartTime = Date.now();
    let deltaTime = loopStartTime - lastFrameTime.current;
    const MAX_DELTA_TIME_MS = 100; 
    if (deltaTime > MAX_DELTA_TIME_MS) {
        deltaTime = MAX_DELTA_TIME_MS;
    }
    const deltaTimeFactor = Math.max(0.1, Math.min(2, deltaTime / (1000 / 60)));
    lastFrameTime.current = loopStartTime;

    if (!ctx || !canvas || canvas.width === 0 || canvas.height === 0 ) {
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    if (!currentLevel) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = '20px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText('Failed to load level data. Please check server and file path.', canvas.width / 2, canvas.height / 2);
        animationFrameIdRef.current = requestAnimationFrame(gameLoop);
        return;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Render Background Tiles & Platforms
    currentLevel.tiles.forEach(tile => {
      if (tile.layer !== 'foreground') {
        if (tile.type === 1) { 
            if (tile.id.startsWith('stone_') && currentAssets.stoneImage?.complete) {
                ctx.drawImage(currentAssets.stoneImage, tile.x, tile.y, tile.width, tile.height);
            } else if (currentAssets.tileImage?.complete) {
                ctx.drawImage(currentAssets.tileImage, tile.x, tile.y, tile.width, tile.height);
            } else {
                ctx.fillStyle = tile.color;
                ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
            }
        } else { 
            if (tile.id === 'tree1' && currentAssets.tree1Image?.complete) ctx.drawImage(currentAssets.tree1Image, tile.x, tile.y, tile.width, tile.height);
            else if (tile.id === 'tree2' && currentAssets.tree2Image?.complete) ctx.drawImage(currentAssets.tree2Image, tile.x, tile.y, tile.width, tile.height);
            else if (tile.id === 'house1' && currentAssets.houseImage?.complete) ctx.drawImage(currentAssets.houseImage, tile.x, tile.y, tile.width, tile.height);
            else if (tile.id.startsWith('bush_') && currentAssets.largeBushImage?.complete && (tile.id.includes('_2') || tile.id.includes('_right_2') || tile.id.includes('_left_2'))) ctx.drawImage(currentAssets.largeBushImage, tile.x, tile.y, tile.width, tile.height);
            else if (tile.id.startsWith('bush_') && currentAssets.smallBushImage?.complete && (tile.id.includes('_1') || tile.id.includes('_right_1') || tile.id.includes('_left_1'))) ctx.drawImage(currentAssets.smallBushImage, tile.x, tile.y, tile.width, tile.height); 
            else {
                 ctx.fillStyle = tile.color;
                 ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
            }
        }
      }
    });
    
    // Update and Render P3 platform if it exists
    const p3Tile = currentLevel.tiles.find(t => t.id === 'p3');
    if (p3Tile && p3BasePositionRef.current && p3InterestPointsRef.current.length > 0) {
        if (!p3MovementStateRef.current || Date.now() >= p3MovementStateRef.current.startTime + P3_MOVEMENT_DURATION) {
            const currentX = p3Tile.x;
            const currentY = p3Tile.y;
            
            let nextTargetIndex = p3CurrentTargetIndexRef.current;
            if (p3InterestPointsRef.current.length > 1) {
                do {
                    nextTargetIndex = Math.floor(Math.random() * p3InterestPointsRef.current.length);
                } while (nextTargetIndex === p3CurrentTargetIndexRef.current);
            } else {
                nextTargetIndex = 0; 
            }
            p3CurrentTargetIndexRef.current = nextTargetIndex;
            
            const targetPoint = p3InterestPointsRef.current[nextTargetIndex];
            p3MovementStateRef.current = {
                startTime: Date.now(),
                startX: currentX,
                startY: currentY,
                targetX: targetPoint.x,
                targetY: targetPoint.y,
            };
        }

        if (p3MovementStateRef.current) {
            const { startTime, startX, startY, targetX, targetY } = p3MovementStateRef.current;
            const elapsedTime = Date.now() - startTime;
            const progress = Math.min(elapsedTime / P3_MOVEMENT_DURATION, 1);

            const newP3X = startX + (targetX - startX) * progress;
            const newP3Y = startY + (targetY - startY) * progress;
            
            p3Tile.x = newP3X;
            p3Tile.y = newP3Y;
        }
    }

    // Update other moving platforms (P1, P2)
    if (currentLevel && currentLevel.tiles && canvasRef.current) {
        const canvas = canvasRef.current;
        currentLevel.tiles.forEach(tile => {
            if (tile.id !== 'p3' && tile.vx && tile.direction) { 
                let newX = tile.x + (tile.vx * tile.direction * deltaTimeFactor);
                if (newX + tile.width > canvas.width) {
                    newX = canvas.width - tile.width;
                    tile.direction *= -1;            
                } else if (newX < 0) {
                    newX = 0;                        
                    tile.direction *= -1;            
                }
                tile.x = newX;
            }
        });
    }
    
    // Player Update Logic
    if (player) {
        if (currentExecuteActionVal) {
          if (currentExecuteActionVal === 'moveLeft') player.isMovingLeft = true;
          else if (currentExecuteActionVal === 'moveRight') player.isMovingRight = true;
          else if (currentExecuteActionVal === 'stopMoveLeft') player.isMovingLeft = false;
          else if (currentExecuteActionVal === 'stopMoveRight') player.isMovingRight = false;
          else if (currentExecuteActionVal === 'jump' && player.isOnGround) {
            player.vy = JUMP_STRENGTH;
            player.isOnGround = false;
            player.activePlatformId = null; 
          }
          resetExecuteAction(); 
          executeActionRef.current = null; 
        }

        player.vy += GRAVITY * deltaTimeFactor;
        if (player.isMovingLeft) {
          player.vx = -PLAYER_SPEED;
          player.facingDirection = 'left';
        } else if (player.isMovingRight) {
          player.vx = PLAYER_SPEED;
          player.facingDirection = 'right';
        } else {
          player.vx = 0;
        }

        let nextPlayerX = player.x + player.vx * deltaTimeFactor;
        let nextPlayerY = player.y + player.vy * deltaTimeFactor;
        
        let tempIsOnGround = false;
        let activePlatformThisFrame: ProcessedTile | null = null;
        let platformInducedMoveX = 0;

        currentLevel.tiles.forEach(tile => {
            if (tile.type !== 1) return; 

            const tileRect: Rect = { x: tile.x, y: tile.y, width: tile.width, height: tile.height };
            let hadHorizontalCollisionWithThisTile = false;

            const playerHorizontalRect: Rect = { x: nextPlayerX, y: player.y, width: player.width, height: player.height };
            if (checkCollision(playerHorizontalRect, tileRect)) {
                const playerCenter_X = nextPlayerX + player.width / 2;
                const tileCenter_X = tile.x + tile.width / 2;
                if (playerCenter_X < tileCenter_X) nextPlayerX = tile.x - player.width;
                else nextPlayerX = tile.x + tile.width;
                player.vx = 0;
                hadHorizontalCollisionWithThisTile = true;
            }

            const playerVerticalRect: Rect = { x: player.x, y: nextPlayerY, width: player.width, height: player.height };
            if (checkCollision(playerVerticalRect, tileRect)) {
                if (player.vy > 0) {
                    if (hadHorizontalCollisionWithThisTile) {
                        nextPlayerY = tile.y - player.height;
                        player.vy = 0;
                    } else {
                        nextPlayerY = tile.y - player.height;
                        tempIsOnGround = true;
                        activePlatformThisFrame = tile;
                        player.vy = 0;
                    }
                } else if (player.vy < 0) {
                    nextPlayerY = tile.y + tile.height;
                    player.vy = 0;
                }
            }
        });
        
        player.x = nextPlayerX;
        player.y = nextPlayerY;
        player.isOnGround = tempIsOnGround;
        
        if (player.isOnGround && activePlatformThisFrame) {
            player.activePlatformId = activePlatformThisFrame.id;
            if (activePlatformThisFrame.id === 'p3' && p3MovementStateRef.current) {
                const p3_delta_x = p3Tile!.x - (p3MovementStateRef.current.startX + (p3MovementStateRef.current.targetX - p3MovementStateRef.current.startX) * ( (Date.now() - p3MovementStateRef.current.startTime - deltaTime ) / P3_MOVEMENT_DURATION) );
                const p3_delta_y = p3Tile!.y - (p3MovementStateRef.current.startY + (p3MovementStateRef.current.targetY - p3MovementStateRef.current.startY) * ( (Date.now() - p3MovementStateRef.current.startTime - deltaTime ) / P3_MOVEMENT_DURATION) );
                player.x += p3_delta_x;
                player.y += p3_delta_y;
            } else if (activePlatformThisFrame.vx && activePlatformThisFrame.direction) { 
              platformInducedMoveX = (activePlatformThisFrame.vx * activePlatformThisFrame.direction * deltaTimeFactor);
              player.x += platformInducedMoveX;
            }
        } else if (!player.isOnGround) {
            player.activePlatformId = null;
        }
        
        if (player.x < 0) player.x = 0;
        else if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
        
        const groundPlatform = currentLevel.tiles.find(t => t.id === 'p_ground');
        if (player.y + player.height > canvas.height) { 
             if (groundPlatform && player.y + player.height > groundPlatform.y) {
                player.y = groundPlatform.y - player.height;
                player.isOnGround = true; 
                player.vy = 0;
                player.activePlatformId = groundPlatform.id;
             } else { // Fell off screen entirely
                player.y = canvas.height - player.height; // Fallback, should be handled by death/reset logic
                player.isOnGround = true; 
                player.vy = 0;
             }
        }
        const topBoundary = currentLevel.tiles.find(t => t.id === 'p_top_boundary');
        if (topBoundary && player.y < topBoundary.y + topBoundary.height) { 
            player.y = topBoundary.y + topBoundary.height;
            player.vy = 0;
        }
        renderPlayer(ctx, player, currentAssets.playerImage);
    }

    // Update and Render Coins
    const currentActiveCoins = activeCoinsRef.current;
    if (currentActiveCoins.length > 0) {
        const updatedCoins = currentActiveCoins.map(coin => {
            let newParticles = [...coin.particles];
            let newIsVisuallyPresent = coin.isVisuallyPresent;
            let newOpacity = coin.currentOpacity;

            if (coin.isCollected && coin.collectionTime) {
                if (coin.particles.length === 0 && coin.isVisuallyPresent) { 
                    for (let i = 0; i < COIN_PARTICLE_COUNT; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const speed = Math.random() * COIN_PARTICLE_SPEED_MULTIPLIER + 0.5;
                        newParticles.push({
                            x: coin.x + coin.width / 2,
                            y: coin.y + coin.height / 2,
                            vx: Math.cos(angle) * speed,
                            vy: Math.sin(angle) * speed,
                            size: COIN_PARTICLE_SIZE,
                            opacity: 1,
                            life: COIN_PARTICLE_LIFESPAN,
                        });
                    }
                }
                newParticles = newParticles.map(p => ({
                    ...p,
                    x: p.x + p.vx * deltaTimeFactor,
                    y: p.y + p.vy * deltaTimeFactor + (GRAVITY * COIN_PARTICLE_GRAVITY_FACTOR * deltaTimeFactor),
                    life: p.life - deltaTime,
                    opacity: Math.max(0, p.life / COIN_PARTICLE_LIFESPAN),
                })).filter(p => p.life > 0);
                
                newOpacity = 0; // Collected coin itself is immediately hidden
                newIsVisuallyPresent = newParticles.length > 0; // Visually present if particles exist
            } else if (Date.now() >= coin.targetSpawnTime && coin.currentOpacity < 1) {
                // This fade-in logic will not run if opacity starts at 1
                 newOpacity = Math.min(1, coin.currentOpacity + deltaTime / COIN_FADE_IN_DURATION);
            }


            return { ...coin, currentOpacity: newOpacity, particles: newParticles, isVisuallyPresent: newIsVisuallyPresent, rotationAngle: (coin.rotationAngle + coin.rotationSpeed * deltaTimeFactor) % (Math.PI * 2) };
        });
        setActiveCoins(updatedCoins);
    }
    if (onGameStatsUpdate) {
      onGameStatsUpdate({ 
        uncollectedInPair: activeCoinsRef.current.filter(c => !c.isCollected && c.isVisuallyPresent).length, // Count only visually present, uncollected coins
        currentPairNum: currentPairIndexRef.current, 
        totalPairsNum: NUMBER_OF_COIN_PAIRS 
      });
    }
    renderCoins(ctx, activeCoinsRef.current, currentAssets.coinImage); 

    // Render Foreground Decorative Tiles
    currentLevel.tiles.forEach(tile => {
      if (tile.layer === 'foreground') {
        if ((tile.id.includes('bush_left_1') || tile.id.includes('bush_right_1')) && currentAssets.smallBushImage?.complete) ctx.drawImage(currentAssets.smallBushImage, tile.x, tile.y, tile.width, tile.height);
        else if ((tile.id.includes('bush_left_2') || tile.id.includes('bush_right_2')) && currentAssets.largeBushImage?.complete) ctx.drawImage(currentAssets.largeBushImage, tile.x, tile.y, tile.width, tile.height);
        else {
            ctx.fillStyle = tile.color;
            ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
        }
      }
    });
        
    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, [
    isClient, assets, resetExecuteAction, 
    onGameStatsUpdate, 
    GRAVITY, JUMP_STRENGTH, PLAYER_SPEED, PLAYER_HEIGHT, PLAYER_WIDTH,
    COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE, COIN_FADE_IN_DURATION,
    PLATFORM_SPEED, P3_MOVEMENT_DURATION,
    // Refs used in gameLoop:
    processedLevelRef, playerInstanceRef, activeCoinsRef, currentPairIndexRef,
    p3BasePositionRef, p3InterestPointsRef, p3CurrentTargetIndexRef, p3MovementStateRef,
    // Stable setters:
    setActiveCoins, 
  ]);

  // Effect 9: Start/Stop Game Loop
  useEffect(() => {
    const conditionsMet = isClient && !isLoading && canvasRef.current && ctxRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevelRef.current ;
    
    if (conditionsMet) {
      lastFrameTime.current = Date.now(); 
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    } else {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    }
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [isClient, isLoading, canvasSize, processedLevel, gameLoop]); 

  if (!isClient) {
    return null; 
  }
  
  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full"
      aria-label="Game Canvas"
      tabIndex={0} 
    />
  );
}

