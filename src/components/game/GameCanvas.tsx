
"use client";

import type { DependencyList } from 'react';
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState, GameStats } from '@/types/game';
import {
  GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
  COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
  COIN_FADE_IN_DURATION, TOTAL_COINS_ON_LEVEL, COIN_SPAWN_STAGGER_DELAY,
  COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE,
  ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, PLATFORM_SPEED,
  COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR,
  P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION, ICE_FRICTION,
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
  iceTileImage: HTMLImageElement | null;
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
  iceTileImageLoaded: boolean;
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
    playerImage: null, tileImage: null, iceTileImage: null, coinImage: null, stoneImage: null,
    tree1Image: null, tree2Image: null, flowersImage: null,
    smallBushImage: null, largeBushImage: null, houseImage: null,
    playerImageLoaded: false, tileImageLoaded: false, iceTileImageLoaded: false, coinImageLoaded: false, stoneImageLoaded: false,
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

  console.log(`[GameCanvas] Component body. levelPath: ${levelPath}`);

  // Helper to parse dimensions (px or %)
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
    console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
    if (!currentRawLevelData || currentCanvasWidth === 0 || currentCanvasHeight === 0) {
      console.warn("[GameCanvas processRawLevelData] Aborted: No raw level data or canvas size is zero.");
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
      image: assets.playerImage,
      facingDirection: 'right',
      activePlatformId: startPlatform ? startPlatform.id : null,
    };
    playerInstanceRef.current = newPlayer;

    if (levelPath === '/levels/level2.json' || levelPath === '/levels/level3.json') {
        const p_ground_tile = processedTiles.find(t => t.id === 'p_ground');
        if (p_ground_tile) {
            const p3_size_w_val = P3_SIZE_W; 
            const p3_size_h_val = P3_SIZE_H; 
            const p_ground_top_y = p_ground_tile.y;
            
            let p3_y_final_top = p_ground_top_y - 300;
            const p3_x_centered = (currentCanvasWidth / 2) - (p3_size_w_val / 2);

            p3BasePositionRef.current = { x: p3_x_centered, y: p3_y_final_top };
            console.log(`[processRawLevelData] Level ${levelPath}: p_ground_top_y: ${p_ground_top_y} p3BasePosRef.current:`, p3BasePositionRef.current);

            const driftRange = P3_DRIFT_RANGE;
            p3InterestPointsRef.current = [ 
                { x: p3_x_centered - driftRange, y: p3_y_final_top - driftRange },
                { x: p3_x_centered + driftRange, y: p3_y_final_top - driftRange },
                { x: p3_x_centered + driftRange, y: p3_y_final_top + driftRange },
                { x: p3_x_centered - driftRange, y: p3_y_final_top + driftRange },
            ];
            p3CurrentTargetIndexRef.current = 0; 
            p3MovementStateRef.current = null; 

            const p3TileToAdd: ProcessedTile = {
                id: 'p3',
                x: p3_x_centered, 
                y: p3_y_final_top,
                width: p3_size_w_val,
                height: p3_size_h_val,
                type: 1, 
                color: 'hsl(var(--muted))', 
                vx: 0, 
                direction: 0,
                'data-ai-hint': 'floating platform small rock'
            };
            processedTiles.push(p3TileToAdd);
            console.log(`[processRawLevelData] Level ${levelPath}: Added p3Tile:`, p3TileToAdd);
        } else {
          console.warn(`[processRawLevelData] p_ground tile not found for level ${levelPath}, P3 platform not added.`);
        }
    }
    console.log(`[processRawLevelData] Successfully processed. Player:`, newPlayer, `Number of tiles: ${processedTiles.length}`);
    return {
      playerStart: { xPx: playerStartX, yPx: playerStartY },
      tiles: processedTiles,
    };
  }, [levelPath, assets.playerImage, parseDimension, P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE]);

  const spawnSingleCoin = useCallback(
    (currentProcessedLevel: ProcessedLevelData, currentCanvasWidth: number, currentCanvasHeight: number): CoinState[] => {
        console.log(`[spawnSingleCoin] Called. Canvas W:${currentCanvasWidth}, H:${currentCanvasHeight}. ProcessedLevel exists: ${!!currentProcessedLevel}`);
        
        const p_ground = currentProcessedLevel.tiles.find(tile => tile.id === 'p_ground');
        if (!p_ground) {
             console.warn("[spawnSingleCoin] p_ground tile not found. No coins spawned.");
             return [];
        }
        const p_groundTopY = p_ground.y;
        const gamePlatforms = currentProcessedLevel.tiles.filter(tile => tile.type === 1 && tile.id !== 'p_ground' && tile.id !== 'p_top_boundary' && tile.id !== 'p3');
        
        let actualHighestPlatformTopY = p_groundTopY; 
        if (gamePlatforms.length > 0) {
            actualHighestPlatformTopY = Math.min(...gamePlatforms.map(p => p.y), p_groundTopY);
        }
        console.log(`[spawnSingleCoin] p_groundTopY: ${p_groundTopY}, actualHighestPlatformTopY: ${actualHighestPlatformTopY}`);

        const ySpawnZoneBottomCoinTopEdge = p_groundTopY - COIN_VERTICAL_SPAWN_BOTTOM_OFFSET - COIN_SIZE;
        let ySpawnZoneTopCoinTopEdge = actualHighestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;
        
        if (ySpawnZoneTopCoinTopEdge < COIN_SPAWN_TOP_MARGIN) { 
            ySpawnZoneTopCoinTopEdge = COIN_SPAWN_TOP_MARGIN;
        }
        console.log(`[spawnSingleCoin] ySpawnZoneBottomCoinTopEdge: ${ySpawnZoneBottomCoinTopEdge}, ySpawnZoneTopCoinTopEdge: ${ySpawnZoneTopCoinTopEdge}`);
        
        if (ySpawnZoneTopCoinTopEdge >= ySpawnZoneBottomCoinTopEdge) {
            console.warn(`[spawnSingleCoin] Invalid spawn zone (top: ${ySpawnZoneTopCoinTopEdge} >= bottom: ${ySpawnZoneBottomCoinTopEdge}). No coins spawned.`);
            return [];
        }

        const coinX = Math.random() * (currentCanvasWidth - COIN_SIZE);
        const coinY = ySpawnZoneTopCoinTopEdge + Math.random() * (ySpawnZoneBottomCoinTopEdge - ySpawnZoneTopCoinTopEdge);
        const rotationSpeed = COIN_ROTATION_SPEED_MIN + Math.random() * (COIN_ROTATION_SPEED_MAX - COIN_ROTATION_SPEED_MIN);
        
        const uniqueId = `coin-${Date.now()}-${totalCoinsSpawnedThisLevelRef.current}`;
        
        const newCoin: CoinState = {
            id: uniqueId,
            x: coinX,
            y: coinY,
            width: COIN_SIZE,
            height: COIN_SIZE,
            isCollected: false,
            targetSpawnTime: Date.now(), 
            currentOpacity: 0, 
            isVisuallyPresent: true,
            particles: [],
            rotationAngle: Math.random() * Math.PI * 2,
            rotationSpeed: rotationSpeed,
        };
        console.log("[spawnSingleCoin] Created 1 coin:", newCoin);
        return [newCoin];
    },
    [COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX]
  );

  const spawnSingleEnemy = useCallback((currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number): EnemyState | null => {
    console.log(`[spawnSingleEnemy] Called. Canvas W:${currentCanvasWidth}. ProcessedLevel exists: ${!!currentProcessedLevel}`);
    if (!currentProcessedLevel || !currentProcessedLevel.tiles) {
        console.warn("[spawnSingleEnemy] No processed level data or tiles. No enemy spawned.");
        return null;
    }

    const p1 = currentProcessedLevel.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
    const p2 = currentProcessedLevel.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');

    if (!p1 || !p2) {
        console.warn("[spawnSingleEnemy] p1 or p2 tile not found. No enemy spawned.");
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
    console.log("[spawnSingleEnemy] Created enemy:", enemy);
    return enemy;
  }, [ENEMY_RADIUS, ENEMY_COLOR, PLATFORM_SPEED, ENEMY_SPEED_FACTOR]);


  // Effect 1: Set isClient, Load Assets
  useEffect(() => {
    console.log(`[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state: ${isClient}`);
    if (!isClient) setIsClient(true);
    
    const assetConfigs = [
      { key: 'playerImage', path: '/assets/images/hero_jeans3.png', hint: 'character orange blue' },
      { key: 'tileImage', path: '/assets/images/platform_grass.png', hint: 'platform grass dirt' },
      { key: 'iceTileImage', path: '/assets/images/platform_ice2.png', hint: 'ice platform texture' },
      { key: 'coinImage', path: '/assets/images/thankscoin.png', hint: 'collectible coin gold' },
      { key: 'stoneImage', path: '/assets/images/stone1.jpg', hint: 'stone rock texture' },
      { key: 'tree1Image', path: '/assets/images/tree1.png', hint: 'tree nature tall' }, 
      { key: 'tree2Image', path: '/assets/images/tree2.png', hint: 'tree nature smaller' },
      { key: 'flowersImage', path: '/assets/images/flowers.png', hint: 'flowers plant colorful' }, 
      { key: 'smallBushImage', path: '/assets/images/flowers.png', hint: 'bush small green' }, // Alias
      { key: 'largeBushImage', path: '/assets/images/bush1.png', hint: 'bush large green' }, 
      { key: 'houseImage', path: '/assets/images/house1.png', hint: 'house building simple' }, 
    ] as const;

    assetConfigs.forEach(config => {
      const imageKey = config.key;
      const loadedKey = `${imageKey}Loaded` as keyof AssetContainer;
      
      setAssets(currentAssets => {
        if (!currentAssets[imageKey] && !(currentAssets[loadedKey] as boolean)) {
          console.log(`[GameCanvas Effect 1] Loading asset: ${imageKey}`);
          const img = new Image();
          img.src = config.path;
          img.setAttribute('data-ai-hint', config.hint);
          img.onload = () => {
            console.log(`[GameCanvas Effect 1] Asset loaded: ${imageKey}`);
            setAssets(prev => ({ ...prev, [imageKey]: img, [loadedKey]: true as any }));
          }
          img.onerror = () => {
            console.error(`[GameCanvas Effect 1] Failed to load ${imageKey} from ${config.path}.`);
            setAssets(prev => ({ ...prev, [loadedKey]: true as any })); // Mark as "attempted"
          };
          return { ...currentAssets, [imageKey]: img as any}; 
        }
        return currentAssets;
      });
    });
  }, [isClient, setIsClient]);

  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    console.log(`[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize: {width: ${canvasSize.width}, height: ${canvasSize.height}}`);
    if (canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      if (!ctxRef.current) {
        ctxRef.current = canvasRef.current.getContext('2d');
        console.log("[GameCanvas Effect 2] Canvas context obtained/confirmed.");
      }
      console.log(`[GameCanvas Effect 2] Canvas attributes set to W:${canvasSize.width}, H:${canvasSize.height}`);
    } else {
      console.log("[GameCanvas Effect 2] Canvas not ready or size is zero, attributes not set.");
    }
  }, [canvasSize]);

  // Effect 3: Observe parent element size and update canvasSize state
  useEffect(() => {
    console.log(`[GameCanvas Effect 3] Running: Observe parent size. isClient: ${isClient}`);
    if (!isClient || !canvasRef.current?.parentElement) {
      console.log("[GameCanvas Effect 3] Not client or no parent element, returning.");
      return;
    }
    const parentElement = canvasRef.current.parentElement;
    console.log("[GameCanvas Effect 3] Parent element found:", parentElement);

    const updateCanvasSizeState = () => {
      const newWidth = parentElement.clientWidth;
      const newHeight = parentElement.clientHeight;
      console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Parent dims: W:${newWidth}, H:${newHeight}`);
      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
           if ((newWidth > 0 && newHeight > 0) || (newWidth === 0 && newHeight === 0 && (currentSize.width !== 0 || currentSize.height !== 0))) {
            console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
            return { width: newWidth, height: newHeight };
           }
        }
        return currentSize;
      });
    };
    updateCanvasSizeState(); 
    const resizeObserver = new ResizeObserver(updateCanvasSizeState);
    resizeObserver.observe(parentElement);
    console.log("[GameCanvas Effect 3] ResizeObserver observing parent.");
    window.addEventListener('resize', updateCanvasSizeState); 
    
    return () => {
      console.log("[GameCanvas Effect 3] Cleanup: Disconnecting ResizeObserver and removing window resize listener.");
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateCanvasSizeState);
    };
  }, [isClient]);

  // Effect 4: Load raw level data
  useEffect(() => {
    console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      console.log("[GameCanvas Effect 4] Not client or no levelPath, returning.");
      setRawLevelData(null);
      setProcessedLevel(null);
      processedLevelRef.current = null;
      setActiveCoins([]);
      activeCoinsRef.current = [];
      setActiveEnemies([]);
      activeEnemiesRef.current = [];
      setTotalCoinsSpawnedThisLevel(0);
      setIsLoading(true); // Ensure loading state if path is invalid or no client
      return;
    }

    console.log(`[GameCanvas Effect 4] Initiating new level load sequence for: ${levelPath}`);
    setIsLoading(true); 
    setRawLevelData(null);
    setProcessedLevel(null); 
    processedLevelRef.current = null;
    setActiveCoins([]); 
    activeCoinsRef.current = [];
    setActiveEnemies([]); 
    activeEnemiesRef.current = [];
    setTotalCoinsSpawnedThisLevel(0); 
    
    loadLevel(levelPath)
      .then(data => {
        console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`, data ? 'Data OK' : 'Data NULL');
        setRawLevelData(data);
      })
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
      });
  }, [levelPath, isClient, setIsLoading, setRawLevelData, setProcessedLevel, setActiveCoins, setActiveEnemies, setTotalCoinsSpawnedThisLevel]); 

  // Effect 5: Process raw level data when available and canvas is sized and assets are loaded
  useEffect(() => {
    const allAssetsActuallyLoaded = assets.playerImageLoaded &&
                                assets.tileImageLoaded &&
                                assets.coinImageLoaded &&
                                assets.stoneImageLoaded &&
                                assets.tree1ImageLoaded &&
                                assets.tree2ImageLoaded &&
                                assets.flowersImageLoaded &&
                                assets.smallBushImageLoaded &&
                                assets.largeBushImageLoaded &&
                                assets.houseImageLoaded &&
                                assets.iceTileImageLoaded;
    console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsActuallyLoaded: ${allAssetsActuallyLoaded}`);

    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsActuallyLoaded) {
      console.log("[GameCanvas Effect 5] Pre-conditions not met. Current processedLevel is:", processedLevelRef.current ? "Exists" : "null");
      if (processedLevelRef.current !== null) {
        console.log("[GameCanvas Effect 5] Resetting processedLevel to null due to unmet pre-conditions.");
        setProcessedLevel(null); // This will trigger ref update via Effect 6
        playerInstanceRef.current = null;
      }
      return;
    }
    
    console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
    const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
    
    if (newProcessedLevel) {
      console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel.");
      setProcessedLevel(newProcessedLevel); // This will trigger ref update via Effect 6
      // playerInstanceRef.current is set inside processRawLevelData
      if (parentPlayerRef && playerInstanceRef.current) {
           parentPlayerRef.current = playerInstanceRef.current;
      }
    } else {
      console.warn("[GameCanvas Effect 5] processRawLevelData returned null. Setting processedLevel to null.");
      setProcessedLevel(null); // This will trigger ref update via Effect 6
      playerInstanceRef.current = null;
    }
  }, [isClient, rawLevelData, canvasSize, assets, processRawLevelData, setProcessedLevel, parentPlayerRef]); 

  // Effect 6: Update refs for states that gameLoop reads directly
  useEffect(() => { activeCoinsRef.current = activeCoins; }, [activeCoins]);
  useEffect(() => { activeEnemiesRef.current = activeEnemies; }, [activeEnemies]);
  useEffect(() => { totalCoinsSpawnedThisLevelRef.current = totalCoinsSpawnedThisLevel; }, [totalCoinsSpawnedThisLevel]);
  useEffect(() => { executeActionRef.current = executeAction; }, [executeAction]);
  useEffect(() => {
    processedLevelRef.current = processedLevel;
    console.log(`[GameCanvas Effect 6.1 for processedLevelRef] processedLevelRef.current updated:`, processedLevelRef.current ? "Exists" : "null");
  }, [processedLevel]);


  // Effect 7: Spawn entities and finish loading
  useEffect(() => {
    console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevelRef.current}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoinsRef.current.length}`);
    
    if (!isLoading) {
        console.log("[GameCanvas Effect 7] isLoading is false, skipping logic.");
        return;
    }

    if (!isClient || canvasSize.width === 0 || canvasSize.height === 0) {
        console.log("[GameCanvas Effect 7] Pre-conditions (isClient or canvasSize) not met, returning.");
        return;
    }
    
    if (!processedLevelRef.current) {
        console.warn("[GameCanvas Effect 7] processedLevelRef.current is null. Setting isLoading to false. Game will not display level elements correctly.");
        setIsLoading(false);
        return;
    }

    let coinsAttempted = activeCoinsRef.current.length > 0;
    if (!coinsAttempted && processedLevelRef.current.tiles.length > 0 && totalCoinsSpawnedThisLevelRef.current < TOTAL_COINS_ON_LEVEL) {
        console.log(`[GameCanvas Effect 7] Spawning first coin for level ${levelPath}`);
        const newCoin = spawnSingleCoin(processedLevelRef.current, canvasSize.width, canvasSize.height);
        setActiveCoins(newCoin); // newCoin is an array with one coin or empty
        if (newCoin.length > 0) {
          // setTotalCoinsSpawnedThisLevel(1); // We spawned one
        }
        coinsAttempted = true;
    } else if (processedLevelRef.current.tiles.length === 0 || totalCoinsSpawnedThisLevelRef.current >= TOTAL_COINS_ON_LEVEL) {
        coinsAttempted = true; // No tiles or all coins spawned for this logic path
    }
    
    let enemiesAttempted = activeEnemiesRef.current.length > 0;
     if (levelPath !== '/levels/level1.json' && levelPath !== '/levels/level2.json' && levelPath !== '/levels/level3.json') {
        if (!enemiesAttempted && processedLevelRef.current.tiles.length > 0) {
             const p1 = processedLevelRef.current.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
             const p2 = processedLevelRef.current.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');
             if (p1 && p2) {
                const newEnemy = spawnSingleEnemy(processedLevelRef.current, canvasSize.width);
                if (newEnemy) {
                    setActiveEnemies([newEnemy]);
                }
             }
             enemiesAttempted = true;
        } else if (processedLevelRef.current.tiles.length === 0){
            enemiesAttempted = true;
        }
    } else {
        enemiesAttempted = true; // Enemies not needed for levels 1, 2, 3 in this effect
    }
    
    if (coinsAttempted && enemiesAttempted) {
        console.log("[GameCanvas Effect 7] All initial entity spawn attempts complete, setting isLoading to false.");
        setIsLoading(false);
    } else {
       console.log(`[GameCanvas Effect 7] Entity spawn conditions not fully met yet. Coins attempted: ${coinsAttempted}, Enemies attempted: ${enemiesAttempted}`);
    }
  }, [isLoading, isClient, processedLevel, canvasSize, levelPath, assets, // assets for allAssetsLoaded check implicitly
      spawnSingleCoin, setActiveCoins, spawnSingleEnemy, setActiveEnemies, setIsLoading]); // Removed totalCoinsSpawnedThisLevel from deps


  // Effect 8: Handle subsequent coin spawning after collection
  useEffect(() => {
    console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, processedLevel: ${!!processedLevelRef.current}, totalCoinsSpawned: ${totalCoinsSpawnedThisLevelRef.current}`);
    if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) return;
    
    const currentActiveCoins = activeCoinsRef.current;
    const allCollectedAndParticlesGone = currentActiveCoins.length > 0 && currentActiveCoins.every(
      c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent
    );

    if (currentActiveCoins.length === 0 && totalCoinsSpawnedThisLevelRef.current < TOTAL_COINS_ON_LEVEL) {
        // This case handles spawning if activeCoins is empty (e.g., after collecting the previous one, or initial spawn if Effect 7 didn't cover it)
        console.log(`[GameCanvas Effect 8] Active coins empty, ${totalCoinsSpawnedThisLevelRef.current}/${TOTAL_COINS_ON_LEVEL} spawned. Spawning next coin.`);
        const newCoin = spawnSingleCoin(processedLevelRef.current, canvasSize.width, canvasSize.height);
        setActiveCoins(newCoin);
        // setTotalCoinsSpawnedThisLevel(prev => prev + newCoin.length); // This is handled by the collection logic now.
    } else if (allCollectedAndParticlesGone) {
        console.log(`[GameCanvas Effect 8] Current coin collected. totalCoinsSpawned: ${totalCoinsSpawnedThisLevelRef.current}`);
        setTotalCoinsSpawnedThisLevel(prevCount => prevCount + 1); // Increment when a coin is fully processed
        
        if (totalCoinsSpawnedThisLevelRef.current < TOTAL_COINS_ON_LEVEL) { // Check against the ref's *next* value implicitly
            console.log(`[GameCanvas Effect 8] Spawning next coin after collection. Current count will be ${totalCoinsSpawnedThisLevelRef.current +1}`);
            const newCoin = spawnSingleCoin(processedLevelRef.current, canvasSize.width, canvasSize.height);
            setActiveCoins(newCoin);
        } else {
            console.log("[GameCanvas Effect 8] All coins for the level collected and processed.");
            setActiveCoins([]); 
        }
    }
  }, [
      activeCoins, // Triggers when a coin is collected and activeCoins array is updated (cleared or new coin added)
      isLoading, isClient, canvasSize, processedLevel, // processedLevel (state) to ensure level data is there
      spawnSingleCoin, setActiveCoins, setTotalCoinsSpawnedThisLevel, // totalCoinsSpawnedThisLevel (state) for the condition
  ]);
  
  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const currentLevel = processedLevelRef.current; 
    const player = playerInstanceRef.current;
    const currentExecuteActionVal = executeActionRef.current;
    const currentAssets = assets;
    
    if (!ctx || !canvas || canvas.width === 0 || canvas.height === 0 ) {
      if (!isLoading && isClient && canvas && ctx) { // Check isLoading to avoid drawing error if level didn't load
           if (!currentLevel) {
             ctx.clearRect(0, 0, canvas.width, canvas.height);
             ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
             ctx.fillRect(0, 0, canvas.width, canvas.height);
             ctx.font = '16px Arial';
             ctx.fillStyle = 'white';
             ctx.textAlign = 'center';
             ctx.fillText('Failed to load level data. Please check server and file path.', canvas.width / 2, canvas.height / 2);
           }
       }
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      return;
    }
    
    const loopStartTime = Date.now();
    let deltaTime = loopStartTime - lastFrameTime.current;
    const MAX_DELTA_TIME_MS = 100; 
    if (deltaTime > MAX_DELTA_TIME_MS) {
        deltaTime = MAX_DELTA_TIME_MS;
    }
    const deltaTimeFactor = Math.max(0.1, Math.min(2, deltaTime / (1000 / 60)));
    lastFrameTime.current = loopStartTime;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!currentLevel) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = '16px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText('Level data is not available.', canvas.width / 2, canvas.height / 2);
        animationFrameIdRef.current = requestAnimationFrame(gameLoop);
        return;
    }
    
    // Background and non-collidable tiles (Layer 1)
    currentLevel.tiles.forEach(tile => {
      if (tile.layer !== 'foreground' && tile.id !=='p3') { 
        let imageToUse = currentAssets.tileImage; 
        if (levelPath === '/levels/level3.json' && currentAssets.iceTileImage?.complete) {
            imageToUse = currentAssets.iceTileImage;
        }

        if (tile.type === 1) { 
            if (tile.id.startsWith('stone_') && currentAssets.stoneImage?.complete) {
                ctx.drawImage(currentAssets.stoneImage, tile.x, tile.y, tile.width, tile.height);
            } else if (imageToUse?.complete) {
                ctx.drawImage(imageToUse, tile.x, tile.y, tile.width, tile.height);
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
            const easeProgress = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2; // Ease in-out quad
            p3Tile.x = startX + (targetX - startX) * easeProgress;
            p3Tile.y = startY + (targetY - startY) * easeProgress;
        }
        
        let p3ImageToUse = currentAssets.tileImage;
        if (levelPath === '/levels/level3.json' && currentAssets.iceTileImage?.complete) {
            p3ImageToUse = currentAssets.iceTileImage;
        }

        if (p3ImageToUse?.complete) {
            ctx.drawImage(p3ImageToUse, p3Tile.x, p3Tile.y, p3Tile.width, p3Tile.height);
        } else {
            ctx.fillStyle = p3Tile.color;
            ctx.fillRect(p3Tile.x, p3Tile.y, p3Tile.width, p3Tile.height);
        }
    }

    currentLevel.tiles.forEach(tile => {
        if (tile.id !== 'p3' && tile.vx && typeof tile.direction === 'number') { 
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
    
    const currentActiveCoins = activeCoinsRef.current;
    if(currentActiveCoins.length > 0) { 
        renderCoins(ctx, currentActiveCoins, currentAssets.coinImage); 
    }

    const currentActiveEnemies = activeEnemiesRef.current;
    if (currentActiveEnemies.length > 0) {
        renderEnemies(ctx, currentActiveEnemies);
    }
    
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
           if (levelPath === '/levels/level3.json' && player.isOnGround) {
             const activePlatform = player.activePlatformId ? currentLevel.tiles.find(t => t.id === player.activePlatformId) : null;
             if (activePlatform && activePlatform.type === 1) { // Check if it's a platform tile
                player.vx *= ICE_FRICTION;
                if (Math.abs(player.vx) < 0.1) {
                  player.vx = 0;
                }
             } else { // Not on an ice platform or platform type not 1
                player.vx = 0;
             }
           } else { // Not level 3 or not on ground
             player.vx = 0;
           }
        }

        let nextPlayerX = player.x + player.vx * deltaTimeFactor;
        let nextPlayerY = player.y + player.vy * deltaTimeFactor;
        
        let prevIsOnGround = player.isOnGround;
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
        
        player.activePlatformId = activePlatformThisFrame ? activePlatformThisFrame.id : null;
        if (player.isOnGround && activePlatformThisFrame) {
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
        } else if (prevIsOnGround && !player.isOnGround && player.activePlatformId) {
             const previousPlatform = currentLevel.tiles.find(t => t.id === player.activePlatformId);
             if (previousPlatform && previousPlatform.id === 'p3' && p3Tile && p3MovementStateRef?.current) {
                  const { startX: p3_start_x, targetX: p3_target_x, startTime: p3_start_time } = p3MovementStateRef.current;
                  const prevElapsedTime = Math.max(0, (Date.now() - deltaTime) - p3_start_time);
                  const calcX = (elapsed: number) => {
                      const progress = Math.min(elapsed / P3_MOVEMENT_DURATION, 1);
                      const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                      return p3_start_x + (p3_target_x - p3_start_x) * ease;
                  };
                  const prevP3X = calcX(prevElapsedTime);
                  const currentP3X = calcX(Date.now() - p3_start_time);
                  const p3_frame_delta_x = currentP3X - prevP3X;
                  player.x += p3_frame_delta_x; 
             }
            // No need to set player.activePlatformId = null here, it's handled by the general assignment above
        }
        // General case: if not on ground or no active platform, activePlatformId is already null from general assignment
        
        if (player.x < 0) player.x = 0;
        else if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
        
        // Check against p_ground (if it exists) explicitly, in case player falls through other platforms
        const p_ground_tile = currentLevel.tiles.find(t => t.id === 'p_ground');
        if (p_ground_tile && player.y + player.height > p_ground_tile.y && player.y < p_ground_tile.y + (p_ground_tile.height / 2) ) { // check if player's bottom is below p_ground's top
            player.y = p_ground_tile.y - player.height;
            player.isOnGround = true; 
            player.vy = 0;
            if(!activePlatformThisFrame) player.activePlatformId = p_ground_tile.id;
        }
        
        const p_top_boundary = currentLevel.tiles.find(t => t.id === 'p_top_boundary');
        if (p_top_boundary && player.y < p_top_boundary.y + p_top_boundary.height) { 
            player.y = p_top_boundary.y + p_top_boundary.height;
            player.vy = 0;
        }
        renderPlayer(ctx, player, currentAssets.playerImage);
    }

    const updatedCoins = activeCoinsRef.current.map(coin => {
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
                // newCollectionTime will be set when particles are generated
            }
        }
        
        if (newIsCollected && !coin.collectionTime && coin.isVisuallyPresent) { 
            newCollectionTime = Date.now(); // Set collection time when particles are first generated
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
            console.log(`[gameLoop] Coin ${coin.id} visually removed, particles gone.`);
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
    
    if(JSON.stringify(activeCoinsRef.current) !== JSON.stringify(updatedCoins)) {
      setActiveCoins(updatedCoins);
    }
    
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
        if(JSON.stringify(activeEnemiesRef.current) !== JSON.stringify(updatedEnemies)) {
          setActiveEnemies(updatedEnemies);
        }
    }

    currentLevel.tiles.forEach(tile => {
      if (tile.layer === 'foreground') {
        if ((tile.id.startsWith("bush_left_") || tile.id.startsWith("bush_right_")) && (tile.id.endsWith("_1")) && currentAssets.smallBushImage?.complete) { 
            ctx.drawImage(currentAssets.smallBushImage, tile.x, tile.y, tile.width, tile.height);
        } else if ((tile.id.startsWith("bush_left_") || tile.id.startsWith("bush_right_")) && (tile.id.endsWith("_2")) && currentAssets.largeBushImage?.complete) { 
            ctx.drawImage(currentAssets.largeBushImage, tile.x, tile.y, tile.width, tile.height);
        }
        else { 
            ctx.fillStyle = tile.color;
            ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
        }
      }
    });
        
    if (onGameStatsUpdate) {
      const collectedAndProcessedCoins = totalCoinsSpawnedThisLevelRef.current;
      onGameStatsUpdate({ 
        collectedCoins: collectedAndProcessedCoins,
        totalCoinsOnLevel: TOTAL_COINS_ON_LEVEL 
      });
    }
    
    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, [ 
    isClient, levelPath, assets, resetExecuteAction, onGameStatsUpdate, 
    GRAVITY, JUMP_STRENGTH, PLAYER_SPEED, PLAYER_HEIGHT, PLAYER_WIDTH,
    COIN_FADE_IN_DURATION, COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX,
    PLATFORM_SPEED, ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, P3_MOVEMENT_DURATION, TOTAL_COINS_ON_LEVEL, ICE_FRICTION,
    setActiveCoins, setActiveEnemies, // Setters are stable
    p3BasePositionRef, p3InterestPointsRef, p3CurrentTargetIndexRef, p3MovementStateRef, // Refs are stable
    checkCollision, renderPlayer, renderCoins, renderEnemies, // Imported functions are stable
  ]);

  // Effect 9: Start/Stop Game Loop
  useEffect(() => {
    const currentProcessedLevelVal = processedLevelRef.current;
    const conditionsMet = isClient && !isLoading && canvasRef.current && ctxRef.current && canvasSize.width > 0 && canvasSize.height > 0 && currentProcessedLevelVal;
    
    console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. Conditions Met: ${conditionsMet}. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize: W${canvasSize.width}H${canvasSize.height}, processedLevelRef.current: ${!!currentProcessedLevelVal}`);

    if (conditionsMet) {
      console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); 
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    } else {
      console.log("[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start/will be cancelled if running.");
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    }
    return () => {
      if (animationFrameIdRef.current) {
        console.log("[GameCanvas Effect 9] Cleanup: Cancelling animation frame.");
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [isClient, isLoading, canvasSize, processedLevel, gameLoop]); // Depends on processedLevel (state) and gameLoop (useCallback)
  
  // Render logic
  console.log(`[GameCanvas] Rendering. isClient: ${isClient}, isLoading: ${isLoading}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);
  if (!isClient) {
    console.log("[GameCanvas] Rendering null because not client-side yet (isClient is false).");
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

