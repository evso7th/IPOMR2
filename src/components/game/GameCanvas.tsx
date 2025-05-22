
"use client";

import type { DependencyList } from 'react';
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState, GameStats } from '@/types/game';
import {
  GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
  COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
  COIN_FADE_IN_DURATION, TOTAL_COINS_ON_LEVEL,
  COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE,
  ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, PLATFORM_SPEED,
  COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR,
  P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION, COIN_SPAWN_STAGGER_DELAY
} from '@/config/gameConfig';

// import { useToast } from "@/hooks/use-toast";
import { checkCollision } from '@/game/utils/collision';
import { renderPlayer } from '@/game/entities/playerRenderer';
import { renderCoins } from '@/game/entities/coinRenderer';
// import { renderLevel } from '@/game/entities/levelRenderer'; // Tiles are rendered directly in gameLoop
import { renderEnemies } from '@/game/entities/enemyRenderer';
import { loadLevel } from '@/lib/levelLoader';

interface AssetContainer {
  playerImage: HTMLImageElement | null;
  tileImage: HTMLImageElement | null;
  coinImage: HTMLImageElement | null;
  stoneImage: HTMLImageElement | null;
  tree1Image: HTMLImageElement | null;
  tree2Image: HTMLImageElement | null;
  flowersImage: HTMLImageElement | null;
  smallBushImage: HTMLImageElement | null;
  largeBushImage: HTMLImageElement | null;
  houseImage: HTMLImageElement | null;

  playerImageLoaded: boolean;
  tileImageLoaded: boolean;
  coinImageLoaded: boolean;
  stoneImageLoaded: boolean;
  tree1ImageLoaded: boolean;
  tree2ImageLoaded: boolean;
  flowersImageLoaded: boolean;
  smallBushImageLoaded: boolean;
  largeBushImageLoaded: boolean;
  houseImageLoaded: boolean;
}

interface GameCanvasProps {
  levelPath: string;
  playerRef?: React.MutableRefObject<PlayerState | null>;
  executeAction: GameAction | null;
  resetExecuteAction: () => void;
  onGameStatsUpdate?: (stats: GameStats) => void;
}

