
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
  flowersImage: HTMLImageElement | null; // For small bushes
  smallBushImage: HTMLImageElement | null; // Alias for flowersImage for clarity
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
  // const { toast } = useToast(); // Keep commented out unless actively used

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
      activePlatformId: null,
    };
    playerInstanceRef.current = newPlayer;
    // if (parentPlayerRef) parentPlayerRef.current = newPlayer; // Already handled by ref in page

    if (levelPath === '/levels/level2.json' || levelPath === '/levels/level3.json') {
        const p_ground_tile = processedTiles.find(t => t.id === 'p_ground');
        if (p_ground_tile) {
            const p3_size_w_val = P3_SIZE_W; 
            const p3_size_h_val = P3_SIZE_H; 
            const p_ground_top_y = p_ground_tile.y;
            
            let p3_y_final_top = p_ground_top_y - 300; 
            const p3_x_centered = (currentCanvasWidth / 2) - (p3_size_w_val / 2);

            p3BasePositionRef.current = { x: p3_x_centered, y: p3_y_final_top };
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
            };
            processedTiles.push(p3TileToAdd);
        }
    }
    return {
      playerStart: { xPx: playerStartX, yPx: playerStartY },
      tiles: processedTiles,
    };
  }, [levelPath, assets.playerImage, parseDimension, P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE]);

  const spawnSingleCoin = useCallback(
    (currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number, currentCanvasHeight: number): CoinState[] => {
        if (!currentProcessedLevel || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
            return [];
        }

        const p_ground = currentProcessedLevel.tiles.find(tile => tile.id === 'p_ground');
        if (!p_ground) {
             return [];
        }
        const p_groundTopY = p_ground.y;
        const gamePlatforms = currentProcessedLevel.tiles.filter(tile => tile.type === 1 && tile.id !== 'p_ground' && tile.id !== 'p_top_boundary' && tile.id !== 'p3');
        
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
            return [];
        }

        const coinX = Math.random() * (currentCanvasWidth - COIN_SIZE);
        const coinY = ySpawnZoneTopCoinTopEdge + Math.random() * (ySpawnZoneBottomCoinTopEdge - ySpawnZoneTopCoinTopEdge);
        const rotationSpeed = COIN_ROTATION_SPEED_MIN + Math.random() * (COIN_ROTATION_SPEED_MAX - COIN_ROTATION_SPEED_MIN);
        
        const uniqueId = `coin-${Date.now()}-${totalCoinsSpawnedThisLevelRef.current}`;
        
        return [{
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
        }];
    },
    [COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX]
  );

  const spawnSingleEnemy = useCallback((currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number): EnemyState | null => {
    if (!currentProcessedLevel || !currentProcessedLevel.tiles) {
        return null;
    }

    const p1 = currentProcessedLevel.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
    const p2 = currentProcessedLevel.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');

    if (!p1 || !p2) {
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


  // Effect 1: Set isClient, Load Assets
  useEffect(() => {
    setIsClient(true);
    const assetConfigs = [
      { key: 'playerImage', path: '/assets/images/hero_jeans3.png', hint: 'character orange blue' },
      { key: 'tileImage', path: '/assets/images/platform_grass.png', hint: 'platform grass dirt' },
      { key: 'iceTileImage', path: '/assets/images/platform_ice2.png', hint: 'ice platform texture' },
      { key: 'coinImage', path: '/assets/images/thankscoin.png', hint: 'collectible coin gold' },
      { key: 'stoneImage', path: '/assets/images/stone1.jpg', hint: 'stone rock texture' },
      { key: 'tree1Image', path: '/assets/images/tree1.png', hint: 'tree nature tall' }, 
      { key: 'tree2Image', path: '/assets/images/tree2.png', hint: 'tree nature smaller' },
      { key: 'flowersImage', path: '/assets/images/flowers.png', hint: 'flowers plant colorful' }, 
      { key: 'smallBushImage', path: '/assets/images/flowers.png', hint: 'bush small green' },
      { key: 'largeBushImage', path: '/assets/images/bush1.png', hint: 'bush large green' }, 
      { key: 'houseImage', path: '/assets/images/house1.png', hint: 'house building simple' }, 
    ] as const;

    assetConfigs.forEach(config => {
      const imageKey = config.key as keyof Pick<AssetContainer, `${string}Image`>;
      const loadedKey = `${imageKey}Loaded` as keyof AssetContainer;
      
      setAssets(currentAssets => {
        if (!currentAssets[imageKey] && !(currentAssets[loadedKey] as boolean) ) {
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
    window.addEventListener('resize', updateCanvasSizeState); 
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateCanvasSizeState);
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
    setActiveEnemies([]); 
    activeEnemiesRef.current = [];
    setTotalCoinsSpawnedThisLevel(0); 
    totalCoinsSpawnedThisLevelRef.current = 0;
    
    loadLevel(levelPath)
      .then(data => setRawLevelData(data))
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
      });
  }, [levelPath, isClient ]); 

  const allAssetsLoaded = Object.keys(assets).filter(k => k.endsWith('Loaded')).every(k => assets[k as keyof AssetContainer]);

  // Effect 5: Process raw level data when available and canvas is sized and assets are loaded
  useEffect(() => {
    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded) {
      if (processedLevelRef.current !== null) { 
        setProcessedLevel(null); 
        processedLevelRef.current = null;
        playerInstanceRef.current = null;
      }
      return;
    }
    
    const newProcessedLevelData = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
    if (newProcessedLevelData) {
      setProcessedLevel(newProcessedLevelData);
      processedLevelRef.current = newProcessedLevelData; 
    } else {
      setProcessedLevel(null);
      processedLevelRef.current = null;
      playerInstanceRef.current = null;
    }
  }, [isClient, rawLevelData, canvasSize, allAssetsLoaded, processRawLevelData ]); 

  // Effect 6: Update refs for states that gameLoop reads directly
  useEffect(() => { activeCoinsRef.current = activeCoins; }, [activeCoins]);
  useEffect(() => { activeEnemiesRef.current = activeEnemies; }, [activeEnemies]);
  useEffect(() => { totalCoinsSpawnedThisLevelRef.current = totalCoinsSpawnedThisLevel; }, [totalCoinsSpawnedThisLevel]);
  useEffect(() => { executeActionRef.current = executeAction; }, [executeAction]);
  useEffect(() => { processedLevelRef.current = processedLevel; }, [processedLevel]);


  // Effect 7: Spawn initial entities and set isLoading to false
  useEffect(() => {
    if (!isLoading) return;
    if (!isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) return; 

    let coinsAttempted = activeCoins.length > 0;
    if (!coinsAttempted && processedLevelRef.current.tiles.length > 0 && totalCoinsSpawnedThisLevelRef.current === 0) {
        const newCoins = spawnSingleCoin(processedLevelRef.current, canvasSize.width, canvasSize.height);
        setActiveCoins(newCoins); 
        setTotalCoinsSpawnedThisLevel(newCoins.length);
        coinsAttempted = true;
    } else if (processedLevelRef.current.tiles.length === 0) {
        coinsAttempted = true; 
    }
    
    let enemiesAttempted = activeEnemies.length > 0;
     if (!(levelPath === '/levels/level2.json' || levelPath === '/levels/level1.json' || levelPath === '/levels/level3.json')) { 
        if (!enemiesAttempted && processedLevelRef.current.tiles.length > 0) {
             const p1 = processedLevelRef.current.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
             const p2 = processedLevelRef.current.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');
             if (p1 && p2) {
                const newEnemy = spawnSingleEnemy(processedLevelRef.current, canvasSize.width);
                if (newEnemy) setActiveEnemies([newEnemy]);
             }
        }
        enemiesAttempted = true;
    } else {
        enemiesAttempted = true; 
    }
    
    if (coinsAttempted && enemiesAttempted) {
        setIsLoading(false);
    }
  }, [
    isLoading, isClient, canvasSize, levelPath, 
    spawnSingleCoin, spawnSingleEnemy, 
    setActiveCoins, setActiveEnemies, setIsLoading, setTotalCoinsSpawnedThisLevel,
    activeCoins.length, activeEnemies.length // Keep these to re-evaluate if entities disappear
  ]);

  // Effect 8: Handle subsequent coin spawning after collection
  useEffect(() => {
    if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) return;
    
    const currentActiveCoins = activeCoinsRef.current;
    if (currentActiveCoins.length === 1) { // Only one coin logic now
        const coin = currentActiveCoins[0];
        if (coin.isCollected && !coin.isVisuallyPresent && coin.particles.length === 0) {
            if (totalCoinsSpawnedThisLevelRef.current < TOTAL_COINS_ON_LEVEL) {
                const newCoin = spawnSingleCoin(processedLevelRef.current, canvasSize.width, canvasSize.height);
                setActiveCoins(newCoin);
                setTotalCoinsSpawnedThisLevel(prev => prev + newCoin.length);
            } else {
                setActiveCoins([]); 
            }
        }
    } else if (currentActiveCoins.length === 0 && totalCoinsSpawnedThisLevelRef.current < TOTAL_COINS_ON_LEVEL && processedLevelRef.current.tiles.length > 0) {
        const newCoin = spawnSingleCoin(processedLevelRef.current, canvasSize.width, canvasSize.height);
        setActiveCoins(newCoin); 
        setTotalCoinsSpawnedThisLevel(prev => prev + newCoin.length);
    }
  }, [
      activeCoins, isLoading, isClient, canvasSize, 
      spawnSingleCoin, TOTAL_COINS_ON_LEVEL, 
      setActiveCoins, setTotalCoinsSpawnedThisLevel,
  ]);
  
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

    if (!ctx || !canvas || !currentLevel || canvas.width === 0 || canvas.height === 0 ) {
      if (!currentLevel && !isLoading && isClient && canvas && ctx) {
           ctx.clearRect(0, 0, canvas.width, canvas.height);
           ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
           ctx.fillRect(0, 0, canvas.width, canvas.height);
           ctx.font = '16px Arial';
           ctx.fillStyle = 'white';
           ctx.textAlign = 'center';
           ctx.fillText('Failed to load level data. Please check server and file path.', canvas.width / 2, canvas.height / 2);
       }
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      return;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
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
    
    // P3 Platform (if exists)
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

    // Other moving platforms (P1, P2)
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
    
    // Coins (Layer 2)
    const currentActiveCoins = activeCoinsRef.current; // Read from ref
    if(currentActiveCoins.length > 0) { 
        renderCoins(ctx, currentActiveCoins, currentAssets.coinImage); 
    }

    // Enemies (Layer 2)
    const currentActiveEnemies = activeEnemiesRef.current; // Read from ref
    if (currentActiveEnemies.length > 0) {
        renderEnemies(ctx, currentActiveEnemies);
    }
    
    // Player (Layer 2)
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
             if (activePlatform && activePlatform.type === 1) {
                player.vx *= ICE_FRICTION;
                if (Math.abs(player.vx) < 0.1) {
                  player.vx = 0;
                }
             } else {
                player.vx = 0;
             }
           } else {
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
        } else if (prevIsOnGround && !player.isOnGround && player.activePlatformId) { // Just left a platform
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
            player.activePlatformId = null; // Clear it as we are no longer on it
        } else {
             player.activePlatformId = null; // General case if not on ground or no active platform
        }
        
        // Boundary checks
        if (player.x < 0) player.x = 0;
        else if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
        
        const p_ground_tile = currentLevel.tiles.find(t => t.id === 'p_ground');
        if (p_ground_tile && player.y + player.height > p_ground_tile.y && player.y < p_ground_tile.y + p_ground_tile.height ) { 
             if (player.y + player.height > p_ground_tile.y + (p_ground_tile.height * 0.25) ) { 
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

    // Update and render coins
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
    
    if(JSON.stringify(activeCoinsRef.current) !== JSON.stringify(updatedCoins)) { // Compare with ref's current value
      setActiveCoins(updatedCoins);
    }
    
    // Update and render enemies
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

    // Foreground decorative tiles (Layer 3)
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
      onGameStatsUpdate({ 
        collectedCoins: totalCoinsSpawnedThisLevelRef.current,
        totalCoinsOnLevel: TOTAL_COINS_ON_LEVEL 
      });
    }
    
    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, [ 
    levelPath, isClient, assets, resetExecuteAction, onGameStatsUpdate, 
    GRAVITY, JUMP_STRENGTH, PLAYER_SPEED, PLAYER_HEIGHT, PLAYER_WIDTH,
    COIN_FADE_IN_DURATION, COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX,
    PLATFORM_SPEED, ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, P3_MOVEMENT_DURATION, TOTAL_COINS_ON_LEVEL, ICE_FRICTION,
    setActiveCoins, setActiveEnemies, // Setters are stable
    p3BasePositionRef, p3InterestPointsRef, p3CurrentTargetIndexRef, p3MovementStateRef, // Refs
    checkCollision, renderPlayer, renderCoins, renderEnemies,
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
  }, [isClient, isLoading, canvasSize, processedLevel, gameLoop]); // Note: processedLevel (state) here to re-evaluate if loop needs to start/stop
  
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
