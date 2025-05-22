
"use client";

import type { DependencyList } from 'react';
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
import {
  GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
  COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
  COIN_FADE_IN_DURATION, COIN_SPAWN_STAGGER_DELAY, NUMBER_OF_COIN_PAIRS,
  COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE,
  ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, PLATFORM_SPEED,
  COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR,
  P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION,
} from '@/config/gameConfig';
// import { useToast } from "@/hooks/use-toast";
import { checkCollision } from '@/game/utils/collision';
import { renderPlayer } from '@/game/entities/playerRenderer';
import { renderCoins } from '@/game/entities/coinRenderer';
// import { renderEnemies } from '@/game/entities/enemyRenderer';
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
  onGameStatsUpdate?: (stats: { uncollectedInPair: number; currentPairNum: number; totalPairsNum: number }) => void;
}

const parseDimension = (value: string | number, totalSize: number): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value.endsWith('%')) return (parseFloat(value) / 100) * totalSize;
    if (value.endsWith('px')) return parseFloat(value);
    return parseFloat(value);
  }
  return 0;
};

export default function GameCanvas({
  levelPath,
  playerRef: parentPlayerRef,
  executeAction,
  resetExecuteAction,
  onGameStatsUpdate,
}: GameCanvasProps) {
  // console.log(`[GameCanvas] Component body. levelPath: ${levelPath}, isClient: ${isClient}, canvasSize: W${canvasSize.width}H${canvasSize.height}`);
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
  
  const [currentPairIndex, setCurrentPairIndex] = useState(0);
  const currentPairIndexRef = useRef<number>(currentPairIndex);
  
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

  const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const p3CurrentTargetIndexRef = useRef<number>(0);
  const p3MovementStateRef = useRef<{ startTime: number; startX: number; startY: number; targetX: number; targetY: number } | null>(null);
  
  const lastFrameTime = useRef<number>(Date.now());
  const animationFrameIdRef = useRef<number | null>(null);
  const executeActionRef = useRef<GameAction | null>(executeAction);

  // Effect to update executeActionRef when executeAction prop changes
  useEffect(() => {
    executeActionRef.current = executeAction;
  }, [executeAction]);

  const processRawLevelData = useCallback((
    currentRawLevelData: RawLevelData,
    currentCanvasWidth: number,
    currentCanvasHeight: number
  ): ProcessedLevelData | null => {
    // console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
    if (!currentRawLevelData || currentCanvasWidth === 0 || currentCanvasHeight === 0) {
      // console.warn("[GameCanvas processRawLevelData] Aborting: No raw level data or zero canvas dimensions.");
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
    
    // Player Start Logic
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

    // Add P3 platform programmatically if it's level 2 (or specific levels)
    if (levelPath === '/levels/level2.json') {
      const p_ground_tile = processedTiles.find(t => t.id === 'p_ground');
      if (p_ground_tile) {
        const p_ground_top_y = p_ground_tile.y;
        const p3_center_y = p_ground_top_y - 300 + (P3_SIZE_H / 2);
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
        p3MovementStateRef.current = null; // Will be initialized in gameLoop

        const p3Tile: ProcessedTile = {
            id: 'p3',
            x: p3_x,
            y: p3_y,
            width: P3_SIZE_W,
            height: P3_SIZE_H,
            type: 1,
            color: 'hsl(var(--muted))', 
            vx: 0, // P3 movement is handled separately
            direction: 0,
        };
        processedTiles.push(p3Tile);
        // console.log(`[processRawLevelData] Level 2: Added p3Tile:`, p3Tile);
      } else {
        console.warn("[processRawLevelData] Level 2: p_ground not found for P3 positioning.");
      }
    }
    // console.log(`[processRawLevelData] Successfully processed. Player:`, newPlayer, `Number of tiles: ${processedTiles.length}`);
    return {
      playerStart: { xPx: playerStartX, yPx: playerStartY },
      tiles: processedTiles,
    };
  }, [levelPath, assets.playerImage, parentPlayerRef, P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE]);


  // Effect 1: Set isClient, Load Assets
  useEffect(() => {
    // console.log(`[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state: ${isClient}`);
    if (!isClient) setIsClient(true);

    const allAssetKeys: (keyof AssetContainer)[] = [
      'playerImage', 'tileImage', 'coinImage', 'stoneImage', 
      'tree1Image', 'tree2Image', 'flowersImage', 'smallBushImage', 
      'largeBushImage', 'houseImage'
    ];
    const assetPaths: Record<string, string> = {
      playerImage: '/assets/images/hero_jeans3.png',
      tileImage: '/assets/images/platform_grass.png',
      coinImage: '/assets/images/thankscoin.png',
      stoneImage: '/assets/images/stone1.jpg',
      tree1Image: '/assets/images/tree1.png',
      tree2Image: '/assets/images/tree2.png',
      flowersImage: '/assets/images/flowers.png',
      smallBushImage: '/assets/images/flowers.png', 
      largeBushImage: '/assets/images/bush1.png',
      houseImage: '/assets/images/house1.png',
    };
     const assetDataHints: Record<string, string> = {
        playerImage: 'character hero jeans',
        tileImage: 'grass platform surface',
        coinImage: 'collectible coin gold',
        stoneImage: 'stone rock texture',
        tree1Image: 'tree nature tall',
        tree2Image: 'tree nature smaller',
        flowersImage: 'flowers plant colorful',
        smallBushImage: 'bush flowers small', 
        largeBushImage: 'bush large green',
        houseImage: 'house building simple',
    };
    
    allAssetKeys.filter(key => key.endsWith('Image')).forEach(imageKey => {
        const loadedKey = `${imageKey}Loaded` as keyof AssetContainer;
        if (!assets[imageKey as keyof AssetContainer] && !(assets[loadedKey] as boolean)) {
            const img = new Image();
            img.src = assetPaths[imageKey];
            img.setAttribute('data-ai-hint', assetDataHints[imageKey] || 'game asset');
            img.onload = () => {
                // console.log(`[GameCanvas Effect 1] Asset ${imageKey} loaded successfully.`);
                setAssets(prev => ({ ...prev, [imageKey]: img, [loadedKey]: true }));
            };
            img.onerror = () => {
                console.error(`[GameCanvas Effect 1] Failed to load ${imageKey}.`);
                setAssets(prev => ({ ...prev, [loadedKey]: true })); 
            };
        }
    });
  }, [isClient, assets]); // assets is a dependency to re-check if an image path changes


  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    // console.log(`[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize: {width: ${canvasSize.width}, height: ${canvasSize.height}}`);
    if (canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      // console.log(`[GameCanvas Effect 2] Canvas attributes set to W:${canvasSize.width}, H:${canvasSize.height}`);
      if (!ctxRef.current) {
        ctxRef.current = canvasRef.current.getContext('2d');
        // console.log("[GameCanvas Effect 2] Canvas context obtained/confirmed.");
      }
    }
  }, [canvasSize]);

  // Effect 3: Observe parent element size and update canvasSize state
  useEffect(() => {
    // console.log(`[GameCanvas Effect 3] Running: Observe parent size. isClient: ${isClient}`);
    if (!isClient || !canvasRef.current?.parentElement) {
      // console.log(`[GameCanvas Effect 3] Not client or no parentElement. isClient: ${isClient}, parent: ${!!canvasRef.current?.parentElement}`);
      return;
    }
    const parentElement = canvasRef.current.parentElement;
    // console.log("[GameCanvas Effect 3] Parent element found:", parentElement);

    const updateCanvasSizeState = () => {
      const newWidth = parentElement.clientWidth;
      const newHeight = parentElement.clientHeight;
      // console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Parent dims: W:${newWidth}, H:${newHeight}`);
      
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
    // console.log("[GameCanvas Effect 3] ResizeObserver observing parent.");
    
    const initialSizer = () => {
        if (canvasRef.current?.parentElement) {
            updateCanvasSizeState();
        }
    };
    window.addEventListener('resize', initialSizer);

    return () => {
      // console.log("[GameCanvas Effect 3] Cleanup: Disconnecting ResizeObserver and removing window resize listener.");
      resizeObserver.disconnect();
      window.removeEventListener('resize', initialSizer);
    };
  }, [isClient]);

  // Effect 4: Load raw level data
  useEffect(() => {
    // console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      // console.log("[GameCanvas Effect 4] Not client or no levelPath, returning.");
      return;
    }
    if (!isLoading) setIsLoading(true); // Set loading to true when levelPath changes
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
          // console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
          setRawLevelData(data);
        } else {
          console.error(`[GameCanvas Effect 4] Failed to load rawLevelData for ${levelPath}, data is null.`);
          setRawLevelData(null); 
          setIsLoading(false); 
        }
      })
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
        setIsLoading(false);
      });
  }, [levelPath, isClient, setIsLoading, setRawLevelData, setProcessedLevel, setActiveCoins, setActiveEnemies, setCurrentPairIndex]);

  const allAssetsLoaded = assets.playerImageLoaded && assets.tileImageLoaded && assets.coinImageLoaded && assets.stoneImageLoaded && assets.tree1ImageLoaded && assets.tree2ImageLoaded && assets.flowersImageLoaded && assets.smallBushImageLoaded && assets.largeBushImageLoaded && assets.houseImageLoaded;

  // Effect 5: Process raw level data when available and canvas is sized
  useEffect(() => {
    // console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${allAssetsLoaded}`);

    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded) {
      if (processedLevel !== null) { 
        setProcessedLevel(null); // Clear processed level if conditions are no longer met
        processedLevelRef.current = null;
        playerInstanceRef.current = null;
      }
      // console.log(`[GameCanvas Effect 5] Conditions not met. isClient:${isClient}, rawLevelData:${!!rawLevelData}, canvasW:${canvasSize.width}, allAssetsLoaded:${allAssetsLoaded}`);
      return;
    }
    
    // console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
    const newProcessedLevelData = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);

    if (newProcessedLevelData) {
      // console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel.");
      setProcessedLevel(newProcessedLevelData);
      // playerInstanceRef and parentPlayerRef are set inside processRawLevelData
    } else {
      console.warn("[GameCanvas Effect 5] processRawLevelData returned null. Clearing processedLevel.");
      setProcessedLevel(null);
      playerInstanceRef.current = null;
    }
  }, [isClient, rawLevelData, canvasSize, allAssetsLoaded, processRawLevelData, setProcessedLevel]); // assets removed as allAssetsLoaded covers it

  // Effect 6: Update refs when their corresponding state changes (moved after state declarations)
  useEffect(() => {
    processedLevelRef.current = processedLevel;
  }, [processedLevel]);
  useEffect(() => {
    activeCoinsRef.current = activeCoins;
  }, [activeCoins]);
  useEffect(() => {
    currentPairIndexRef.current = currentPairIndex;
  }, [currentPairIndex]);
   useEffect(() => {
    activeEnemiesRef.current = activeEnemies;
  }, [activeEnemies]);

  const spawnNewCoinPair = useCallback(
    (currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number, currentCanvasHeight: number): CoinState[] => {
        // console.log(`[spawnNewCoinPair] Called. Canvas W:${currentCanvasWidth}, H:${currentCanvasHeight}. ProcessedLevel exists: ${!!currentProcessedLevel}`);
        if (!currentProcessedLevel || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
            // console.warn("[spawnNewCoinPair] Aborting: No processed level or zero canvas dimensions.");
            return [];
        }

        const p_ground = currentProcessedLevel.tiles.find(tile => tile.id === 'p_ground');
        if (!p_ground) {
            console.warn("[spawnNewCoinPair] 'p_ground' tile not found. Cannot determine spawn zone. No coins spawned.");
            return [];
        }
        const p_groundTopY = p_ground.y;

        const gamePlatforms = currentProcessedLevel.tiles.filter(tile => tile.type === 1 && tile.id !== 'p_ground' && tile.id !== 'p_top_boundary');
        
        let actualHighestPlatformTopY = p_groundTopY; 
        if (gamePlatforms.length > 0) {
            actualHighestPlatformTopY = Math.min(...gamePlatforms.map(p => p.y));
        }
        // console.log(`[spawnNewCoinPair] p_groundTopY: ${p_groundTopY}, actualHighestPlatformTopY: ${actualHighestPlatformTopY}`);

        const ySpawnZoneBottomCoinTopEdge = p_groundTopY - COIN_VERTICAL_SPAWN_BOTTOM_OFFSET - COIN_SIZE;
        let ySpawnZoneTopCoinTopEdge = actualHighestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;
        
        if (ySpawnZoneTopCoinTopEdge < COIN_SPAWN_TOP_MARGIN) { // Ensure coins don't spawn too high if no platforms
            ySpawnZoneTopCoinTopEdge = COIN_SPAWN_TOP_MARGIN;
        }
        if (ySpawnZoneTopCoinTopEdge >= ySpawnZoneBottomCoinTopEdge) {
            console.warn(`[spawnNewCoinPair] Invalid spawn zone: Top (${ySpawnZoneTopCoinTopEdge}) is below or at Bottom (${ySpawnZoneBottomCoinTopEdge}). No coins spawned.`);
            return [];
        }
        // console.log(`[spawnNewCoinPair] ySpawnZoneBottomCoinTopEdge: ${ySpawnZoneBottomCoinTopEdge}, ySpawnZoneTopCoinTopEdge: ${ySpawnZoneTopCoinTopEdge}`);

        const newCoins: CoinState[] = [];
        const numberOfCoinsToSpawn = 2; // Always spawn a pair

        for (let i = 0; i < numberOfCoinsToSpawn; i++) {
            const coinX = (i % 2 === 0) 
                ? Math.random() * (currentCanvasWidth / 2 - COIN_SIZE) // Left half
                : currentCanvasWidth / 2 + Math.random() * (currentCanvasWidth / 2 - COIN_SIZE); // Right half
            
            const coinY = ySpawnZoneTopCoinTopEdge + Math.random() * (ySpawnZoneBottomCoinTopEdge - ySpawnZoneTopCoinTopEdge);

            const rotationSpeed = COIN_ROTATION_SPEED_MIN + Math.random() * (COIN_ROTATION_SPEED_MAX - COIN_ROTATION_SPEED_MIN);

            newCoins.push({
                id: `coin-${Date.now()}-${currentPairIndexRef.current}-${i}`,
                x: coinX,
                y: coinY,
                width: COIN_SIZE,
                height: COIN_SIZE,
                isCollected: false,
                targetSpawnTime: Date.now() + (i * COIN_SPAWN_STAGGER_DELAY), 
                currentOpacity: 0,
                isVisuallyPresent: true,
                particles: [],
                rotationAngle: Math.random() * Math.PI * 2,
                rotationSpeed: rotationSpeed,
            });
        }
        // console.log(`[spawnNewCoinPair] Created ${newCoins.length} coins. Coins:`, JSON.parse(JSON.stringify(newCoins)));
        return newCoins;
    },
    [COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT, COIN_SPAWN_STAGGER_DELAY, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX]
  );

  const spawnSingleEnemy = useCallback(
    (currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number): EnemyState | null => {
        // console.log(`[spawnSingleEnemy] Called. Canvas W:${currentCanvasWidth}. ProcessedLevel exists: ${!!currentProcessedLevel}`);
        if (!currentProcessedLevel || currentCanvasWidth <= 0) {
            // console.warn("[spawnSingleEnemy] Aborting: No processed level or zero canvas width.");
            return null;
        }

        const p1 = currentProcessedLevel.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
        const p2 = currentProcessedLevel.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');

        if (!p1 || !p2) {
            // console.warn("[spawnSingleEnemy] Platforms P1 or P2 not found. Cannot spawn enemy.");
            return null;
        }

        const p1CenterY = p1.y + p1.height / 2;
        const p2CenterY = p2.y + p2.height / 2;
        const enemyY = (p1CenterY + p2CenterY) / 2 - ENEMY_RADIUS; // Center of enemy at midpoint

        const newEnemy: EnemyState = {
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
        // console.log("[spawnSingleEnemy] Created new enemy:", newEnemy);
        return newEnemy;
    },
    [PLATFORM_SPEED, ENEMY_SPEED_FACTOR, ENEMY_RADIUS, ENEMY_COLOR]
  );

  // Effect 7: Spawn entities and finish loading
  useEffect(() => {
    // console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevel}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoins.length}`);
    
    if (!isClient || !processedLevel || canvasSize.width === 0 || canvasSize.height === 0) {
        // console.log(`[GameCanvas Effect 7] Pre-conditions (isClient, processedLevel, canvasSize) not met for entity spawn, returning.`);
        return;
    }
    
    if (!isLoading) {
        // console.log(`[GameCanvas Effect 7] isLoading is false, skipping spawn logic (already loaded or loading finished).`);
        return;
    }
    
    let coinsAttempted = activeCoins.length > 0;
    if (!coinsAttempted && processedLevel.tiles.length > 0 && currentPairIndexRef.current === 0) {
        // console.log(`[GameCanvas Effect 7] Spawning initial coin pair for level ${levelPath}`);
        const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
        setActiveCoins(newCoins);
        // console.log(`[GameCanvas Effect 7] spawnNewCoinPair returned ${newCoins.length} coins. Setting activeCoins.`);
        coinsAttempted = true;
    } else if (processedLevel.tiles.length === 0) {
         coinsAttempted = true; // No coins needed if no tiles
    }


    let enemiesAttempted = activeEnemies.length > 0;
    if (levelPath !== '/levels/level2.json' && levelPath !== '/levels/level1.json') {
      if (!enemiesAttempted && processedLevel.tiles.length > 0) {
        // console.log(`[GameCanvas Effect 7] Spawning enemy for level ${levelPath}`);
        const newEnemy = spawnSingleEnemy(processedLevel, canvasSize.width);
        if (newEnemy) setActiveEnemies([newEnemy]);
        enemiesAttempted = true;
      } else if (processedLevel.tiles.length === 0){
         enemiesAttempted = true; // No enemies needed if no tiles
      }
    } else {
      // console.log(`[GameCanvas Effect 7] Enemies not spawned for level: ${levelPath}`);
      enemiesAttempted = true; 
    }

    if (coinsAttempted && enemiesAttempted) {
        // console.log("[GameCanvas Effect 7] All entities attempted or not needed, setting isLoading to false.");
        setIsLoading(false);
    }
  }, [
    isClient, isLoading, processedLevel, canvasSize, levelPath, 
    activeCoins.length, activeEnemies.length, // Keep these for initial spawn check
    spawnNewCoinPair, spawnSingleEnemy, 
    setActiveCoins, setActiveEnemies, setIsLoading
  ]);
  
  // Effect 8: Check coin respawn logic (for multiple pairs)
  useEffect(() => {
    // console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, processedLevel: ${!!processedLevelRef.current}, activeCoins.length: ${activeCoinsRef.current.length}, currentPairIndex: ${currentPairIndexRef.current}`);
    if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) return;

    const allCollectedAndParticlesGone = activeCoinsRef.current.length > 0 && activeCoinsRef.current.every(
        c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent
    );

    if (allCollectedAndParticlesGone) {
        // console.log(`[GameCanvas Effect 8] All coins in pair ${currentPairIndexRef.current} collected and particles gone.`);
        const nextPairIdx = currentPairIndexRef.current + 1;
        if (nextPairIdx < NUMBER_OF_COIN_PAIRS) {
            // console.log(`[GameCanvas Effect 8] Incrementing to pair ${nextPairIdx}. Clearing active coins.`);
            setActiveCoins([]); // Clear old coins before spawning new ones
            setCurrentPairIndex(nextPairIdx);
        } else {
            // console.log(`[GameCanvas Effect 8] All ${NUMBER_OF_COIN_PAIRS} coin pairs collected. No more coins.`);
            setActiveCoins([]); // Clear the last collected pair
        }
    }
  }, [
    activeCoins, // Depends on activeCoins state directly to re-evaluate
    isClient, isLoading, canvasSize, // General conditions
    processedLevelRef, // To access level data if needed by spawn
    currentPairIndexRef, NUMBER_OF_COIN_PAIRS, // For pair logic
    setActiveCoins, setCurrentPairIndex // State setters
    // spawnNewCoinPair is called by Effect 8.5
  ]);

   // Effect 8.5: Spawn coin pair when currentPairIndex changes
   useEffect(() => {
    // console.log(`[GameCanvas Effect 8.5] Running: Spawn on pair index change. currentPairIndex: ${currentPairIndex}, activeCoins.length: ${activeCoins.length}, isLoading: ${isLoading}`);
     if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
        // console.log("[GameCanvas Effect 8.5] Pre-conditions not met for spawning new pair, returning.");
        return;
     }
     if (currentPairIndex < NUMBER_OF_COIN_PAIRS && activeCoins.length === 0) { // Only spawn if no coins are active
        // console.log(`[GameCanvas Effect 8.5] Spawning new coin pair for index ${currentPairIndex}.`);
        const newPair = spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height);
        if (newPair.length > 0) {
            setActiveCoins(newPair);
        }
     }
   }, [
       currentPairIndex, // Primary trigger
       isLoading, isClient, processedLevelRef, canvasSize, // Guards
       activeCoins.length, // Guard to prevent re-spawning over existing coins
       spawnNewCoinPair, setActiveCoins, NUMBER_OF_COIN_PAIRS
   ]);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const currentLevel = processedLevelRef.current; // Use ref for current level data
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
        if (tile.type === 1) { // Platforms
            if (tile.id.startsWith('stone_') && currentAssets.stoneImage?.complete) {
                ctx.drawImage(currentAssets.stoneImage, tile.x, tile.y, tile.width, tile.height);
            } else if (currentAssets.tileImage?.complete) {
                ctx.drawImage(currentAssets.tileImage, tile.x, tile.y, tile.width, tile.height);
            } else {
                ctx.fillStyle = tile.color;
                ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
            }
        } else { // Decorative background elements
            if (tile.id === 'tree1' && currentAssets.tree1Image?.complete) ctx.drawImage(currentAssets.tree1Image, tile.x, tile.y, tile.width, tile.height);
            else if (tile.id === 'tree2' && currentAssets.tree2Image?.complete) ctx.drawImage(currentAssets.tree2Image, tile.x, tile.y, tile.width, tile.height);
            else if (tile.id === 'house1' && currentAssets.houseImage?.complete) ctx.drawImage(currentAssets.houseImage, tile.x, tile.y, tile.width, tile.height);
            else if (tile.id.startsWith('bush_') && currentAssets.largeBushImage?.complete && tile.id.includes('_2')) ctx.drawImage(currentAssets.largeBushImage, tile.x, tile.y, tile.width, tile.height); // Large bush
            else if (tile.id.startsWith('bush_') && currentAssets.smallBushImage?.complete && tile.id.includes('_1')) ctx.drawImage(currentAssets.smallBushImage, tile.x, tile.y, tile.width, tile.height); // Small bush (flowers)
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
            // Ensure it picks a *different* target than the current one if possible
            if (p3InterestPointsRef.current.length > 1) {
                do {
                    nextTargetIndex = Math.floor(Math.random() * p3InterestPointsRef.current.length);
                } while (nextTargetIndex === p3CurrentTargetIndexRef.current);
            } else {
                nextTargetIndex = 0; // Only one point, so always target it
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
            // Ensure P3 is not handled here again if its movement logic is separate
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
          resetExecuteAction(); // Call the prop function
          executeActionRef.current = null; // Reset the ref
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
        let platformInducedMoveY = 0;


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
                // For P3, calculate delta based on its new and previous position if needed, or use its current movement
                // This part requires careful handling of p3's own stateful movement
                 const p3CurrentX = activePlatformThisFrame.x;
                 const p3CurrentY = activePlatformThisFrame.y;
                 // This is a simplification; ideally, you'd store P3's previous position
                 // For now, let's assume P3's movement is slow enough that this is okay.
                 // We need to calculate how much P3 moved this frame.
                 // This part is tricky as p3Tile is updated directly.
                 // We'll assume P3's movement is already factored into its .x and .y for this frame.
                 // The collision resolution happens *after* P3 has moved.
                 // So, if player lands on P3, their next position will be relative to P3's new position.
            } else if (activePlatformThisFrame.vx && activePlatformThisFrame.direction) { // For P1, P2
              platformInducedMoveX = (activePlatformThisFrame.vx * activePlatformThisFrame.direction * deltaTimeFactor);
              player.x += platformInducedMoveX;
            }
        } else if (!player.isOnGround) {
            player.activePlatformId = null;
        }
        
        // Boundary checks for player (after platform induced movement)
        if (player.x < 0) {
          player.x = 0;
        } else if (player.x + player.width > canvas.width) {
          player.x = canvas.width - player.width;
        }
        if (player.y + player.height > canvas.height) { // Fall off screen bottom
            player.y = canvas.height - player.height;
            player.isOnGround = true; 
            player.vy = 0;
            player.activePlatformId = currentLevel.tiles.find(t => t.id === 'p_ground')?.id || null;
        }
        if (player.y < 0 && currentLevel.tiles.find(t => t.id === 'p_top_boundary')) { // Hit top boundary
            const topBoundary = currentLevel.tiles.find(t => t.id === 'p_top_boundary');
            if (topBoundary) {
                player.y = topBoundary.y + topBoundary.height;
                player.vy = 0;
            }
        }
        renderPlayer(ctx, player, currentAssets.playerImage);
    }

    // Update and Render Coins (using activeCoinsRef)
    if (activeCoinsRef.current.length > 0) {
        const updatedCoins = activeCoinsRef.current.map(coin => {
            let newParticles = [...coin.particles];
            if (coin.isCollected && coin.collectionTime) {
                // Particle generation and update logic
                if (coin.particles.length === 0 && coin.isVisuallyPresent) { // Generate particles once
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
                // Update existing particles
                newParticles = newParticles.map(p => ({
                    ...p,
                    x: p.x + p.vx * deltaTimeFactor,
                    y: p.y + p.vy * deltaTimeFactor + (GRAVITY * COIN_PARTICLE_GRAVITY_FACTOR * deltaTimeFactor),
                    life: p.life - deltaTime,
                    opacity: Math.max(0, p.life / COIN_PARTICLE_LIFESPAN),
                })).filter(p => p.life > 0);
            }

            return {
                ...coin,
                currentOpacity: !coin.isCollected && Date.now() >= coin.targetSpawnTime
                    ? Math.min(1, coin.currentOpacity + deltaTime / COIN_FADE_IN_DURATION)
                    : (coin.isCollected ? 0 : coin.currentOpacity), // Hide collected coin immediately for particles
                isVisuallyPresent: coin.isCollected ? (newParticles.length > 0) : coin.isVisuallyPresent,
                particles: newParticles,
                rotationAngle: (coin.rotationAngle + coin.rotationSpeed * deltaTimeFactor) % (Math.PI * 2),
            };
        });
        setActiveCoins(updatedCoins); // This will trigger ref update
    }
    if (onGameStatsUpdate) {
      onGameStatsUpdate({ 
        uncollectedInPair: activeCoinsRef.current.filter(c => !c.isCollected).length, 
        currentPairNum: currentPairIndexRef.current, 
        totalPairsNum: NUMBER_OF_COIN_PAIRS 
      });
    }
    renderCoins(ctx, activeCoinsRef.current, currentAssets.coinImage); // Pass ref to renderer

    // Render Foreground Decorative Tiles
    currentLevel.tiles.forEach(tile => {
      if (tile.layer === 'foreground') {
        if (tile.id.startsWith('bush_') && currentAssets.largeBushImage?.complete && tile.id.includes('_2')) ctx.drawImage(currentAssets.largeBushImage, tile.x, tile.y, tile.width, tile.height); // Large bush
        else if (tile.id.startsWith('bush_') && currentAssets.smallBushImage?.complete && tile.id.includes('_1')) ctx.drawImage(currentAssets.smallBushImage, tile.x, tile.y, tile.width, tile.height); // Small bush (flowers)
        else {
            ctx.fillStyle = tile.color;
            ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
        }
      }
    });
        
    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, [
    isClient, assets, resetExecuteAction, levelPath, // executeAction is handled by ref
    onGameStatsUpdate, 
    // Callbacks for state updates (stable if defined with useCallback outside or as direct setters)
    setActiveCoins, setActiveEnemies, 
    // Configs that don't change often
    GRAVITY, JUMP_STRENGTH, PLAYER_SPEED, PLAYER_HEIGHT, PLAYER_WIDTH,
    COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE, COIN_FADE_IN_DURATION,
    PLATFORM_SPEED, // For non-P3 platforms
    P3_MOVEMENT_DURATION, // For P3 movement
  ]);

  // Effect 9: Start/Stop Game Loop
  useEffect(() => {
    // console.log(`[GameCanvas Effect 9] Running. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, processedLevel: ${!!processedLevelRef.current}`);
    
    const conditionsMet = isClient && !isLoading && canvasRef.current && ctxRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevelRef.current ;
    // console.log(`[GameCanvas Effect 9] isClient=${isClient}, !isLoading=${!isLoading}, canvasRef=${!!canvasRef.current}, ctxRef=${!!ctxRef.current}, canvasW=${canvasSize.width}, canvasH=${canvasSize.height}, processedLevelExists=${!!processedLevelRef.current}. MET: ${conditionsMet}`);
    
    if (conditionsMet) {
      // console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); 
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    } else {
      // console.log(`[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start.`);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    }
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
        // console.log("[GameCanvas Effect 9] Cleanup: Game loop cancelled.");
      }
    };
  }, [isClient, isLoading, canvasSize, processedLevel, gameLoop]); // gameLoop and processedLevel (state) are dependencies

  if (!isClient) {
    // console.log("[GameCanvas] Rendering null because not client-side yet (isClient is false).");
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
