
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
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
  ENEMY_RADIUS,
  ENEMY_COLOR,
  ENEMY_SPEED_FACTOR,
  PLATFORM_SPEED,
  COIN_ROTATION_SPEED_MIN,
  COIN_ROTATION_SPEED_MAX,
  COIN_SHADOW_OFFSET_X,
  COIN_SHADOW_OFFSET_Y,
  COIN_SHADOW_BLUR,
  COIN_SHADOW_COLOR,
  P3_SIZE_W,
  P3_SIZE_H,
  P3_DRIFT_RANGE,
  P3_MOVEMENT_DURATION,
} from '@/config/gameConfig';

import { checkCollision } from '@/game/utils/collision';
import { renderPlayer } from '@/game/entities/playerRenderer';
import { renderCoins } from '@/game/entities/coinRenderer';
import { renderEnemies } from '@/game/entities/enemyRenderer';
import { loadLevel } from '@/lib/levelLoader';

interface GameCanvasProps {
  levelPath: string;
  playerRef?: React.MutableRefObject<PlayerState | null>;
  executeAction: GameAction | null;
  resetExecuteAction: () => void;
}

const parseDimension = (value: string | number, totalSize: number): number => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.endsWith('%')) {
      return (parseFloat(value) / 100) * totalSize;
    }
    if (value.endsWith('px')) {
      return parseFloat(value);
    }
    return parseFloat(value);
  }
  return 0;
};