export default function GameCanvas({
  levelPath,
  playerRef: parentPlayerRef,
  executeAction,
  resetExecuteAction,
  onGameStatsUpdate,
}: GameCanvasProps) {
  // console.log(`[GameCanvas] Component body. levelPath: ${levelPath}`); // Effect 0
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
  
  const [totalCoinsSpawnedThisLevel, setTotalCoinsSpawnedThisLevel] = useState(0);
  const totalCoinsSpawnedThisLevelRef = useRef(totalCoinsSpawnedThisLevel);

  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);
  const activeEnemiesRef = useRef<EnemyState[]>(activeEnemies);

  const [assets, setAssets] = useState<AssetContainer>({
    playerImage: null, tileImage: null, coinImage: null, stoneImage: null,
    tree1Image: null, tree2Image: null, flowersImage: null,
    smallBushImage: null, largeBushImage: null, houseImage: null,
    playerImageLoaded: false, tileImageLoaded: false, coinImageLoaded: false, stoneImageLoaded: false,
    tree1ImageLoaded: false, tree2ImageLoaded: false, flowersImageLoaded: false,
    smallBushImageLoaded: false, largeBushImageLoaded: false, houseImageLoaded: false,
  });

  // Refs for P3 platform movement (specific to level 2 or where P3 is used)
  const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const p3CurrentTargetIndexRef = useRef<number>(0);
  const p3MovementStateRef = useRef<{ startTime: number; startX: number; startY: number; targetX: number; targetY: number } | null>(null);
  
  const lastFrameTime = useRef<number>(Date.now());
  const animationFrameIdRef = useRef<number | null>(null);
  const executeActionRef = useRef<GameAction | null>(executeAction);

  // Effect 1: Set isClient, Load Assets
  useEffect(() => {
    // console.log("[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state:", isClient);
    setIsClient(true);
    const assetConfigs = [
      { key: 'playerImage', path: '/assets/images/hero_jeans3.png', hint: 'character hero jeans' },
      { key: 'tileImage', path: '/assets/images/platform_grass.png', hint: 'grass platform surface' },
      { key: 'coinImage', path: '/assets/images/thankscoin.png', hint: 'collectible coin gold' },
      { key: 'stoneImage', path: '/assets/images/stone1.jpg', hint: 'stone rock texture' },
      { key: 'tree1Image', path: '/assets/images/tree1.png', hint: 'tree nature tall' }, 
      { key: 'tree2Image', path: '/assets/images/tree2.png', hint: 'tree nature smaller' },
      { key: 'flowersImage', path: '/assets/images/flowers.png', hint: 'flowers plant colorful' }, 
      { key: 'smallBushImage', path: '/assets/images/flowers.png', hint: 'bush small green' }, // Re-using flowers for small bush
      { key: 'largeBushImage', path: '/assets/images/bush1.png', hint: 'bush large green' }, 
      { key: 'houseImage', path: '/assets/images/house1.png', hint: 'house building simple' }, 
    ] as const;

    assetConfigs.forEach(config => {
      const imageKey = config.key as keyof Pick<AssetContainer, `${string}Image`>;
      const loadedKey = `${imageKey}Loaded` as keyof AssetContainer;
      
      setAssets(currentAssets => {
        if (!currentAssets[imageKey] && !currentAssets[loadedKey]) {
          const img = new Image();
          img.src = config.path;
          img.setAttribute('data-ai-hint', config.hint);
          img.onload = () => setAssets(prev => ({ ...prev, [imageKey]: img, [loadedKey]: true as any }));
          img.onerror = () => {
            console.error(`Failed to load ${imageKey} from ${config.path}.`);
            setAssets(prev => ({ ...prev, [loadedKey]: true as any })); 
          };
          return { ...currentAssets, [imageKey]: img as any}; 
        }
        return currentAssets;
      });
    });
  }, []);

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
    // console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
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
      // console.warn(`[processRawLevelData] Start platform with id "${currentRawLevelData.playerStart.platformId}" not found! Using default player start.`);
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

    // Programmatically add P3 (dithering platform) only for level 2
    if (levelPath === '/levels/level2.json') {
        const p_ground_tile = processedTiles.find(t => t.id === 'p_ground');
        if (p_ground_tile) {
            const p3_size_w_val = P3_SIZE_W; 
            const p3_size_h_val = P3_SIZE_H; 
            const p_ground_top_y = p_ground_tile.y;
            
            // P3 centered horizontally, its top surface 300px above p_ground's top surface
            const p3_x = (currentCanvasWidth / 2) - (p3_size_w_val / 2); 
            const p3_final_top_y = p_ground_top_y - 300; // Desired Y for the *top* surface of P3
            const p3_actual_y_coord = p3_final_top_y; // Y-coordinate for drawing is the top-left corner.

            p3BasePositionRef.current = { x: p3_x, y: p3_actual_y_coord };
            const driftRange = P3_DRIFT_RANGE;
            p3InterestPointsRef.current = [ 
                { x: p3_x - driftRange, y: p3_actual_y_coord - driftRange },
                { x: p3_x + driftRange, y: p3_actual_y_coord - driftRange },
                { x: p3_x + driftRange, y: p3_actual_y_coord + driftRange },
                { x: p3_x - driftRange, y: p3_actual_y_coord + driftRange },
            ];
            p3CurrentTargetIndexRef.current = 0; 
            p3MovementStateRef.current = null; 

            const p3TileToAdd: ProcessedTile = {
                id: 'p3',
                x: p3_x, 
                y: p3_actual_y_coord,
                width: p3_size_w_val,
                height: p3_size_h_val,
                type: 1, 
                color: 'hsl(var(--muted))', 
                vx: 0, 
                direction: 0,
            };
            processedTiles.push(p3TileToAdd);
            // console.log(`[processRawLevelData] Level 2: Added p3Tile:`, p3TileToAdd);
        } else {
            // console.warn("[processRawLevelData] Level 2: p_ground tile not found, cannot create P3 relative to it.");
        }
    }


    return {
      playerStart: { xPx: playerStartX, yPx: playerStartY },
      tiles: processedTiles,
    };
  }, [levelPath, assets.playerImage, parentPlayerRef, parseDimension, P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE]);

  const spawnSingleCoin = useCallback(
    (currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number, currentCanvasHeight: number, coinIndex: number): CoinState[] => {
        if (!currentProcessedLevel || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
            // console.warn("[spawnSingleCoin] Aborted: No processed level or canvas dimensions are zero.");
            return [];
        }

        const p_ground = currentProcessedLevel.tiles.find(tile => tile.id === 'p_ground');
        if (!p_ground) {
            // console.warn("[spawnSingleCoin] 'p_ground' tile not found for coin spawning. Cannot determine spawn zone.");
            return [];
        }
        const p_groundTopY = p_ground.y;
        const gamePlatforms = currentProcessedLevel.tiles.filter(tile => tile.type === 1 && tile.id !== 'p_ground' && tile.id !== 'p_top_boundary');
        
        let actualHighestPlatformTopY = p_groundTopY; 
        if (gamePlatforms.length > 0) {
            actualHighestPlatformTopY = Math.min(...gamePlatforms.map(p => p.y), p_groundTopY);
        }

        const ySpawnZoneBottomCoinTopEdge = p_groundTopY - COIN_VERTICAL_SPAWN_BOTTOM_OFFSET - COIN_SIZE;
        let ySpawnZoneTopCoinTopEdge = actualHighestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;
        
        if (ySpawnZoneTopCoinTopEdge < COIN_SPAWN_TOP_MARGIN) { 
            ySpawnZoneTopCoinTopEdge = COIN_SPAWN_TOP_MARGIN;
        }
        
        if (ySpawnZoneTopCoinTopEdge >= ySpawnZoneBottomCoinTopEdge) {
            // console.warn(`[spawnSingleCoin] Invalid spawn zone: Top (${ySpawnZoneTopCoinTopEdge}) is at or below Bottom (${ySpawnZoneBottomCoinTopEdge}). No coin spawned.`);
            return [];
        }

        const coinX = Math.random() * (currentCanvasWidth - COIN_SIZE);
        const coinY = ySpawnZoneTopCoinTopEdge + Math.random() * (ySpawnZoneBottomCoinTopEdge - ySpawnZoneTopCoinTopEdge);
        const rotationSpeed = COIN_ROTATION_SPEED_MIN + Math.random() * (COIN_ROTATION_SPEED_MAX - COIN_ROTATION_SPEED_MIN);
        const uniqueId = `coin-${Date.now()}-${coinIndex}-${totalCoinsSpawnedThisLevelRef.current}`;

        return [{
            id: uniqueId,
            x: coinX,
            y: coinY,
            width: COIN_SIZE,
            height: COIN_SIZE,
            isCollected: false,
            targetSpawnTime: Date.now() + (coinIndex * COIN_SPAWN_STAGGER_DELAY), // coinIndex within pair logic
            currentOpacity: 0, 
            isVisuallyPresent: true,
            particles: [],
            rotationAngle: Math.random() * Math.PI * 2,
            rotationSpeed: rotationSpeed,
        }];
    },
    [COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX, COIN_SPAWN_STAGGER_DELAY]
  );

  const spawnSingleEnemy = useCallback((currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number): EnemyState | null => {
    if (!currentProcessedLevel || !currentProcessedLevel.tiles) {
        // console.warn("[spawnSingleEnemy] No processed level or tiles, cannot spawn enemy.");
        return null;
    }

    const p1 = currentProcessedLevel.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
    const p2 = currentProcessedLevel.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');

    if (!p1 || !p2) {
        // console.warn("[spawnSingleEnemy] P1 or P2 not found, cannot determine enemy Y position.");
        return null;
    }

    const p1CenterY = p1.y + p1.height / 2;
    const p2CenterY = p2.y + p2.height / 2;
    const enemyY = (p1CenterY + p2CenterY) / 2 - ENEMY_RADIUS; 

    const enemy: EnemyState = {
      id: `enemy-${Date.now()}`,
      x: 50, 
      y: enemyY,
      radius: ENEMY_RADIUS,
      width: ENEMY_RADIUS * 2,
      height: ENEMY_RADIUS * 2,
      vx: PLATFORM_SPEED * ENEMY_SPEED_FACTOR,
      direction: 1, 
      color: ENEMY_COLOR,
    };
    return enemy;
  }, [ENEMY_RADIUS, ENEMY_COLOR, PLATFORM_SPEED, ENEMY_SPEED_FACTOR]);

  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    // console.log("[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize:", canvasSize);
    if (canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      if (!ctxRef.current) {
        ctxRef.current = canvasRef.current.getContext('2d');
        // console.log("[GameCanvas Effect 2] Canvas context obtained/confirmed.");
      }
      // console.log(`[GameCanvas Effect 2] Canvas attributes set to W:${canvasSize.width}, H:${canvasSize.height}`);
    }
  }, [canvasSize]);

  // Effect 3: Observe parent element size and update canvasSize state
  useEffect(() => {
    // console.log("[GameCanvas Effect 3] Running: Observe parent size. isClient:", isClient);
    if (!isClient || !canvasRef.current?.parentElement) {
        return;
    }
    const parentElement = canvasRef.current.parentElement;
    const updateCanvasSizeState = () => {
      const newWidth = parentElement.clientWidth;
      const newHeight = parentElement.clientHeight;
      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
           if ((newWidth > 0 && newHeight > 0) || (newWidth === 0 && newHeight === 0 && (currentSize.width !== 0 || currentSize.height !== 0))) {
            // console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
            return { width: newWidth, height: newHeight };
           }
        }
        return currentSize;
      });
    };
    updateCanvasSizeState(); 
    const resizeObserver = new ResizeObserver(updateCanvasSizeState);
    resizeObserver.observe(parentElement);
    window.addEventListener('resize', updateCanvasSizeState); 
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateCanvasSizeState);
    };
  }, [isClient]);

  // Effect 4: Load raw level data
  useEffect(() => {
    // console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      return;
    }
    
    if (!isLoading) setIsLoading(true); 
    setRawLevelData(null);
    setProcessedLevel(null); 
    processedLevelRef.current = null;
    setActiveCoins([]); 
    activeCoinsRef.current = [];
    setActiveEnemies([]); 
    activeEnemiesRef.current = [];
    setTotalCoinsSpawnedThisLevel(0);
    totalCoinsSpawnedThisLevelRef.current = 0;
    
    loadLevel(levelPath)
      .then(data => {
        if (data) {
          // console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
          setRawLevelData(data);
        } else {
          // console.warn(`[GameCanvas Effect 4] loadLevel returned null for ${levelPath}.`);
          setRawLevelData(null); 
        }
      })
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
      });
  }, [levelPath, isClient, setIsLoading]); // Added setIsLoading to dependencies

  const allAssetsLoaded = assets.playerImageLoaded && assets.tileImageLoaded && assets.coinImageLoaded && assets.stoneImageLoaded && assets.tree1ImageLoaded && assets.tree2ImageLoaded && assets.flowersImageLoaded && assets.smallBushImageLoaded && assets.largeBushImageLoaded && assets.houseImageLoaded;

  // Effect 5: Process raw level data when available and canvas is sized
  useEffect(() => {
    // console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${allAssetsLoaded}`);
    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded) {
      if (processedLevelRef.current !== null) { 
        // console.log("[GameCanvas Effect 5] Conditions not met or critical data missing, clearing processedLevel.");
        setProcessedLevel(null); 
        processedLevelRef.current = null;
        playerInstanceRef.current = null;
      }
      return;
    }
    
    const newProcessedLevelData = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
    if (newProcessedLevelData) {
      // console.log("[GameCanvas Effect 5] Successfully processed level.");
      setProcessedLevel(newProcessedLevelData);
      processedLevelRef.current = newProcessedLevelData;
    } else {
      // console.warn("[GameCanvas Effect 5] processRawLevelData returned null.");
      setProcessedLevel(null);
      processedLevelRef.current = null;
      playerInstanceRef.current = null;
    }
  }, [isClient, rawLevelData, canvasSize, allAssetsLoaded, processRawLevelData, setProcessedLevel, parentPlayerRef]); 

  // Effect 6: Update refs for activeCoins, activeEnemies, totalCoinsSpawnedThisLevel
  useEffect(() => { activeCoinsRef.current = activeCoins; }, [activeCoins]);
  useEffect(() => { activeEnemiesRef.current = activeEnemies; }, [activeEnemies]);
  useEffect(() => { totalCoinsSpawnedThisLevelRef.current = totalCoinsSpawnedThisLevel; }, [totalCoinsSpawnedThisLevel]);

  // Effect 7: Set isLoading = false and spawn initial entities
  useEffect(() => {
    // console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevelRef.current}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoins.length}`);
    
    if (!isLoading) { // Only run if still loading
        // console.log("[GameCanvas Effect 7] isLoading is false, skipping (already loaded or loading finished).");
        return;
    }

    if (isClient && processedLevelRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
        if (activeCoinsRef.current.length === 0 && totalCoinsSpawnedThisLevelRef.current === 0 && processedLevelRef.current.tiles.length > 0) {
            // console.log("[GameCanvas Effect 7] Spawning first coin for the level.");
            const newCoin = spawnSingleCoin(processedLevelRef.current, canvasSize.width, canvasSize.height, 0);
            if (newCoin.length > 0) {
                setActiveCoins(newCoin); // Spawn the first coin
            }
        }

        if (levelPath !== '/levels/level1.json' && levelPath !== '/levels/level2.json') {
            if (activeEnemiesRef.current.length === 0 && processedLevelRef.current.tiles.length > 0) {
                 const p1 = processedLevelRef.current.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
                 const p2 = processedLevelRef.current.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');
                 if (p1 && p2) {
                    // console.log("[GameCanvas Effect 7] Spawning enemy for the level.");
                    const newEnemy = spawnSingleEnemy(processedLevelRef.current, canvasSize.width);
                    if (newEnemy) setActiveEnemies([newEnemy]);
                 }
            }
        }
        // console.log("[GameCanvas Effect 7] All initial entities attempted or not needed, setting isLoading to false.");
        setIsLoading(false);
    } else if (isClient && !processedLevelRef.current && !rawLevelData && !isLoading) {
        // console.warn("[GameCanvas Effect 7] rawLevelData is null (fetch failed?), but isLoading is false. Re-setting isLoading to false to show error message if any.");
        setIsLoading(false); 
    } else if (isClient && !processedLevelRef.current && rawLevelData && !isLoading) {
         // console.log("[GameCanvas Effect 7] No processed level, but raw data exists and not loading. Likely waiting for canvasSize or assets. Let's ensure isLoading=true if conditions for processing not met.");
         if (canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded) {
            // setIsLoading(true); // This might cause a loop if not careful
         } else {
            // setIsLoading(false); // All processing pre-reqs met but processedLevel is null
         }
    }
  }, [
    isLoading, isClient, processedLevel, // This is state, will trigger re-run
    canvasSize, levelPath, // Props/state that define the level
    allAssetsLoaded, // State for asset loading
    spawnSingleCoin, spawnSingleEnemy, 
    setActiveCoins, setActiveEnemies, setIsLoading, rawLevelData // Include setters
  ]);

  // Effect 8: Handle subsequent coin spawning after collection
  useEffect(() => {
    // console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, processedLevel: ${!!processedLevelRef.current}, activeCoins count: ${activeCoinsRef.current.length}, totalSpawned: ${totalCoinsSpawnedThisLevelRef.current}`);
    if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
        return;
    }
    
    const currentActiveCoins = activeCoinsRef.current;
    if (currentActiveCoins.length === 1) { // Now we expect only one active coin at a time
        const coin = currentActiveCoins[0];
        // If the current coin is collected, its particles are gone, and it's no longer visually present
        if (coin.isCollected && !coin.isVisuallyPresent && coin.particles.length === 0) {
            // totalCoinsSpawnedThisLevelRef has already been incremented in gameLoop when coin was marked collected
            // So, if it's less than TOTAL_COINS_ON_LEVEL, we spawn the next one.
            if (totalCoinsSpawnedThisLevelRef.current < TOTAL_COINS_ON_LEVEL) {
                // console.log(`[GameCanvas Effect 8] Spawning next coin, index: ${totalCoinsSpawnedThisLevelRef.current}`);
                const newCoin = spawnSingleCoin(processedLevelRef.current, canvasSize.width, canvasSize.height, totalCoinsSpawnedThisLevelRef.current);
                if (newCoin.length > 0) {
                    setActiveCoins(newCoin);
                } else {
                    // console.warn("[GameCanvas Effect 8] spawnSingleCoin returned no new coin for the next spawn.");
                    setActiveCoins([]); // Ensure activeCoins is empty if spawn fails
                }
            } else {
                // console.log("[GameCanvas Effect 8] All coins for the level collected and spawned.");
                setActiveCoins([]); // All coins collected, clear the last one
            }
        }
    } else if (currentActiveCoins.length === 0 && totalCoinsSpawnedThisLevelRef.current === 0 && processedLevelRef.current.tiles.length > 0) {
        // This handles initial spawn if Effect 7 somehow missed it or if level resets.
        // console.log("[GameCanvas Effect 8] No active coins and no coins spawned yet. Attempting to spawn the first coin.");
        const newCoin = spawnSingleCoin(processedLevelRef.current, canvasSize.width, canvasSize.height, 0);
        if (newCoin.length > 0) {
            setActiveCoins(newCoin);
        }
    }

  }, [
      activeCoins, // Key dependency: runs when activeCoins changes
      isLoading, isClient, canvasSize, processedLevel, // Other relevant states/props
      spawnSingleCoin, // Callback
      TOTAL_COINS_ON_LEVEL, // Config
      setActiveCoins, // Setter
  ]);
  
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!currentLevel) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = '20px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText('Failed to load level data. Please check server and file path.', canvas.width / 2, canvas.height / 2);
        animationFrameIdRef.current = requestAnimationFrame(gameLoop);
        return;
    }
    
    // Render background tiles and platforms
    currentLevel.tiles.forEach(tile => {
      if (tile.layer !== 'foreground' && tile.id !=='p3') { 
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
            else { 
                 ctx.fillStyle = tile.color;
                 ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
            }
        }
      }
    });
    
    // P3 Platform Update Logic (dithering platform, only if it exists for the current level)
    const p3Tile = currentLevel.tiles.find(t => t.id === 'p3');
    if (p3Tile && p3BasePositionRef.current && p3InterestPointsRef.current.length > 0 && p3MovementStateRef) {
        if (!p3MovementStateRef.current || Date.now() >= p3MovementStateRef.current.startTime + P3_MOVEMENT_DURATION) {
            const currentX = p3Tile.x;
            const currentY = p3Tile.y;
            let nextTargetIndex = p3CurrentTargetIndexRef.current;
            if (p3InterestPointsRef.current.length > 1) { 
                do { nextTargetIndex = Math.floor(Math.random() * p3InterestPointsRef.current.length); } while (nextTargetIndex === p3CurrentTargetIndexRef.current);
            } else { nextTargetIndex = 0; } 
            p3CurrentTargetIndexRef.current = nextTargetIndex;
            const targetPoint = p3InterestPointsRef.current[nextTargetIndex];
            p3MovementStateRef.current = { startTime: Date.now(), startX: currentX, startY: currentY, targetX: targetPoint.x, targetY: targetPoint.y };
        }

        if (p3MovementStateRef.current) {
            const { startTime, startX, startY, targetX, targetY } = p3MovementStateRef.current;
            const elapsedTime = Date.now() - startTime;
            const progress = Math.min(elapsedTime / P3_MOVEMENT_DURATION, 1);
            const easeProgress = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            p3Tile.x = startX + (targetX - startX) * easeProgress;
            p3Tile.y = startY + (targetY - startY) * easeProgress;
        }
        
        if (currentAssets.tileImage?.complete) {
            ctx.drawImage(currentAssets.tileImage, p3Tile.x, p3Tile.y, p3Tile.width, p3Tile.height);
        } else {
            ctx.fillStyle = p3Tile.color;
            ctx.fillRect(p3Tile.x, p3Tile.y, p3Tile.width, p3Tile.height);
        }
    }

    // Update other moving platforms (P1, P2)
    if (currentLevel && currentLevel.tiles && canvasRef.current) {
        const currentCanvas = canvasRef.current;
        currentLevel.tiles.forEach(tile => {
            if (tile.id !== 'p3' && tile.vx && typeof tile.direction === 'number') { 
                let newX = tile.x + (tile.vx * tile.direction * deltaTimeFactor);

                if (newX + tile.width > currentCanvas.width) {
                    newX = currentCanvas.width - tile.width;
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
        
        player.isOnGround = false; 
        let activePlatformThisFrame: ProcessedTile | null = null;

        currentLevel.tiles.forEach(tile => {
            if (tile.type !== 1) return; 

            const tileRect: Rect = { x: tile.x, y: tile.y, width: tile.width, height: tile.height };
            let hadHorizontalCollisionWithThisTile = false;

            const playerHorizontalRect: Rect = { x: nextPlayerX, y: player.y, width: player.width, height: player.height };
            if (checkCollision(playerHorizontalRect, tileRect)) {
                const playerCenter_X = nextPlayerX + player.width / 2;
                const tileCenter_X = tile.x + tile.width / 2;
                if (playerCenter_X < tileCenter_X) {
                    nextPlayerX = tile.x - player.width;
                } else {
                    nextPlayerX = tile.x + tile.width;
                }
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
                        player.isOnGround = true;
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
        
        if (player.isOnGround && activePlatformThisFrame) {
            player.activePlatformId = activePlatformThisFrame.id;
            const currentPlatform = activePlatformThisFrame;
            
            if (currentPlatform.id === 'p3' && p3Tile && p3MovementStateRef?.current) { 
                 const { startX: p3_start_x, startY: p3_start_y, targetX: p3_target_x, targetY: p3_target_y, startTime: p3_start_time } = p3MovementStateRef.current;
                 
                 const prevElapsedTime = Math.max(0, (Date.now() - deltaTime) - p3_start_time);
                 const calcPos = (elapsed: number) => {
                     const progress = Math.min(elapsed / P3_MOVEMENT_DURATION, 1);
                     const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                     return { x: p3_start_x + (p3_target_x - p3_start_x) * ease, y: p3_start_y + (p3_target_y - p3_start_y) * ease };
                 };
                 const prevP3Pos = calcPos(prevElapsedTime);
                 const currentP3Pos = calcPos(Date.now() - p3_start_time);

                 const p3_frame_delta_x = currentP3Pos.x - prevP3Pos.x;
                 const p3_frame_delta_y = currentP3Pos.y - prevP3Pos.y;

                 player.x += p3_frame_delta_x;
                 player.y += p3_frame_delta_y;

            } else if (currentPlatform.vx && typeof currentPlatform.direction === 'number') { 
              const platformInducedMoveX = (currentPlatform.vx * currentPlatform.direction * deltaTimeFactor);
              player.x += platformInducedMoveX;
            }
        } else {
            player.activePlatformId = null;
        }
        
        // Boundary checks for player
        if (player.x < 0) player.x = 0;
        else if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
        
        const p_ground_tile = currentLevel.tiles.find(t => t.id === 'p_ground');
        if (p_ground_tile && player.y + player.height > p_ground_tile.y && player.y < p_ground_tile.y + p_ground_tile.height ) { 
            if (player.y + player.height > p_ground_tile.y + (p_ground_tile.height / 4) ) { 
                player.y = p_ground_tile.y - player.height;
                player.isOnGround = true; 
                player.vy = 0;
                if(!activePlatformThisFrame) player.activePlatformId = p_ground_tile.id;
            }
        }
        
        const p_top_boundary = currentLevel.tiles.find(t => t.id === 'p_top_boundary');
        if (p_top_boundary && player.y < p_top_boundary.y + p_top_boundary.height) { 
            player.y = p_top_boundary.y + p_top_boundary.height;
            player.vy = 0;
        }
        renderPlayer(ctx, player, currentAssets.playerImage);
    }

    // Coin Update Logic
    const currentActiveCoins = activeCoinsRef.current;
    const updatedCoins = currentActiveCoins.map(coin => {
        let newParticles = [...coin.particles];
        let newIsVisuallyPresent = coin.isVisuallyPresent;
        let newOpacity = coin.currentOpacity;
        let newIsCollected = coin.isCollected;
        let newCollectionTime = coin.collectionTime;

        if (Date.now() >= coin.targetSpawnTime && !coin.isCollected && coin.currentOpacity < 1) {
             newOpacity = Math.min(1, coin.currentOpacity + deltaTime / COIN_FADE_IN_DURATION);
        }

        if (player && !coin.isCollected && newOpacity > 0.5 && coin.isVisuallyPresent) {
            const coinRect: Rect = { x: coin.x, y: coin.y, width: coin.width, height: coin.height };
            const playerRect: Rect = { x: player.x, y: player.y, width: player.width, height: player.height };
            if (checkCollision(playerRect, coinRect)) {
                newIsCollected = true;
                newCollectionTime = Date.now();
                // Do not increment totalCoinsSpawnedThisLevel here directly.
                // This will be handled by Effect 8 when the coin is fully processed.
            }
        }
        
        if (newIsCollected && !coin.collectionTime && coin.isVisuallyPresent) { 
            newCollectionTime = newCollectionTime || Date.now();
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
            newOpacity = 0; 
        }

        newParticles = newParticles.map(p => ({
            ...p,
            x: p.x + p.vx * deltaTimeFactor,
            y: p.y + p.vy * deltaTimeFactor + (GRAVITY * COIN_PARTICLE_GRAVITY_FACTOR * deltaTimeFactor),
            life: p.life - deltaTime,
            opacity: Math.max(0, p.life / COIN_PARTICLE_LIFESPAN),
        })).filter(p => p.life > 0);
        
        if (newIsCollected && newParticles.length === 0 && coin.collectionTime) { 
            newIsVisuallyPresent = false;
        }

        return { 
            ...coin, 
            isCollected: newIsCollected,
            collectionTime: newCollectionTime,
            currentOpacity: newOpacity, 
            particles: newParticles, 
            isVisuallyPresent: newIsVisuallyPresent, 
            rotationAngle: (coin.rotationAngle + coin.rotationSpeed * deltaTimeFactor) % (Math.PI * 2) 
        };
    });
    
    if(JSON.stringify(currentActiveCoins) !== JSON.stringify(updatedCoins)) {
      setActiveCoins(updatedCoins);
    }
    if(activeCoinsRef.current.length > 0) { 
        renderCoins(ctx, activeCoinsRef.current, currentAssets.coinImage); 
    }
    

    // Enemy Update Logic
    const currentActiveEnemies = activeEnemiesRef.current;
    if (currentActiveEnemies.length > 0 && player && canvas) { 
        const updatedEnemies = currentActiveEnemies.map(enemy => {
            let newEnemyX = enemy.x + (enemy.vx * enemy.direction * deltaTimeFactor);
            if (newEnemyX + enemy.width > canvas.width) {
                newEnemyX = canvas.width - enemy.width;
                enemy.direction *= -1;
            } else if (newEnemyX < 0) {
                newEnemyX = 0;
                enemy.direction *= -1;
            }

            const enemyRect: Rect = { x: newEnemyX, y: enemy.y, width: enemy.width, height: enemy.height };
            const playerRect: Rect = { x: player.x, y: player.y, width: player.width, height: player.height };

            if (checkCollision(playerRect, enemyRect)) {
                const p_ground = currentLevel.tiles.find(t => t.id === 'p_ground');
                if (p_ground) {
                    player.x = canvas.width / 2 - player.width / 2;
                    player.y = p_ground.y - player.height;
                    player.vx = 0;
                    player.vy = 0;
                    player.isOnGround = true;
                    player.activePlatformId = p_ground.id;
                } else { 
                    player.x = canvas.width / 2 - player.width / 2;
                    player.y = canvas.height - player.height;
                    player.vx = 0;
                    player.vy = 0;
                    player.isOnGround = true;
                }
            }
            return { ...enemy, x: newEnemyX };
        });
        if(JSON.stringify(currentActiveEnemies) !== JSON.stringify(updatedEnemies)) {
          setActiveEnemies(updatedEnemies);
        }
    }
    if (activeEnemiesRef.current.length > 0) {
        renderEnemies(ctx, activeEnemiesRef.current);
    }

    // Render foreground tiles
    currentLevel.tiles.forEach(tile => {
      if (tile.layer === 'foreground') {
        if ((tile.id.startsWith("bush_") && (tile.id.endsWith("_1") || tile.id.endsWith("_left_1") || tile.id.endsWith("_right_1"))) && currentAssets.smallBushImage?.complete) { 
            ctx.drawImage(currentAssets.smallBushImage, tile.x, tile.y, tile.width, tile.height);
        } else if ((tile.id.startsWith("bush_") && (tile.id.endsWith("_2") || tile.id.endsWith("_left_2") || tile.id.endsWith("_right_2"))) && currentAssets.largeBushImage?.complete) { 
            ctx.drawImage(currentAssets.largeBushImage, tile.x, tile.y, tile.width, tile.height);
        }
        else { 
            ctx.fillStyle = tile.color;
            ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
        }
      }
    });
        
    if (onGameStatsUpdate) {
      onGameStatsUpdate({ 
        collectedCoins: totalCoinsSpawnedThisLevelRef.current, // This should reflect collected and processed coins
        totalCoinsOnLevel: TOTAL_COINS_ON_LEVEL 
      });
    }
    
    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, [ 
    isClient, assets, resetExecuteAction, onGameStatsUpdate, 
    // Config constants
    GRAVITY, JUMP_STRENGTH, PLAYER_SPEED, PLAYER_HEIGHT, PLAYER_WIDTH,
    COIN_FADE_IN_DURATION, COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX,
    PLATFORM_SPEED, ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, P3_MOVEMENT_DURATION, TOTAL_COINS_ON_LEVEL,
    // Stable setters and refs
    setActiveCoins, setActiveEnemies, setTotalCoinsSpawnedThisLevel, 
    p3BasePositionRef, p3InterestPointsRef, p3CurrentTargetIndexRef, p3MovementStateRef,
    // Callbacks (should be memoized if they come from props/context, or be stable)
    checkCollision, renderPlayer, renderCoins, renderEnemies,
    // Props that might influence game behavior
    parentPlayerRef, levelPath, 
    processRawLevelData, spawnSingleCoin, spawnSingleEnemy, 
  ]);

  // Effect 9: Start/Stop Game Loop
  useEffect(() => {
    // console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize: W${canvasSize.width}H${canvasSize.height}, processedLevel: ${!!processedLevelRef.current}`);
    const conditionsMet = isClient && !isLoading && canvasRef.current && ctxRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevelRef.current ;
    
    if (conditionsMet) {
    //   console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); 
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    } else {
    //   console.log("[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start. isLoading:", isLoading, "processedLevel:", !!processedLevelRef.current);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    }
    return () => {
    //   console.log("[GameCanvas Effect 9] Cleanup: Cancelling animation frame.");
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [isClient, isLoading, canvasSize, processedLevel, gameLoop]); // processedLevel (state) triggers this effect

  if (!isClient) {
    // console.log("[GameCanvas] Rendering null because not client-side yet (isClient is false).");
    return null; 
  }
  
//   console.log(`[GameCanvas] Rendering. isClient: ${isClient}, isLoading: ${isLoading}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);
  
  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full" 
      aria-label="Game Canvas"
      tabIndex={0} 
    />
  );
}


