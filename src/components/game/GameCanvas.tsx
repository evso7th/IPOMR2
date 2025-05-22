
"use client";

import type { DependencyList } from 'react';
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
import {
  GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
  COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
  COIN_FADE_IN_DURATION, COIN_SPAWN_STAGGER_DELAY,
  COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE,
  ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, PLATFORM_SPEED,
  COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR,
  P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION, NUMBER_OF_COIN_PAIRS
} from '@/config/gameConfig';
// import { useToast } from "@/hooks/use-toast";
import { checkCollision } from '@/game/utils/collision';
import { renderPlayer } from '@/game/entities/playerRenderer';
import { renderCoins } from '@/game/entities/coinRenderer';
import { renderEnemies } from '@/game/entities/enemyRenderer';
import { loadLevel } from '@/lib/levelLoader';

interface AssetContainer {
  playerImage: HTMLImageElement | null;
  tileImage: HTMLImageElement | null;
  coinImage: HTMLImageElement | null;
  stoneImage: HTMLImageElement | null;
  tree1Image: HTMLImageElement | null;
  tree2Image: HTMLImageElement | null;
  flowersImage: HTMLImageElement | null; // For small bushes (bush_..._1)
  smallBushImage: HTMLImageElement | null; // Alias for flowersImage
  largeBushImage: HTMLImageElement | null; // For large bushes (bush_..._2)
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
  console.log(`[GameCanvas] Component body. levelPath: ${levelPath}`);
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
  const activeCoinsRef = useRef<CoinState[]>([]);
  const [currentPairIndex, setCurrentPairIndex] = useState(0);
  const currentPairIndexRef = useRef<number>(0);
  
  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);
  const activeEnemiesRef = useRef<EnemyState[]>([]);

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

  // Effect 1: Set isClient, Load Assets
  useEffect(() => {
    // console.log("[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state:", isClient);
    setIsClient(true);
    const assetConfigs = [
      { key: 'playerImage', path: '/assets/images/hero_jeans3.png', hint: 'character hero jeans' },
      { key: 'tileImage', path: '/assets/images/platform_grass.png', hint: 'grass platform surface' },
      { key: 'coinImage', path: '/assets/images/thankscoin.png', hint: 'collectible coin gold' },
      { key: 'stoneImage', path: '/assets/images/stone1.jpg', hint: 'stone rock texture' },
      { key: 'tree1Image', path: '/assets/images/tree1.png', hint: 'tree nature tall' }, // Used for tile id 'tree1'
      { key: 'tree2Image', path: '/assets/images/tree2.png', hint: 'tree nature smaller' }, // Used for tile id 'tree2'
      { key: 'flowersImage', path: '/assets/images/flowers.png', hint: 'flowers plant colorful' }, // Used for small bushes id 'bush_..._1'
      { key: 'largeBushImage', path: '/assets/images/bush1.png', hint: 'bush large green' }, // Used for large bushes id 'bush_..._2'
      { key: 'houseImage', path: '/assets/images/house1.png', hint: 'house building simple' }, // Used for tile id 'house1'
    ] as const;

    assetConfigs.forEach(config => {
      const imageKey = config.key as keyof Pick<AssetContainer, `${string}Image`>;
      const loadedKey = `${imageKey}Loaded` as keyof AssetContainer;
      
      // Use a temporary variable for state checking to avoid stale closures
      setAssets(currentAssets => {
        if (!currentAssets[imageKey] && !currentAssets[loadedKey]) {
          const img = new Image();
          img.src = config.path;
          img.setAttribute('data-ai-hint', config.hint);
          img.onload = () => setAssets(prev => ({ ...prev, [imageKey]: img, [loadedKey]: true as any }));
          img.onerror = () => {
            console.error(`Failed to load ${imageKey} from ${config.path}.`);
            setAssets(prev => ({ ...prev, [loadedKey]: true as any })); // Mark as loaded to not block loading
          };
          // Return current assets, the update will be scheduled
          return currentAssets; 
        }
        return currentAssets;
      });
    });
  }, []);

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
        // console.log("[GameCanvas Effect 3] Not client yet or no parentElement.");
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
        if (canvasRef.current?.parentElement) updateCanvasSizeState();
    };
    window.addEventListener('resize', initialSizer); // Fallback for browsers not supporting ResizeObserver or for initial sizing
    
    return () => {
      // console.log("[GameCanvas Effect 3] Cleanup: Disconnecting ResizeObserver.");
      resizeObserver.disconnect();
      window.removeEventListener('resize', initialSizer);
    };
  }, [isClient]);


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
      // console.warn("[GameCanvas processRawLevelData] Pre-conditions not met (no raw data or canvas zero size).");
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

    // P3 platform logic - specific to level2
    if (levelPath === '/levels/level2.json') {
      const p_ground_tile = processedTiles.find(t => t.id === 'p_ground');
      if (p_ground_tile) {
        const p_ground_top_y = p_ground_tile.y;
        const p3_x = (currentCanvasWidth / 2) - (P3_SIZE_W / 2); // Centered horizontally
        const p3_y = p_ground_top_y - 300; // 300px above p_ground's top surface

        p3BasePositionRef.current = { x: p3_x, y: p3_y };
        p3InterestPointsRef.current = [ // Define some points for P3 to drift between
            { x: p3_x - P3_DRIFT_RANGE, y: p3_y - P3_DRIFT_RANGE },
            { x: p3_x + P3_DRIFT_RANGE, y: p3_y - P3_DRIFT_RANGE },
            { x: p3_x + P3_DRIFT_RANGE, y: p3_y + P3_DRIFT_RANGE },
            { x: p3_x - P3_DRIFT_RANGE, y: p3_y + P3_DRIFT_RANGE },
        ];
        p3CurrentTargetIndexRef.current = 0; // Start by moving to the first interest point
        p3MovementStateRef.current = null; // No movement state initially

        const p3Tile: ProcessedTile = {
            id: 'p3',
            x: p3_x, // Initial position, will be updated by drift logic
            y: p3_y,
            width: P3_SIZE_W,
            height: P3_SIZE_H,
            type: 1, // Collidable platform
            color: 'hsl(var(--muted))', // Muted color for P3
            vx: 0, // P3's movement is handled by drift logic, not simple vx
            direction: 0,
        };
        processedTiles.push(p3Tile);
        // console.log(`[processRawLevelData] Level 2: Added p3Tile:`, p3Tile);
      } else {
        // console.warn("[processRawLevelData] Level 2: p_ground not found for P3 positioning.");
      }
    }
    // console.log(`[processRawLevelData] Successfully processed. Player:`, newPlayer, `Number of tiles: ${processedTiles.length}`);
    return {
      playerStart: { xPx: playerStartX, yPx: playerStartY },
      tiles: processedTiles,
    };
  }, [levelPath, assets.playerImage, parentPlayerRef, parseDimension, P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE]);

  const spawnNewCoinPair = useCallback(
    (currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number, currentCanvasHeight: number): CoinState[] => {
        console.log(`[spawnNewCoinPair] Called. Canvas W:${currentCanvasWidth}, H:${currentCanvasHeight}. ProcessedLevel exists: ${!!currentProcessedLevel}`);
        if (!currentProcessedLevel || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
            console.warn("[spawnNewCoinPair] Pre-conditions not met (no processed level or canvas zero size). No coins spawned.");
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
        // console.log(`[spawnNewCoinPair] p_groundTopY: ${p_groundTopY}, actualHighestPlatformTopY: ${actualHighestPlatformTopY}`);

        const ySpawnZoneBottomCoinTopEdge = p_groundTopY - COIN_VERTICAL_SPAWN_BOTTOM_OFFSET - COIN_SIZE;
        let ySpawnZoneTopCoinTopEdge = actualHighestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;
        
        if (ySpawnZoneTopCoinTopEdge < COIN_SPAWN_TOP_MARGIN) { 
            ySpawnZoneTopCoinTopEdge = COIN_SPAWN_TOP_MARGIN;
        }
        // console.log(`[spawnNewCoinPair] ySpawnZoneBottomCoinTopEdge: ${ySpawnZoneBottomCoinTopEdge}, ySpawnZoneTopCoinTopEdge: ${ySpawnZoneTopCoinTopEdge}`);
        
        if (ySpawnZoneTopCoinTopEdge >= ySpawnZoneBottomCoinTopEdge) {
            console.warn(`[spawnNewCoinPair] Invalid spawn zone: Top (${ySpawnZoneTopCoinTopEdge}) is at or below Bottom (${ySpawnZoneBottomCoinTopEdge}). No coins spawned.`);
            return [];
        }

        const newCoins: CoinState[] = [];
        const numberOfCoinsToSpawn = 10; 
        console.log(`[spawnNewCoinPair] Attempting to spawn ${numberOfCoinsToSpawn} coins.`);

        for (let i = 0; i < numberOfCoinsToSpawn; i++) {
            const coinX = Math.random() * (currentCanvasWidth - COIN_SIZE);
            const coinY = ySpawnZoneTopCoinTopEdge + Math.random() * (ySpawnZoneBottomCoinTopEdge - ySpawnZoneTopCoinTopEdge);
            const rotationSpeed = COIN_ROTATION_SPEED_MIN + Math.random() * (COIN_ROTATION_SPEED_MAX - COIN_ROTATION_SPEED_MIN);

            newCoins.push({
                id: `coin-${Date.now()}-pair${currentPairIndexRef.current}-${i}`,
                x: coinX,
                y: coinY,
                width: COIN_SIZE,
                height: COIN_SIZE,
                isCollected: false,
                targetSpawnTime: Date.now() + (i * 0), // All appear at once for this setup
                currentOpacity: 1, // Appear fully opaque
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

  const spawnSingleEnemy = useCallback((currentProcessedLevel: ProcessedLevelData, currentCanvasWidth: number): EnemyState | null => {
    // console.log("[GameCanvas spawnSingleEnemy] Called.");
    if (!currentProcessedLevel || !currentProcessedLevel.tiles) {
        // console.warn("[spawnSingleEnemy] No processed level or tiles. Cannot spawn enemy.");
        return null;
    }

    const p1 = currentProcessedLevel.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
    const p2 = currentProcessedLevel.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');

    if (!p1 || !p2) {
        // console.warn("[spawnSingleEnemy] Platforms P1 or P2 not found. Cannot determine enemy Y position.");
        return null;
    }

    const p1CenterY = p1.y + p1.height / 2;
    const p2CenterY = p2.y + p2.height / 2;
    const enemyY = (p1CenterY + p2CenterY) / 2 - ENEMY_RADIUS; // Center of enemy should be midway

    const enemy: EnemyState = {
      id: `enemy-${Date.now()}`,
      x: 50, // Start near the left edge
      y: enemyY,
      radius: ENEMY_RADIUS,
      width: ENEMY_RADIUS * 2,
      height: ENEMY_RADIUS * 2,
      vx: PLATFORM_SPEED * ENEMY_SPEED_FACTOR,
      direction: 1, // Start moving right
      color: ENEMY_COLOR,
    };
    // console.log("[spawnSingleEnemy] Created enemy:", enemy);
    return enemy;
  }, [ENEMY_RADIUS, ENEMY_COLOR, PLATFORM_SPEED, ENEMY_SPEED_FACTOR]);


  // Effect 4: Load raw level data
  useEffect(() => {
    // console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      // console.log("[GameCanvas Effect 4] Not client or no levelPath, returning.");
      return;
    }
    
    setIsLoading(true); 
    setRawLevelData(null);
    setProcessedLevel(null); 
    processedLevelRef.current = null;
    setActiveCoins([]); 
    // activeCoinsRef.current = []; // This will be updated by the effect below
    setCurrentPairIndex(0); 
    // currentPairIndexRef.current = 0; // This will be updated by the effect below
    setActiveEnemies([]); 
    // activeEnemiesRef.current = []; // This will be updated by the effect below
    
    loadLevel(levelPath)
      .then(data => {
        if (data) {
          // console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
          setRawLevelData(data);
        } else {
          // console.warn(`[GameCanvas Effect 4] loadLevel returned null for ${levelPath}.`);
          setRawLevelData(null); 
          setIsLoading(false); 
        }
      })
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
        setIsLoading(false);
      });
  }, [levelPath, isClient, setIsLoading, setRawLevelData, setProcessedLevel, setActiveCoins, setCurrentPairIndex, setActiveEnemies]); // Added setters to deps

  const allAssetsLoaded = assets.playerImageLoaded && assets.tileImageLoaded && assets.coinImageLoaded && assets.stoneImageLoaded && assets.tree1ImageLoaded && assets.tree2ImageLoaded && assets.flowersImageLoaded && assets.largeBushImageLoaded && assets.houseImageLoaded;

  // Effect 5: Process raw level data when available and canvas is sized
  useEffect(() => {
    // console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${allAssetsLoaded}`);
    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded) {
      if (processedLevel !== null) { 
        // console.log("[GameCanvas Effect 5] Conditions not met, but processedLevel was not null. Clearing processedLevel.");
        setProcessedLevel(null); 
        playerInstanceRef.current = null;
      }
      // console.log("[GameCanvas Effect 5] Conditions not met for processing (client, rawData, canvasSize, assets).");
      return;
    }
    
    // console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
    const newProcessedLevelData = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
    if (newProcessedLevelData) {
      // console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel and newPlayer.");
      setProcessedLevel(newProcessedLevelData);
      // playerInstanceRef and parentPlayerRef are set inside processRawLevelData
    } else {
      // console.warn("[GameCanvas Effect 5] processRawLevelData returned null. Setting processedLevel to null.");
      setProcessedLevel(null);
      playerInstanceRef.current = null;
    }
  }, [isClient, rawLevelData, canvasSize, allAssetsLoaded, processRawLevelData, setProcessedLevel]); // Added processRawLevelData to deps

  // Effect 6: Update refs when their corresponding state changes
  useEffect(() => { processedLevelRef.current = processedLevel; /* console.log("[GameCanvas Effect for processedLevelRef] processedLevelRef.current updated:", processedLevelRef.current ? "Exists" : "null"); */ }, [processedLevel]);
  useEffect(() => { 
    activeCoinsRef.current = activeCoins; 
    // console.log(`[GameCanvas activeCoins STATE updated] activeCoins.length: ${activeCoins.length}`, activeCoins.length > 0 ? `First coin ID: ${activeCoins[0].id}`: "");
  }, [activeCoins]);
  useEffect(() => { currentPairIndexRef.current = currentPairIndex; }, [currentPairIndex]);
  useEffect(() => { activeEnemiesRef.current = activeEnemies; }, [activeEnemies]);

  // Effect 7: Initial entity spawn and finish loading
  useEffect(() => {
    // console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevel}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoins.length}`);
    if (!isLoading) {
      // console.log("[GameCanvas Effect 7] isLoading is false, skipping spawn logic (already loaded or loading finished).");
      return;
    }

    if (!isClient || !processedLevel || canvasSize.width === 0 || canvasSize.height === 0) {
      // console.log("[GameCanvas Effect 7] Pre-conditions (isClient, processedLevel, canvasSize) not met for entity spawn, returning.");
      return;
    }
    
    let coinsAttempted = false;
    if (activeCoins.length === 0 && processedLevel.tiles.length > 0) {
        // console.log(`[GameCanvas Effect 7] Spawning new coin pair for level ${levelPath}`);
        const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
        console.log("[GameCanvas Effect 7] Calling setActiveCoins with:", newCoins.length > 0 ? newCoins[0].id + ` (total ${newCoins.length})` : 'empty array');
        setActiveCoins(newCoins);
        coinsAttempted = true;
    } else if (processedLevel.tiles.length === 0) {
         coinsAttempted = true; // No tiles, no coins needed
    } else if (activeCoins.length > 0) {
         coinsAttempted = true; // Coins already exist
    }

    let enemiesAttempted = false; 
    if (levelPath !== '/levels/level2.json' && levelPath !== '/levels/level1.json') {
        if (activeEnemies.length === 0 && processedLevel.tiles.length > 0) {
            // console.log(`[GameCanvas Effect 7] Spawning enemy for level ${levelPath}`);
            const newEnemy = spawnSingleEnemy(processedLevel, canvasSize.width);
            if (newEnemy) {
                setActiveEnemies([newEnemy]);
            }
            enemiesAttempted = true;
        } else if (processedLevel.tiles.length === 0) {
            enemiesAttempted = true;
        } else if (activeEnemies.length > 0) {
            enemiesAttempted = true;
        }
    } else {
        // console.log(`[GameCanvas Effect 7] Enemies not spawned for level: ${levelPath}`);
        enemiesAttempted = true; 
    }
    
    if (coinsAttempted && enemiesAttempted) {
        // console.log("[GameCanvas Effect 7] All entities attempted or not needed, setting isLoading to false.");
        setIsLoading(false);
    } else {
        // console.log(`[GameCanvas Effect 7] Conditions for setting isLoading to false not met. coinsAttempted: ${coinsAttempted}, enemiesAttempted: ${enemiesAttempted}`);
    }
  }, [
    isClient, isLoading, processedLevel, canvasSize, levelPath,
    spawnNewCoinPair, spawnSingleEnemy, 
    setActiveCoins, setActiveEnemies, setIsLoading, activeCoins.length, activeEnemies.length // Added lengths
  ]);
  
  // Effect 8: Check coin respawn logic (handles pairs)
  useEffect(() => {
    // console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, processedLevel: ${!!processedLevelRef.current}, activeCoins.length: ${activeCoins.length}, currentPairIndex: ${currentPairIndexRef.current}`);
    if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
        // console.log("[GameCanvas Effect 8] Pre-conditions not met, returning.");
        return;
    }

    const allCollectedAndParticlesGone = activeCoins.length > 0 && activeCoins.every(c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent);

    if (allCollectedAndParticlesGone) {
        // console.log(`[GameCanvas Effect 8] All coins in pair ${currentPairIndexRef.current} collected and particles gone.`);
        const nextPairIdx = currentPairIndexRef.current + 1;
        if (nextPairIdx < NUMBER_OF_COIN_PAIRS) {
            // console.log(`[GameCanvas Effect 8] Advancing to pair ${nextPairIdx}. Clearing activeCoins and setting new currentPairIndex.`);
            setActiveCoins([]); // Clear current (collected) pair
            setCurrentPairIndex(nextPairIdx);
        } else {
            // console.log("[GameCanvas Effect 8] All coin pairs collected. No more coins to spawn.");
            if (activeCoins.length > 0) setActiveCoins([]); // Ensure last collected pair is cleared
        }
    }
  }, [activeCoins, isClient, isLoading, canvasSize, processedLevelRef, setActiveCoins, setCurrentPairIndex, NUMBER_OF_COIN_PAIRS]);

   // Effect 8.5: Spawn coin pair when currentPairIndex changes
   useEffect(() => {
    //  console.log(`[GameCanvas Effect 8.5] Running. currentPairIndex: ${currentPairIndex}, activeCoins.length: ${activeCoins.length}, isLoading: ${isLoading}`);
     if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
        //  console.log("[GameCanvas Effect 8.5] Pre-conditions not met, returning.");
         return;
     }

     if (currentPairIndex < NUMBER_OF_COIN_PAIRS && activeCoins.length === 0) {
        //  console.log(`[GameCanvas Effect 8.5] Spawning new coin pair ${currentPairIndex}.`);
         const newPair = spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height);
         if (newPair.length > 0) {
            //  console.log("[GameCanvas Effect 8.5] newPair from spawnNewCoinPair:", newPair.map(c => c.id).join(', '));
             setActiveCoins(newPair);
         } else {
            //  console.warn("[GameCanvas Effect 8.5] spawnNewCoinPair returned empty array, not setting activeCoins.");
         }
     } else if (currentPairIndex >= NUMBER_OF_COIN_PAIRS) {
        // console.log("[GameCanvas Effect 8.5] All pairs already spawned or limit reached.");
     } else if (activeCoins.length > 0) {
        // console.log("[GameCanvas Effect 8.5] Coins already active, not spawning new pair.");
     }
   }, [currentPairIndex, activeCoins.length, isLoading, isClient, processedLevelRef, canvasSize, spawnNewCoinPair, setActiveCoins, NUMBER_OF_COIN_PAIRS]);


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
            } else if (tile.id === 'p3' && currentAssets.tileImage?.complete) { // P3 uses standard tile for now
                ctx.drawImage(currentAssets.tileImage, tile.x, tile.y, tile.width, tile.height);
            }
             else if (currentAssets.tileImage?.complete) {
                ctx.drawImage(currentAssets.tileImage, tile.x, tile.y, tile.width, tile.height);
            } else {
                ctx.fillStyle = tile.color;
                ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
            }
        } else { // Decorative background elements
            if (tile.id === 'tree1' && currentAssets.tree1Image?.complete) ctx.drawImage(currentAssets.tree1Image, tile.x, tile.y, tile.width, tile.height);
            else if (tile.id === 'tree2' && currentAssets.tree2Image?.complete) ctx.drawImage(currentAssets.tree2Image, tile.x, tile.y, tile.width, tile.height);
            else if (tile.id === 'house1' && currentAssets.houseImage?.complete) ctx.drawImage(currentAssets.houseImage, tile.x, tile.y, tile.width, tile.height);
            else { // Fallback to color for other decorative or if image not loaded
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

            // Ease-in-out quadratic interpolation
            const easeProgress = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            const newP3X = startX + (targetX - startX) * easeProgress;
            const newP3Y = startY + (targetY - startY) * easeProgress;
            
            p3Tile.x = newP3X;
            p3Tile.y = newP3Y;
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
        
        let tempIsOnGround = false;
        let activePlatformThisFrame: ProcessedTile | null = null;
        // let platformInducedMoveX = 0;

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
            const currentPlatform = activePlatformThisFrame;
            
            if (currentPlatform.id === 'p3' && p3MovementStateRef.current && p3Tile) {
                // Calculate P3's delta movement for THIS frame
                // We need previous P3 position. Since p3MovementState has startX/Y for current movement segment,
                // we can compare current p3Tile.x/y with what it *would have been* one deltaTimeFactor ago in the interpolation.
                
                const { startTime, startX, startY, targetX, targetY } = p3MovementStateRef.current;
                const elapsedTimeNow = Date.now() - startTime;
                const progressNow = Math.min(elapsedTimeNow / P3_MOVEMENT_DURATION, 1);
                const easeProgressNow = progressNow < 0.5 ? 2 * progressNow * progressNow : 1 - Math.pow(-2 * progressNow + 2, 2) / 2;
                
                const prevElapsedTime = Math.max(0, elapsedTimeNow - deltaTime); // deltaTime is in ms
                const prevProgress = Math.min(prevElapsedTime / P3_MOVEMENT_DURATION, 1);
                const prevEaseProgress = prevProgress < 0.5 ? 2 * prevProgress * prevProgress : 1 - Math.pow(-2 * prevProgress + 2, 2) / 2;

                const prevP3X = startX + (targetX - startX) * prevEaseProgress;
                const prevP3Y = startY + (targetY - startY) * prevEaseProgress;

                const p3_delta_x = p3Tile.x - prevP3X;
                const p3_delta_y = p3Tile.y - prevP3Y;

                player.x += p3_delta_x;
                player.y += p3_delta_y;

            } else if (currentPlatform.vx && typeof currentPlatform.direction === 'number') { 
              const platformInducedMoveX = (currentPlatform.vx * currentPlatform.direction * deltaTimeFactor);
              player.x += platformInducedMoveX;
            }
        } else if (!player.isOnGround) {
            // player.activePlatformId = null; // Already set to null before collision checks or if no activePlatformThisFrame
        }
         if (!activePlatformThisFrame) { // If no platform collision this frame, ensure activePlatformId is null
            player.activePlatformId = null;
        }
        
        // Boundary checks for player X
        if (player.x < 0) player.x = 0;
        else if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
        
        // Boundary checks for player Y (bottom and top)
        const p_ground = currentLevel.tiles.find(t => t.id === 'p_ground');
        if (p_ground && player.y + player.height > p_ground.y) { 
            player.y = p_ground.y - player.height;
            player.isOnGround = true; 
            player.vy = 0;
            player.activePlatformId = p_ground.id;
        } else if (!p_ground && player.y + player.height > canvas.height) { // Fallback if p_ground somehow not found
            player.y = canvas.height - player.height;
            player.isOnGround = true; 
            player.vy = 0;
        }

        const p_top_boundary = currentLevel.tiles.find(t => t.id === 'p_top_boundary');
        if (p_top_boundary && player.y < p_top_boundary.y + p_top_boundary.height) { 
            player.y = p_top_boundary.y + p_top_boundary.height;
            player.vy = 0;
        }
        renderPlayer(ctx, player, currentAssets.playerImage);
    }

    // Update and Render Coins
    const currentActiveCoins = activeCoinsRef.current;
    let collectedThisFrameCount = 0;

    if (currentActiveCoins.length > 0) {
        const updatedCoins = currentActiveCoins.map(coin => {
            let newParticles = [...coin.particles];
            let newIsVisuallyPresent = coin.isVisuallyPresent;
            let newOpacity = coin.currentOpacity;
            let newIsCollected = coin.isCollected;

            if (Date.now() >= coin.targetSpawnTime && !coin.isCollected && coin.currentOpacity < 1) {
                 newOpacity = Math.min(1, coin.currentOpacity + deltaTime / COIN_FADE_IN_DURATION);
            }

            if (player && !coin.isCollected && newOpacity > 0.5 && coin.isVisuallyPresent) {
                const coinRect: Rect = { x: coin.x, y: coin.y, width: coin.width, height: coin.height };
                const playerRect: Rect = { x: player.x, y: player.y, width: player.width, height: player.height };
                if (checkCollision(playerRect, coinRect)) {
                    newIsCollected = true;
                    collectedThisFrameCount++;
                    // console.log(`[GameLoop] Coin ${coin.id} collected!`);
                }
            }
            
            if (newIsCollected && !coin.collectionTime && coin.isVisuallyPresent) { // First frame of collection
                // Generate particles only once
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
                newOpacity = 0; // Make coin invisible immediately
            }

            newParticles = newParticles.map(p => ({
                ...p,
                x: p.x + p.vx * deltaTimeFactor,
                y: p.y + p.vy * deltaTimeFactor + (GRAVITY * COIN_PARTICLE_GRAVITY_FACTOR * deltaTimeFactor),
                life: p.life - deltaTime,
                opacity: Math.max(0, p.life / COIN_PARTICLE_LIFESPAN),
            })).filter(p => p.life > 0);
            
            // If coin was collected (newIsCollected is true) and particles are done, it's no longer visually present
            if (newIsCollected && newParticles.length === 0) {
                newIsVisuallyPresent = false;
            }

            return { 
                ...coin, 
                isCollected: newIsCollected,
                collectionTime: (newIsCollected && !coin.collectionTime) ? Date.now() : coin.collectionTime,
                currentOpacity: newOpacity, 
                particles: newParticles, 
                isVisuallyPresent: newIsVisuallyPresent, 
                rotationAngle: (coin.rotationAngle + coin.rotationSpeed * deltaTimeFactor) % (Math.PI * 2) 
            };
        });
        if (JSON.stringify(activeCoinsRef.current) !== JSON.stringify(updatedCoins)) {
             setActiveCoins(updatedCoins);
        }
    }
    // console.log("[gameLoop] Calling renderCoins with activeCoinsRef.current.length:", activeCoinsRef.current.length);
    renderCoins(ctx, activeCoinsRef.current, currentAssets.coinImage); 

    // Update Enemies (if any)
    const currentActiveEnemies = activeEnemiesRef.current;
    if (currentActiveEnemies.length > 0 && player) {
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
                // console.log("[GameLoop] Player collided with enemy!");
                // Reset player to p_ground center
                const p_ground_tile = currentLevel.tiles.find(t => t.id === 'p_ground');
                if (p_ground_tile) {
                    player.x = currentCanvas.width / 2 - player.width / 2;
                    player.y = p_ground_tile.y - player.height;
                    player.vx = 0;
                    player.vy = 0;
                    player.isOnGround = true;
                    player.activePlatformId = p_ground_tile.id;
                } else { // Fallback if p_ground not found
                    player.x = currentCanvas.width / 2 - player.width / 2;
                    player.y = currentCanvas.height - player.height;
                    player.vx = 0;
                    player.vy = 0;
                    player.isOnGround = true;
                }
                // toast({ title: "Ouch!", description: "Collided with an enemy!", variant: "destructive" });
            }
            return { ...enemy, x: newEnemyX };
        });
        if (JSON.stringify(activeEnemiesRef.current) !== JSON.stringify(updatedEnemies)) {
            setActiveEnemies(updatedEnemies);
        }
    }
    renderEnemies(ctx, activeEnemiesRef.current);


    // Render Foreground Decorative Tiles
    currentLevel.tiles.forEach(tile => {
      if (tile.layer === 'foreground') {
        if ((tile.id.startsWith("bush_") && tile.id.endsWith("_1")) && currentAssets.flowersImage?.complete) { // Small bushes (flowers)
            ctx.drawImage(currentAssets.flowersImage, tile.x, tile.y, tile.width, tile.height);
        } else if ((tile.id.startsWith("bush_") && tile.id.endsWith("_2")) && currentAssets.largeBushImage?.complete) { // Large bushes
            ctx.drawImage(currentAssets.largeBushImage, tile.x, tile.y, tile.width, tile.height);
        }
        else { // Fallback to color
            ctx.fillStyle = tile.color;
            ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
        }
      }
    });
        
    // Update HUD stats if callback is provided
    if (onGameStatsUpdate) {
      onGameStatsUpdate({ 
        uncollectedInPair: activeCoinsRef.current.filter(c => !c.isCollected && c.isVisuallyPresent).length,
        currentPairNum: currentPairIndexRef.current, 
        totalPairsNum: NUMBER_OF_COIN_PAIRS 
      });
    }
    
    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, [ // IMPORTANT: Carefully manage dependencies here
    isClient, assets, resetExecuteAction, onGameStatsUpdate, 
    GRAVITY, JUMP_STRENGTH, PLAYER_SPEED, PLAYER_HEIGHT, PLAYER_WIDTH,
    COIN_FADE_IN_DURATION, COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX,
    PLATFORM_SPEED, ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, P3_MOVEMENT_DURATION, P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, NUMBER_OF_COIN_PAIRS,
    // Refs used in gameLoop:
    processedLevelRef, playerInstanceRef, activeCoinsRef, currentPairIndexRef, activeEnemiesRef,
    p3BasePositionRef, p3InterestPointsRef, p3CurrentTargetIndexRef, p3MovementStateRef,
    // Stable setters:
    setActiveCoins, setActiveEnemies,
    // Other stable functions:
    checkCollision, renderPlayer, renderCoins, renderEnemies,
  ]);

  // Effect 9: Start/Stop Game Loop
  useEffect(() => {
    // console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize: W${canvasSize.width}H${canvasSize.height}, processedLevel: ${!!processedLevel}`);
    const conditionsMet = isClient && !isLoading && canvasRef.current && ctxRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevelRef.current ;
    
    // console.log(`[GameCanvas Effect 9] Conditions: isClient=${isClient}, !isLoading=${!isLoading}, canvasRef=${!!canvasRef.current}, ctxRef=${!!ctxRef.current}, canvasW=${canvasSize.width}>0, canvasH=${canvasSize.height}>0, processedLevelRef=${!!processedLevelRef.current}. Met: ${conditionsMet}`);
    
    if (conditionsMet) {
      // console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); 
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    } else {
      // console.log("[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start.");
      if (animationFrameIdRef.current) {
        // console.log("[GameCanvas Effect 9] Cancelling existing animation frame.");
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    }
    return () => {
      if (animationFrameIdRef.current) {
        // console.log("[GameCanvas Effect 9] Cleanup: Cancelling animation frame.");
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [isClient, isLoading, canvasSize, processedLevel, gameLoop]); // depends on gameLoop (from useCallback) and processedLevel (state)

  // console.log(`[GameCanvas] Rendering. isClient: ${isClient}, isLoading: ${isLoading}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);
  if (!isClient) {
    // console.log("[GameCanvas] Rendering null because not client-side yet (isClient is false).");
    return null; // Or a basic placeholder if preferred during SSR for the dynamic import
  }
  
  // Removed the isLoading check that returned "Initializing Canvas..."
  // The loading state is now handled by the parent component's dynamic import loading prop
  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full"
      aria-label="Game Canvas"
      tabIndex={0} 
    />
  );
}