export default function GameCanvas({
  levelPath,
  playerRef: parentPlayerRef,
  executeAction,
  resetExecuteAction,
}: GameCanvasProps) {
  console.log(`[GameCanvas] Component body. levelPath: ${levelPath}`);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const playerInstanceRef = useRef<PlayerState | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [rawLevelData, setRawLevelData] = useState<RawLevelData | null>(null);
  const [processedLevel, setProcessedLevel] = useState<ProcessedLevelData | null>(null);
  const processedLevelRef = useRef<ProcessedLevelData | null>(null);

  const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);

  const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const p3CurrentTargetIndexRef = useRef<number>(0);
  const p3MovementStateRef = useRef<{ startTime: number; startX: number; startY: number; targetX: number; targetY: number } | null>(null);
  const lastFrameTime = useRef<number>(Date.now());
  const animationFrameIdRef = useRef<number | null>(null);
  const executeActionRef = useRef<GameAction | null>(executeAction);

  const [assets, setAssets] = useState({
    playerImage: null as HTMLImageElement | null,
    tileImage: null as HTMLImageElement | null,
    coinImage: null as HTMLImageElement | null,
    stoneImage: null as HTMLImageElement | null,
    tree1Image: null as HTMLImageElement | null,
    tree2Image: null as HTMLImageElement | null,
    smallBushImage: null as HTMLImageElement | null, // For flowers.png
    largeBushImage: null as HTMLImageElement | null, // For bush1.png
    houseImage: null as HTMLImageElement | null,     // For house1.png
    playerImageLoaded: false,
    tileImageLoaded: false,
    coinImageLoaded: false,
    stoneImageLoaded: false,
    tree1ImageLoaded: false,
    tree2ImageLoaded: false,
    smallBushImageLoaded: false,
    largeBushImageLoaded: false,
    houseImageLoaded: false,
  });

  const allAssetsLoaded =
    assets.playerImageLoaded &&
    assets.tileImageLoaded &&
    assets.coinImageLoaded &&
    assets.stoneImageLoaded &&
    assets.tree1ImageLoaded &&
    assets.tree2ImageLoaded &&
    assets.smallBushImageLoaded &&
    assets.largeBushImageLoaded &&
    assets.houseImageLoaded;

  const processRawLevelData = useCallback((
    rawDataToProcess: RawLevelData,
    currentCanvasWidth: number,
    currentCanvasHeight: number
  ): ProcessedLevelData | null => {
    console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
    if (!rawDataToProcess || currentCanvasWidth === 0 || currentCanvasHeight === 0) {
      console.warn("[GameCanvas processRawLevelData] Missing rawData or canvas dimensions are zero.");
      return null;
    }

    const processedTiles: ProcessedTile[] = rawDataToProcess.tiles.map(rawTile => {
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

    const playerStartPlatform = processedTiles.find(tile => tile.id === rawDataToProcess.playerStart.platformId);
    if (!playerStartPlatform) {
      console.error(`[GameCanvas processRawLevelData] Player start platform with id "${rawDataToProcess.playerStart.platformId}" not found!`);
      return null;
    }

    let playerInitialX = playerStartPlatform.x + (rawDataToProcess.playerStart.xOffsetPx || 0);
    if (rawDataToProcess.playerStart.horizontalAlign === 'center') {
      playerInitialX = playerStartPlatform.x + (playerStartPlatform.width / 2) - (PLAYER_WIDTH / 2) + (rawDataToProcess.playerStart.xOffsetPx || 0);
    } else if (rawDataToProcess.playerStart.horizontalAlign === 'right') {
      playerInitialX = playerStartPlatform.x + playerStartPlatform.width - PLAYER_WIDTH - (rawDataToProcess.playerStart.xOffsetPx || 0);
    }
    const playerInitialY = playerStartPlatform.y - PLAYER_HEIGHT + (rawDataToProcess.playerStart.yOffsetPx || 0);

    const newPlayer: PlayerState = {
      x: playerInitialX,
      y: playerInitialY,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      vx: 0, vy: 0, isOnGround: true, isMovingLeft: false, isMovingRight: false,
      color: PLAYER_COLOR, image: assets.playerImage || undefined, facingDirection: 'right',
      activePlatformId: playerStartPlatform.id,
    };
    playerInstanceRef.current = newPlayer;
    if (parentPlayerRef) parentPlayerRef.current = newPlayer;
    
    const p_ground_tile = processedTiles.find(t => t.id === 'p_ground');
    if (levelPath === '/levels/level2.json' && p_ground_tile) {
        const p_ground_top_y = p_ground_tile.y;
        const p3_final_x = (currentCanvasWidth / 2) - (P3_SIZE_W / 2);
        const p3_final_y = p_ground_top_y - 300;

        p3BasePositionRef.current = { x: p3_final_x, y: p3_final_y };
        console.log(`[processRawLevelData] Level 2: p_ground_top_y: ${p_ground_top_y} p3BasePosRef.current:`, p3BasePositionRef.current);

        p3InterestPointsRef.current = [
            { x: 0, y: 0 },
            { x: P3_DRIFT_RANGE, y: P3_DRIFT_RANGE / 2 },
            { x: -P3_DRIFT_RANGE / 2, y: -P3_DRIFT_RANGE },
            { x: P3_DRIFT_RANGE / 3, y: -P3_DRIFT_RANGE / 3 },
        ];
        p3CurrentTargetIndexRef.current = 0;
        p3MovementStateRef.current = null;

        const p3Tile: ProcessedTile = {
            id: 'p3',
            x: p3BasePositionRef.current.x,
            y: p3BasePositionRef.current.y,
            width: P3_SIZE_W,
            height: P3_SIZE_H,
            type: 1, color: 'purple', vx: 0, direction: 0,
            positioning: { anchor: 'top-left' }
        };
        console.log(`[processRawLevelData] Level 2: Added p3Tile:`, p3Tile);
        processedTiles.push(p3Tile);
    } else if (levelPath === '/levels/level2.json' && !p_ground_tile) {
        console.warn("[processRawLevelData] p_ground tile not found for Level 2, P3 positioning might be incorrect.");
    }


    console.log(`[processRawLevelData] Successfully processed. Player:`, newPlayer, `Number of tiles: ${processedTiles.length}`);
    return { playerStart: { xPx: playerInitialX, yPx: playerInitialY }, tiles: processedTiles };
  }, [assets.playerImage, levelPath, parentPlayerRef, P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE]);

  const spawnNewCoinPair = useCallback(
    (currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number, currentCanvasHeight: number): CoinState[] => {
      console.log(`[spawnNewCoinPair] Called. Canvas W:${currentCanvasWidth}, H:${currentCanvasHeight}. ProcessedLevel exists: ${!!currentProcessedLevel}`);
      if (!currentProcessedLevel || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
        console.warn("[spawnNewCoinPair] Pre-conditions not met. No coins spawned.");
        return [];
      }
  
      const p_ground = currentProcessedLevel.tiles.find(tile => tile.id === 'p_ground');
      if (!p_ground) {
        console.warn("[spawnNewCoinPair] p_ground tile not found. Cannot determine spawn zone. No coins spawned.");
        return [];
      }
      const p_groundTopY = p_ground.y;
  
      const gamePlatforms = currentProcessedLevel.tiles.filter(tile => tile.type === 1 && tile.id !== 'p_ground');
      let actualHighestPlatformTopY = p_groundTopY;
      if (gamePlatforms.length > 0) {
        actualHighestPlatformTopY = Math.min(...gamePlatforms.map(p => p.y));
      }
      console.log(`[spawnNewCoinPair] p_ground found. TopY: ${p_groundTopY}`);
      console.log(`[spawnNewCoinPair] Actual highest platform TopY: ${actualHighestPlatformTopY}`);
  
      const ySpawnZoneBottomCoinTopEdge = p_groundTopY - COIN_VERTICAL_SPAWN_BOTTOM_OFFSET - COIN_SIZE;
      const ySpawnZoneTopCoinTopEdge = actualHighestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;
  
      console.log(`[spawnNewCoinPair] ySpawnZoneBottomCoinTopEdge: ${ySpawnZoneBottomCoinTopEdge}, ySpawnZoneTopCoinTopEdge: ${ySpawnZoneTopCoinTopEdge}`);
  
      if (ySpawnZoneTopCoinTopEdge >= ySpawnZoneBottomCoinTopEdge) {
        console.warn(`[spawnNewCoinPair] Invalid spawn zone: Top edge (${ySpawnZoneTopCoinTopEdge}) is not below Bottom edge (${ySpawnZoneBottomCoinTopEdge}). No coins spawned.`);
        return [];
      }
  
      const newCoins: CoinState[] = [];
      const numberOfCoinsToSpawn = 10; // Spawn 10 coins
      console.log(`[spawnNewCoinPair] Attempting to spawn ${numberOfCoinsToSpawn} coins.`);
  
      for (let i = 0; i < numberOfCoinsToSpawn; i++) {
        const randomX = Math.random() * (currentCanvasWidth - COIN_SIZE);
        const randomY = Math.random() * (ySpawnZoneBottomCoinTopEdge - ySpawnZoneTopCoinTopEdge) + ySpawnZoneTopCoinTopEdge;
        
        newCoins.push({
          id: `coin-${Date.now()}-${i}`,
          x: randomX, y: randomY, width: COIN_SIZE, height: COIN_SIZE,
          isCollected: false, targetSpawnTime: Date.now() + (i * COIN_SPAWN_STAGGER_DELAY),
          currentOpacity: 0, particles: [], isVisuallyPresent: true,
          rotationAngle: Math.random() * Math.PI * 2,
          rotationSpeed: Math.random() * (COIN_ROTATION_SPEED_MAX - COIN_ROTATION_SPEED_MIN) + COIN_ROTATION_SPEED_MIN,
        });
      }
      console.log(`[spawnNewCoinPair] Created ${newCoins.length} coins. Coins:`, newCoins);
      return newCoins;
    }, []
  );

  const spawnSingleEnemy = useCallback((currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number): EnemyState | null => {
    if (!currentProcessedLevel) return null;

    const p1 = currentProcessedLevel.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
    const p2 = currentProcessedLevel.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');

    if (!p1 || !p2) {
      console.warn("[spawnSingleEnemy] P1 or P2 not found. Cannot spawn enemy.");
      return null;
    }

    const p1CenterY = p1.y + p1.height / 2;
    const p2CenterY = p2.y + p2.height / 2;
    const enemyY = (p1CenterY + p2CenterY) / 2 - ENEMY_RADIUS;

    return {
      id: `enemy-${Date.now()}`,
      x: ENEMY_RADIUS, y: enemyY, radius: ENEMY_RADIUS,
      width: ENEMY_RADIUS * 2, height: ENEMY_RADIUS * 2,
      vx: PLATFORM_SPEED * ENEMY_SPEED_FACTOR, direction: 1, color: ENEMY_COLOR,
    };
  }, []);


  // Effect 1: Set isClient and load assets
  useEffect(() => {
    console.log(`[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state: ${isClient}`);
    if (!isClient) setIsClient(true);

    const pImg = new Image(); pImg.src = '/assets/images/hero_jeans3.png'; pImg.setAttribute('data-ai-hint', 'character orange blue');
    pImg.onload = () => setAssets(prev => ({ ...prev, playerImage: pImg, playerImageLoaded: true }));
    pImg.onerror = () => { console.error("Failed to load player image."); setAssets(prev => ({ ...prev, playerImageLoaded: true })); };

    const tImg = new Image(); tImg.src = '/assets/images/platform_grass.png'; tImg.setAttribute('data-ai-hint', 'platform grass dirt');
    tImg.onload = () => setAssets(prev => ({ ...prev, tileImage: tImg, tileImageLoaded: true }));
    tImg.onerror = () => { console.error("Failed to load tile image."); setAssets(prev => ({ ...prev, tileImageLoaded: true })); };

    const cImg = new Image(); cImg.src = '/assets/images/thankscoin.png'; cImg.setAttribute('data-ai-hint', 'collectible coin gold');
    cImg.onload = () => setAssets(prev => ({ ...prev, coinImage: cImg, coinImageLoaded: true }));
    cImg.onerror = () => { console.error("Failed to load coin image."); setAssets(prev => ({ ...prev, coinImageLoaded: true })); };
    
    const stoneImg = new Image(); stoneImg.src = '/assets/images/stone1.jpg'; stoneImg.setAttribute('data-ai-hint', 'stone rock');
    stoneImg.onload = () => setAssets(prev => ({ ...prev, stoneImage: stoneImg, stoneImageLoaded: true }));
    stoneImg.onerror = () => { console.error("Failed to load stone image."); setAssets(prev => ({ ...prev, stoneImageLoaded: true })); };

    const tree1Img = new Image(); tree1Img.src = '/assets/images/tree1.png'; tree1Img.setAttribute('data-ai-hint', 'tree nature');
    tree1Img.onload = () => setAssets(prev => ({ ...prev, tree1Image: tree1Img, tree1ImageLoaded: true }));
    tree1Img.onerror = () => { console.error("Failed to load tree1 image."); setAssets(prev => ({ ...prev, tree1ImageLoaded: true })); };
    
    const tree2Img = new Image(); tree2Img.src = '/assets/images/tree2.png'; tree2Img.setAttribute('data-ai-hint', 'tree nature');
    tree2Img.onload = () => setAssets(prev => ({ ...prev, tree2Image: tree2Img, tree2ImageLoaded: true }));
    tree2Img.onerror = () => { console.error("Failed to load tree2 image."); setAssets(prev => ({ ...prev, tree2ImageLoaded: true })); };

    const smallBushImg = new Image(); smallBushImg.src = '/assets/images/flowers.png'; smallBushImg.setAttribute('data-ai-hint', 'flowers small');
    smallBushImg.onload = () => setAssets(prev => ({ ...prev, smallBushImage: smallBushImg, smallBushImageLoaded: true }));
    smallBushImg.onerror = () => { console.error("Failed to load smallBush image."); setAssets(prev => ({ ...prev, smallBushImageLoaded: true })); };

    const largeBushImg = new Image(); largeBushImg.src = '/assets/images/bush1.png'; largeBushImg.setAttribute('data-ai-hint', 'bush large');
    largeBushImg.onload = () => setAssets(prev => ({ ...prev, largeBushImage: largeBushImg, largeBushImageLoaded: true }));
    largeBushImg.onerror = () => { console.error("Failed to load largeBush image."); setAssets(prev => ({ ...prev, largeBushImageLoaded: true })); };
    
    const houseImg = new Image(); houseImg.src = '/assets/images/house1.png'; houseImg.setAttribute('data-ai-hint', 'house building');
    houseImg.onload = () => setAssets(prev => ({ ...prev, houseImage: houseImg, houseImageLoaded: true }));
    houseImg.onerror = () => { console.error("Failed to load house image."); setAssets(prev => ({ ...prev, houseImageLoaded: true })); };

  }, [isClient]);

  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    console.log(`[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize: {width: ${canvasSize.width}, height: ${canvasSize.height}}`);
    if (canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      console.log(`[GameCanvas Effect 2] Canvas attributes set to W:${canvasSize.width}, H:${canvasSize.height}`);
      if (!ctxRef.current) {
        ctxRef.current = canvasRef.current.getContext('2d');
        if (ctxRef.current) console.log("[GameCanvas Effect 2] Canvas context obtained.");
        else console.error("[GameCanvas Effect 2] Failed to get 2D context.");
      }
    }
  }, [canvasSize]);

  // Effect 3: Observe parent element size and update canvasSize state
  useEffect(() => {
    console.log(`[GameCanvas Effect 3] Running: Observe parent size. isClient: ${isClient}`);
    if (!isClient || !canvasRef.current?.parentElement) {
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
          if ((newWidth > 0 && newHeight > 0) || (newWidth === 0 && newHeight === 0 && (currentSize.width !== 0 || currentSize.height !== 0) )) {
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
    
    const handleWindowResize = () => { updateCanvasSizeState(); };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [isClient]);

  // Effect 4: Load raw level data
  useEffect(() => {
    console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      console.log("[GameCanvas Effect 4] Not client or no levelPath, returning.");
      return;
    }
    setRawLevelData(null); 
    setProcessedLevel(null);
    setActiveCoins([]);
    setActiveEnemies([]);
    if (!isLoading) setIsLoading(true);

    loadLevel(levelPath).then(data => {
      if (data) {
        console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
        setRawLevelData(data);
      } else {
        console.error(`[GameCanvas Effect 4] Failed to load rawLevelData for ${levelPath}.`);
        setRawLevelData(null);
      }
    }).catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
    });
  }, [levelPath, isClient, setIsLoading]);

  // Effect 5: Process raw level data
  useEffect(() => {
    console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${allAssetsLoaded}`);
    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded) {
      if (processedLevel !== null) {
        setProcessedLevel(null);
        playerInstanceRef.current = null; 
        if (parentPlayerRef) parentPlayerRef.current = null;
      }
      return;
    }
    
    const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
    if (newProcessedLevel) {
      console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel and newPlayer.");
      setProcessedLevel(newProcessedLevel);
      // playerInstanceRef is set inside processRawLevelData
    } else {
      console.error("[GameCanvas Effect 5] processRawLevelData returned null. Level processing failed.");
      setProcessedLevel(null);
      playerInstanceRef.current = null; 
      if (parentPlayerRef) parentPlayerRef.current = null;
    }
  }, [isClient, rawLevelData, canvasSize, allAssetsLoaded, processRawLevelData, parentPlayerRef]);


  // Effect 7: Spawn entities and finish loading
   useEffect(() => {
    console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevel}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoins.length}`);
    
    if (!isLoading) {
        console.log("[GameCanvas Effect 7] isLoading is false, skipping spawn logic (already loaded or loading finished).");
        return;
    }

    if (!isClient || !processedLevel || canvasSize.width === 0 || canvasSize.height === 0) {
        console.log(`[GameCanvas Effect 7] Pre-conditions (isClient, processedLevel, canvasSize) not met for entity spawn, returning. isClient: ${isClient}, procLvl: ${!!processedLevel}, cW: ${canvasSize.width}`);
        if (processedLevel === null && isLoading) { // If level processing failed, still exit loading state
            console.warn("[GameCanvas Effect 7] processedLevel is null. Setting isLoading to false. Game may not display level elements.");
            setActiveCoins([]);
            setActiveEnemies([]);
            setIsLoading(false);
        }
        return;
    }
    
    let coinsAttempted = false;
    if (activeCoins.length === 0 && processedLevel.tiles.length > 0) {
        console.log(`[GameCanvas Effect 7] Spawning new coin pair for level ${levelPath}`);
        const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
        console.log(`[GameCanvas Effect 7] spawnNewCoinPair returned ${newCoins.length} coins. Setting activeCoins.`);
        setActiveCoins(newCoins);
        coinsAttempted = true;
    } else if (activeCoins.length > 0 || processedLevel.tiles.length === 0) {
        coinsAttempted = true; 
    }

    let enemiesAttempted = false;
    if (levelPath !== '/levels/level2.json' && levelPath !== '/levels/level1.json') {
        if (activeEnemies.length === 0 && processedLevel.tiles.length > 0) {
            const newEnemy = spawnSingleEnemy(processedLevel, canvasSize.width);
            if (newEnemy) setActiveEnemies([newEnemy]);
        }
        enemiesAttempted = true; 
    } else {
        console.log(`[GameCanvas Effect 7] Enemies not spawned for level: ${levelPath}`);
        enemiesAttempted = true; 
    }
    
    if (coinsAttempted && enemiesAttempted) {
        console.log("[GameCanvas Effect 7] All entities attempted or not needed, setting isLoading to false.");
        setIsLoading(false);
    } else {
        console.log(`[GameCanvas Effect 7] Not all entities attempted. coinsAttempted: ${coinsAttempted}, enemiesAttempted: ${enemiesAttempted}`);
    }
  }, [isClient, isLoading, processedLevel, canvasSize, levelPath, activeCoins.length, activeEnemies.length, spawnNewCoinPair, spawnSingleEnemy, setActiveCoins, setActiveEnemies, setIsLoading]);


  // Effect 8: Check coin respawn
  useEffect(() => {
    console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, processedLevelRef: ${!!processedLevelRef.current}`);
    if (isLoading || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) return;

    const allCollectedAndParticlesGone = activeCoins.length > 0 && activeCoins.every(c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent);
    if (allCollectedAndParticlesGone) {
        console.log("[GameCanvas Effect 8] All coins collected and particles gone, spawning new pair.");
        setActiveCoins(spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height));
    }
  }, [activeCoins, isLoading, canvasSize, spawnNewCoinPair, setActiveCoins]);

  // Effect for updating processedLevelRef
  useEffect(() => {
    processedLevelRef.current = processedLevel;
  }, [processedLevel]);

  useEffect(() => {
    executeActionRef.current = executeAction;
  }, [executeAction]);

  const gameLoop = useCallback(() => {
    // console.log("[gameLoop] CALLED");
    animationFrameIdRef.current = null;

    const currentCanvas = canvasRef.current;
    const ctx = ctxRef.current;
    const currentLevel = processedLevelRef.current;
    let player = playerInstanceRef.current;

    if (!ctx || !currentCanvas || !currentLevel) { // Player can be null if level processing failed
      if (isLoading) { // If still loading, request next frame to wait
        animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      } else if (!currentLevel) { // If loading finished but no level, draw error message
        if (ctx && currentCanvas) {
            ctx.clearRect(0, 0, currentCanvas.width, currentCanvas.height);
            ctx.fillStyle = 'black';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Failed to load level data. Please check server and file path.', currentCanvas.width / 2, currentCanvas.height / 2);
        }
        animationFrameIdRef.current = requestAnimationFrame(gameLoop); // Keep trying to draw error or eventually level
      }
      return;
    }
    
    // If player is null but level exists (should not happen if processRawLevelData is correct)
    if (!player && currentLevel && !isLoading) {
        console.error("[gameLoop] Player is null but level exists and not loading. This indicates an issue in player initialization.");
        // Potentially try to re-initialize player or show error
        ctx.clearRect(0, 0, currentCanvas.width, currentCanvas.height);
        ctx.fillStyle = 'red';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Error: Player not initialized!', currentCanvas.width / 2, currentCanvas.height / 2);
        animationFrameIdRef.current = requestAnimationFrame(gameLoop);
        return;
    }
    
    if (!player) { // Final fallback if player is still null
        animationFrameIdRef.current = requestAnimationFrame(gameLoop);
        return;
    }

    const loopStartTime = Date.now();
    let deltaTime = loopStartTime - lastFrameTime.current;
    const MAX_DELTA_TIME_MS = 100; 
    if (deltaTime > MAX_DELTA_TIME_MS) deltaTime = MAX_DELTA_TIME_MS;
    const deltaTimeFactor = Math.max(0.05, Math.min(2, deltaTime / (1000 / 60))); 
    lastFrameTime.current = loopStartTime;

    ctx.clearRect(0, 0, currentCanvas.width, currentCanvas.height);

    // Update Player
    const currentExecuteAction = executeActionRef.current;
    if (currentExecuteAction) {
        switch (currentExecuteAction) {
            case 'moveLeft': player.isMovingLeft = true; player.facingDirection = 'left'; break;
            case 'moveRight': player.isMovingRight = true; player.facingDirection = 'right'; break;
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

    player.vx = 0;
    if (player.isMovingLeft) player.vx = -PLAYER_SPEED;
    if (player.isMovingRight) player.vx = PLAYER_SPEED;
    player.vy += GRAVITY * deltaTimeFactor;
    
    let nextPlayerX = player.x + player.vx * deltaTimeFactor;
    let nextPlayerY = player.y + player.vy * deltaTimeFactor;
    
    const prevIsOnGround = player.isOnGround;
    player.isOnGround = false; 
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
            if (playerCenter_X < tileCenter_X) { // Player is to the left of tile's center
                nextPlayerX = tile.x - player.width;
            } else { // Player is to the right of tile's center
                nextPlayerX = tile.x + tile.width;
            }
            player.vx = 0; 
            hadHorizontalCollisionWithThisTile = true;
        }

        const playerVerticalRect: Rect = { x: player.x, y: nextPlayerY, width: player.width, height: player.height };
        if (checkCollision(playerVerticalRect, tileRect)) {
            if (player.vy > 0) { 
                 if (hadHorizontalCollisionWithThisTile && tile.id !== player.activePlatformId) {
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
    
    if (activePlatformThisFrame && activePlatformThisFrame.vx && activePlatformThisFrame.direction) {
        platformInducedMoveX = activePlatformThisFrame.vx * activePlatformThisFrame.direction * deltaTimeFactor;
        player.x += platformInducedMoveX;
    }
    
    // P3 Movement
    const p3Tile = currentLevel.tiles.find(t => t.id === 'p3');
    if (p3Tile && p3BasePositionRef.current && p3MovementStateRef.current) {
        const elapsed = loopStartTime - p3MovementStateRef.current.startTime;
        const progress = Math.min(elapsed / P3_MOVEMENT_DURATION, 1);
        
        const newP3X = p3MovementStateRef.current.startX + (p3MovementStateRef.current.targetX - p3MovementStateRef.current.startX) * progress;
        const newP3Y = p3MovementStateRef.current.startY + (p3MovementStateRef.current.targetY - p3MovementStateRef.current.startY) * progress;

        const p3_delta_x = newP3X - p3Tile.x;
        const p3_delta_y = newP3Y - p3Tile.y;

        p3Tile.x = newP3X;
        p3Tile.y = newP3Y;

        if (player.activePlatformId === 'p3') {
            player.x += p3_delta_x;
            player.y += p3_delta_y;
        }

        if (progress >= 1) p3MovementStateRef.current = null; // Trigger new target selection
    } else if (p3Tile && p3BasePositionRef.current && !p3MovementStateRef.current) {
        p3CurrentTargetIndexRef.current = (p3CurrentTargetIndexRef.current + 1 + Math.floor(Math.random() * (p3InterestPointsRef.current.length -1))) % p3InterestPointsRef.current.length;
        const targetDrift = p3InterestPointsRef.current[p3CurrentTargetIndexRef.current];
        p3MovementStateRef.current = {
            startTime: loopStartTime,
            startX: p3Tile.x,
            startY: p3Tile.y,
            targetX: p3BasePositionRef.current.x + targetDrift.x,
            targetY: p3BasePositionRef.current.y + targetDrift.y,
        };
    }


    if (player.y + player.height > currentCanvas.height) {
      player.y = currentCanvas.height - player.height;
      player.isOnGround = true; player.vy = 0;
      const groundTile = currentLevel.tiles.find(t => t.id === 'p_ground');
      player.activePlatformId = groundTile ? groundTile.id : null;
    }
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > currentCanvas.width) player.x = currentCanvas.width - player.width;

    if (parentPlayerRef) parentPlayerRef.current = { ...player };

    // Update Coins
    const updatedCoins = activeCoins.map(coin => {
      let newOpacity = coin.currentOpacity;
      let newParticles = [...coin.particles];
      let isVisuallyPresent = coin.isVisuallyPresent;

      if (!coin.isCollected && loopStartTime >= coin.targetSpawnTime && coin.currentOpacity < 1) {
        newOpacity = Math.min(1, coin.currentOpacity + (deltaTime / COIN_FADE_IN_DURATION));
      } else if (coin.isCollected && coin.particles.length === 0) { // Generate particles only once
        for (let i = 0; i < COIN_PARTICLE_COUNT; i++) {
          newParticles.push({
            x: coin.x + coin.width / 2, y: coin.y + coin.height / 2,
            vx: (Math.random() - 0.5) * PLAYER_SPEED * COIN_PARTICLE_SPEED_MULTIPLIER,
            vy: (Math.random() - 0.5) * PLAYER_SPEED * COIN_PARTICLE_SPEED_MULTIPLIER - 2,
            size: COIN_PARTICLE_SIZE, opacity: 1, life: COIN_PARTICLE_LIFESPAN,
          });
        }
        isVisuallyPresent = false; // Original coin becomes visually absent
      }
      
      newParticles = newParticles.map(p => {
        p.x += p.vx * deltaTimeFactor;
        p.y += p.vy * deltaTimeFactor;
        p.vy += GRAVITY * COIN_PARTICLE_GRAVITY_FACTOR * deltaTimeFactor;
        p.life -= deltaTime;
        p.opacity = Math.max(0, p.life / COIN_PARTICLE_LIFESPAN);
        return p;
      }).filter(p => p.opacity > 0);

      const newRotationAngle = (coin.rotationAngle + coin.rotationSpeed * deltaTimeFactor) % (Math.PI * 2);

      return { ...coin, currentOpacity: newOpacity, particles: newParticles, isVisuallyPresent, rotationAngle: newRotationAngle };
    });
    setActiveCoins(updatedCoins);

    // Coin Collection
    if (player) {
      setActiveCoins(prevCoins =>
        prevCoins.map(coin => {
          if (!coin.isCollected && coin.isVisuallyPresent && coin.currentOpacity > 0.5 && 
              checkCollision(player!, { x: coin.x, y: coin.y, width: coin.width, height: coin.height })) {
            return { ...coin, isCollected: true };
          }
          return coin;
        })
      );
    }

    // Update Enemies
    const updatedEnemies = activeEnemies.map(enemy => {
      let newEnemyX = enemy.x + (enemy.vx * enemy.direction * deltaTimeFactor);
      if (newEnemyX + enemy.width > currentCanvas.width || newEnemyX < 0) {
        enemy.direction *= -1;
        newEnemyX = enemy.x + (enemy.vx * enemy.direction * deltaTimeFactor); 
      }
      return { ...enemy, x: newEnemyX };
    });
    setActiveEnemies(updatedEnemies);

    // Enemy Collision
    if (player) {
      activeEnemies.forEach(enemy => {
        if (checkCollision(player!, enemy)) {
          const ground = currentLevel.tiles.find(t => t.id === 'p_ground');
          if (ground) {
            player.x = currentCanvas.width / 2 - player.width / 2;
            player.y = ground.y - player.height;
            player.vx = 0; player.vy = 0; player.isOnGround = true;
          } else { // Fallback if p_ground not found
            player.x = currentCanvas.width / 2 - player.width / 2;
            player.y = currentCanvas.height - player.height; // bottom of canvas
            player.vx = 0; player.vy = 0; player.isOnGround = true;
          }
        }
      });
    }
    
    // Render logic
    // Background tiles (and platforms)
    currentLevel.tiles.forEach(tile => {
      if (tile.layer !== 'foreground') { 
        if (tile.type === 1) { 
          if (tile.id?.startsWith('stone_') && assets.stoneImage) {
            ctx.drawImage(assets.stoneImage, tile.x, tile.y, tile.width, tile.height);
          } else if (assets.tileImage) {
            ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
          } else {
            ctx.fillStyle = tile.color;
            ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
          }
        } else { 
          let imgToDraw: HTMLImageElement | null = null;
          if (tile.id === 'tree1' && assets.tree1Image) imgToDraw = assets.tree1Image;
          else if (tile.id === 'tree2' && assets.tree2Image) imgToDraw = assets.tree2Image;
          else if (tile.id === 'house1' && assets.houseImage) imgToDraw = assets.houseImage;
          
          if (imgToDraw) ctx.drawImage(imgToDraw, tile.x, tile.y, tile.width, tile.height);
          else { ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height); }
        }
      }
    });

    renderCoins(ctx, activeCoins, assets.coinImage);
    renderEnemies(ctx, activeEnemies);
    if (player) renderPlayer(ctx, player, assets.playerImage);

    // Foreground tiles
    currentLevel.tiles.forEach(tile => {
      if (tile.layer === 'foreground') {
        let imgToDraw: HTMLImageElement | null = null;
        if ((tile.id === 'bush_left_1' || tile.id === 'bush_right_1') && assets.smallBushImage) imgToDraw = assets.smallBushImage;
        else if ((tile.id === 'bush_left_2' || tile.id === 'bush_right_2') && assets.largeBushImage) imgToDraw = assets.largeBushImage;
        
        if (imgToDraw) ctx.drawImage(imgToDraw, tile.x, tile.y, tile.width, tile.height);
        else { ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height); }
      }
    });
    
    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, [
      isClient, /*isLoading,*/ assets, resetExecuteAction, setActiveCoins, setActiveEnemies, 
      parentPlayerRef, levelPath, spawnNewCoinPair, spawnSingleEnemy,
      p3BasePositionRef, p3InterestPointsRef, p3CurrentTargetIndexRef, p3MovementStateRef,
      processRawLevelData // Added as it's used in an effect that could re-trigger this chain.
  ]);

  // Effect 9: Start/Stop Game Loop
  useEffect(() => {
    console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize: W${canvasSize.width}H${canvasSize.height}, processedLevel: ${!!processedLevel}`);
    
    const conditionsMet = isClient && !isLoading && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevel;
    
    if (conditionsMet) {
      console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); 
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    } else {
      console.log(`[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start. isClient:${isClient}, !isLoading:${!isLoading}, canvasRef:${!!canvasRef.current}, canvasW:${canvasSize.width}, canvasH:${canvasSize.height}, procLevel:${!!processedLevel}`);
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
  

  console.log(`[GameCanvas] Rendering. isClient: ${isClient}, isLoading: ${isLoading}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);
  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: canvasSize.width > 0 ? `${canvasSize.width}px` : '100%', 
        height: canvasSize.height > 0 ? `${canvasSize.height}px` : '100%',
        // border: '1px solid deeppink', 
        // backgroundColor: 'rgba(200, 200, 255, 0.1)',
      }}
      aria-label="Game Canvas"
    />
  );
}
