
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
import {
  GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
  COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
  COIN_FADE_IN_DURATION, COIN_SPAWN_STAGGER_DELAY, NUMBER_OF_COIN_PAIRS,
  COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER,
  COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE,
  ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, PLATFORM_SPEED,
  COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX,
  COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR,
  P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION,
} from '@/config/gameConfig';

// import { useToast } from "@/hooks/use-toast";
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
  console.warn(`[parseDimension] Unexpected value type: ${typeof value}, value: ${value}`);
  return 0;
};


export default function GameCanvas({
  levelPath,
  playerRef: parentPlayerRef,
  executeAction,
  resetExecuteAction,
}: GameCanvasProps) {
  // console.log(`[GameCanvas] Component body. levelPath: ${levelPath}`);
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
  const activeCoinsRef = useRef<CoinState[]>(activeCoins);
  
  const [currentPairIndex, setCurrentPairIndex] = useState(0);
  const currentPairIndexRef = useRef(currentPairIndex);

  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);
  const activeEnemiesRef = useRef<EnemyState[]>(activeEnemies);

  const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const p3CurrentTargetIndexRef = useRef<number>(0);
  const p3MovementStateRef = useRef<{ startTime: number; startX: number; startY: number; targetX: number; targetY: number; } | null>(null);
  
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
    smallBushImage: null as HTMLImageElement | null, 
    largeBushImage: null as HTMLImageElement | null, 
    houseImage: null as HTMLImageElement | null, 
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

  // Helper functions wrapped in useCallback
  const processRawLevelData = useCallback((
    rawDataToProcess: RawLevelData,
    currentCanvasWidth: number,
    currentCanvasHeight: number
  ): ProcessedLevelData | null => {
    // console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
    if (!rawDataToProcess || currentCanvasWidth === 0 || currentCanvasHeight === 0) {
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
        default: 
          console.warn(`[processRawLevelData] Unknown anchor: ${rawTile.positioning.anchor} for tile id: ${rawTile.id}. Defaulting to top-left with offset.`);
          tileX = xOffset; tileY = yOffset;
      }
      return { ...rawTile, x: tileX, y: tileY, width: tileWidth, height: tileHeight, vx: rawTile.vx || 0, direction: rawTile.direction || 0 };
    });

    const playerStartPlatform = processedTiles.find(tile => tile.id === rawDataToProcess.playerStart.platformId);
    if (!playerStartPlatform) {
      console.error(`[GameCanvas processRawLevelData] Player start platform with id "${rawDataToProcess.playerStart.platformId}" not found! Cannot initialize player.`);
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
      vx: 0, vy: 0, isOnGround: false, isMovingLeft: false, isMovingRight: false,
      color: PLAYER_COLOR, image: assets.playerImage || undefined, facingDirection: 'right',
      activePlatformId: playerStartPlatform.id,
    };
    playerInstanceRef.current = newPlayer; 
    
    const p_ground_tile = processedTiles.find(t => t.id === 'p_ground');
    if (levelPath === '/levels/level2.json' && p_ground_tile) {
        const p_ground_top_y = p_ground_tile.y;
        const p3_final_x = (currentCanvasWidth / 2) - (P3_SIZE_W / 2);
        const p3_final_y = p_ground_top_y - 300; 
        
        p3BasePositionRef.current = { x: p3_final_x, y: p3_final_y };
        p3InterestPointsRef.current = [
            { x: 0, y: 0 },
            { x: P3_DRIFT_RANGE, y: P3_DRIFT_RANGE / 2 },
            { x: -P3_DRIFT_RANGE / 2, y: -P3_DRIFT_RANGE },
            { x: P3_DRIFT_RANGE / 3, y: -P3_DRIFT_RANGE / 3 },
        ];
        p3CurrentTargetIndexRef.current = 0;
        p3MovementStateRef.current = null;

        const p3TileIndex = processedTiles.findIndex(t => t.id === 'p3');
        if (p3TileIndex !== -1) {
            processedTiles[p3TileIndex].x = p3BasePositionRef.current.x + p3InterestPointsRef.current[0].x;
            processedTiles[p3TileIndex].y = p3BasePositionRef.current.y + p3InterestPointsRef.current[0].y;
            processedTiles[p3TileIndex].width = P3_SIZE_W;
            processedTiles[p3TileIndex].height = P3_SIZE_H;
        } else {
            const p3Tile: ProcessedTile = {
                id: 'p3',
                x: p3BasePositionRef.current.x + p3InterestPointsRef.current[0].x,
                y: p3BasePositionRef.current.y + p3InterestPointsRef.current[0].y,
                width: P3_SIZE_W,
                height: P3_SIZE_H,
                type: 1, color: 'purple', vx: 0, direction: 0,
                positioning: { anchor: 'top-left' } 
            };
            processedTiles.push(p3Tile);
        }
    } else if (levelPath === '/levels/level2.json' && !p_ground_tile) {
        console.warn("[GameCanvas processRawLevelData] Level 2: p_ground tile not found, P3 positioning might be incorrect.");
    }
    // console.log(`[processRawLevelData] Successfully processed. Player:`, JSON.parse(JSON.stringify(newPlayer)), `Number of tiles: ${processedTiles.length}`);
    return { playerStart: { xPx: playerInitialX, yPx: playerInitialY }, tiles: processedTiles };
  }, [assets.playerImage, levelPath, P3_DRIFT_RANGE, P3_SIZE_W, P3_SIZE_H]); // Dependencies for processRawLevelData

  const spawnNewCoinPair = useCallback(
    (currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number, currentCanvasHeight: number): CoinState[] => {
      console.log(`[spawnNewCoinPair] DIAGNOSTIC SPAWN Called. Canvas W:${currentCanvasWidth}, H:${currentCanvasHeight}. ProcessedLevel exists: ${!!currentProcessedLevel}`);
      if (!currentProcessedLevel || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
        console.warn("[spawnNewCoinPair] DIAGNOSTIC SPAWN: Pre-conditions not met (no level or zero canvas size). No coins spawned.");
        return [];
      }
      
      const newCoins: CoinState[] = [];
      const yPos = currentCanvasHeight / 2 - COIN_SIZE / 2;

      // Coin 1 (left)
      newCoins.push({
        id: `diag-coin-${Date.now()}-${currentPairIndexRef.current}-0`,
        x: 50, 
        y: yPos, 
        width: COIN_SIZE, height: COIN_SIZE,
        isCollected: false,
        targetSpawnTime: Date.now(), 
        currentOpacity: 1, 
        particles: [], 
        isVisuallyPresent: true,
        rotationAngle: Math.random() * Math.PI * 2, 
        rotationSpeed: 0, // No rotation for diagnostic
      });

      // Coin 2 (right)
      newCoins.push({
        id: `diag-coin-${Date.now()}-${currentPairIndexRef.current}-1`,
        x: currentCanvasWidth - 50 - COIN_SIZE, 
        y: yPos, 
        width: COIN_SIZE, height: COIN_SIZE,
        isCollected: false,
        targetSpawnTime: Date.now(), // Appear immediately
        currentOpacity: 1, // Fully visible
        particles: [], 
        isVisuallyPresent: true,
        rotationAngle: Math.random() * Math.PI * 2, 
        rotationSpeed: 0, // No rotation for diagnostic
      });
      console.log(`[spawnNewCoinPair] DIAGNOSTIC SPAWN: Created ${newCoins.length} test coins:`, JSON.parse(JSON.stringify(newCoins.map(c => ({id: c.id, x:c.x, y:c.y})))));
      return newCoins;
    },
    [] // Minimal dependencies for diagnostic version
  );

  const spawnSingleEnemy = useCallback((currentProcessedLevelData: ProcessedLevelData | null, currentCanvasWidth: number): EnemyState | null => {
    if (!currentProcessedLevelData) return null;
    const p1 = currentProcessedLevelData.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
    const p2 = currentProcessedLevelData.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');
    if (!p1 || !p2) return null;
    const p1CenterY = p1.y + p1.height / 2;
    const p2CenterY = p2.y + p2.height / 2;
    const enemyY = (p1CenterY + p2CenterY) / 2 - ENEMY_RADIUS;
    return {
      id: `enemy-${Date.now()}`, x: ENEMY_RADIUS, y: enemyY, radius: ENEMY_RADIUS,
      width: ENEMY_RADIUS * 2, height: ENEMY_RADIUS * 2,
      vx: PLATFORM_SPEED * ENEMY_SPEED_FACTOR, direction: 1, color: ENEMY_COLOR,
    };
  }, [ENEMY_RADIUS, ENEMY_COLOR, PLATFORM_SPEED, ENEMY_SPEED_FACTOR]); // Dependencies for spawnSingleEnemy


  // Effect 1: Set isClient and load assets
  useEffect(() => {
    // console.log(`[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state: ${isClient}`);
    setIsClient(true);
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
  }, []);

  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    // console.log(`[GameCanvas Effect 2] Running: Apply canvasSize to attributes. canvasSize: W${canvasSize.width}H${canvasSize.height}`);
    if (canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      if (!ctxRef.current) ctxRef.current = canvasRef.current.getContext('2d');
      // console.log(`[GameCanvas Effect 2] Canvas attributes set to W:${canvasSize.width}, H:${canvasSize.height}. Context obtained.`);
    }
  }, [canvasSize]);

  // Effect 3: Observe parent element size and update canvasSize state
  useEffect(() => {
    // console.log(`[GameCanvas Effect 3] Running: Observe parent size. isClient: ${isClient}`);
    if (!isClient || !canvasRef.current?.parentElement) return;
    const parentElement = canvasRef.current.parentElement;
    const updateCanvasSizeState = () => {
      const newWidth = parentElement.clientWidth;
      const newHeight = parentElement.clientHeight;
      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          if ((newWidth > 0 && newHeight > 0) || (newWidth === 0 && newHeight === 0 && (currentSize.width !== 0 || currentSize.height !== 0) )) {
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
    // console.log(`[GameCanvas Effect 4] Running: Load raw level data for ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) return;
    
    setIsLoading(true); 
    setRawLevelData(null); 
    setProcessedLevel(null); 
    setActiveCoins([]); 
    setActiveEnemies([]); 
    setCurrentPairIndex(0); 
    playerInstanceRef.current = null; 
    if(parentPlayerRef) parentPlayerRef.current = null;
    
    loadLevel(levelPath).then(data => {
      // if(data) console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
      // else console.warn(`[GameCanvas Effect 4] loadLevel returned null for ${levelPath}.`);
      setRawLevelData(data);
    }).catch(error => {
        console.error(`[GameCanvas Effect 4] Error loading level ${levelPath}:`, error);
        setRawLevelData(null);
    });
  }, [levelPath, isClient, parentPlayerRef]);

  // Effect 5: Process raw level data
  useEffect(() => {
    // console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${allAssetsLoaded}`);
    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded) {
      if (processedLevelRef.current !== null) {
        // console.log("[GameCanvas Effect 5] Conditions not met. Clearing processedLevel and player instance.");
        setProcessedLevel(null); playerInstanceRef.current = null; if (parentPlayerRef) parentPlayerRef.current = null;
      }
      return;
    }
    const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
    if (newProcessedLevel) {
      // console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel and newPlayer.");
      setProcessedLevel(newProcessedLevel);
      if (playerInstanceRef.current && parentPlayerRef) parentPlayerRef.current = playerInstanceRef.current;
    } else {
      // console.warn("[GameCanvas Effect 5] processRawLevelData returned null.");
      setProcessedLevel(null); playerInstanceRef.current = null; if (parentPlayerRef) parentPlayerRef.current = null;
    }
  }, [isClient, rawLevelData, canvasSize, allAssetsLoaded, processRawLevelData, parentPlayerRef, setProcessedLevel]);

  // Effect 6: Update refs when state changes
  useEffect(() => { processedLevelRef.current = processedLevel; }, [processedLevel]);
  useEffect(() => { activeCoinsRef.current = activeCoins; }, [activeCoins]);
  useEffect(() => { activeEnemiesRef.current = activeEnemies; }, [activeEnemies]);
  useEffect(() => { currentPairIndexRef.current = currentPairIndex; }, [currentPairIndex]);
  useEffect(() => { executeActionRef.current = executeAction; }, [executeAction]);
  useEffect(() => { 
    // console.log(`[GameCanvas Effect for activeCoins STATE] activeCoins updated in state:`, JSON.parse(JSON.stringify(activeCoins.map(c=>({id:c.id, x:c.x, y:c.y})))));
    activeCoinsRef.current = activeCoins;
  }, [activeCoins]);

  // Effect 7: Initial entity spawn and finish loading
  useEffect(() => {
    console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevelRef.current}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}, currentPairIndex: ${currentPairIndexRef.current}, activeCoins.length: ${activeCoins.length}`);
    
    if (!isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
        console.log(`[GameCanvas Effect 7] Pre-conditions (isClient, processedLevel, canvasSize) not met for entity spawn, returning. isLoading: ${isLoading}`);
        return; 
    }

    if (!isLoading) { // Only run if not already loading
        console.log(`[GameCanvas Effect 7] isLoading is false, skipping spawn logic.`);
        return;
    }
    
    let coinsSpawnedOrAttempted = activeCoins.length > 0;
    let enemiesSpawnedOrAttempted = activeEnemies.length > 0;

    if (currentPairIndexRef.current === 0 && !coinsSpawnedOrAttempted && processedLevelRef.current.tiles.length > 0) {
        console.log(`[GameCanvas Effect 7] Spawning INITIAL coin pair (index ${currentPairIndexRef.current}) for level ${levelPath}`);
        const newCoins = spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height);
        setActiveCoins(newCoins);
        coinsSpawnedOrAttempted = true;
    } else if (processedLevelRef.current.tiles.length === 0) {
        coinsSpawnedOrAttempted = true; 
    }

    if (levelPath !== '/levels/level2.json' && levelPath !== '/levels/level1.json') { // Keep enemies off for level 1 and 2
        if (!enemiesSpawnedOrAttempted && processedLevelRef.current.tiles.length > 0) {
            const p1 = processedLevelRef.current.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
            const p2 = processedLevelRef.current.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');
            if (p1 && p2) {
                const newEnemy = spawnSingleEnemy(processedLevelRef.current, canvasSize.width);
                if (newEnemy) setActiveEnemies([newEnemy]);
            }
            enemiesSpawnedOrAttempted = true;
        } else if (processedLevelRef.current.tiles.length === 0) {
             enemiesSpawnedOrAttempted = true;
        }
    } else {
        enemiesSpawnedOrAttempted = true; 
        // console.log(`[GameCanvas Effect 7] Enemies not spawned for level: ${levelPath}`);
    }
    
    if (coinsSpawnedOrAttempted && enemiesSpawnedOrAttempted) {
        console.log("[GameCanvas Effect 7] All entities attempted or not needed, setting isLoading to false.");
        setIsLoading(false);
    } else {
        console.log(`[GameCanvas Effect 7] Entities not yet spawned. coinsSpawnedOrAttempted: ${coinsSpawnedOrAttempted}, enemiesSpawnedOrAttempted: ${enemiesSpawnedOrAttempted}`);
    }
  }, [
    isClient, isLoading, processedLevel, canvasSize, levelPath, 
    spawnNewCoinPair, spawnSingleEnemy, 
    setActiveCoins, setActiveEnemies, setIsLoading,
    currentPairIndex // To re-trigger if pair index is reset externally
  ]);

  // Effect 8: Check if current coin pair is collected and advance to the next if so
  useEffect(() => {
    console.log(`[GameCanvas Effect 8] Running. activeCoins length: ${activeCoins.length}, currentPairIndex: ${currentPairIndexRef.current}`);
    if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
      console.log(`[GameCanvas Effect 8] Pre-conditions not met, returning. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevelRef.current}, canvasSize: W${canvasSize.width}H${canvasSize.height}`);
      return;
    }

    const allCollectedAndParticlesGone =
      activeCoins.length > 0 &&
      activeCoins.every(c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent);

    if (allCollectedAndParticlesGone) {
      console.log(`[GameCanvas Effect 8] All coins in current pair collected and particles gone. Current Pair Index BEFORE advance: ${currentPairIndexRef.current}`);
      
      const currentPairVal = currentPairIndexRef.current; 
      if (currentPairVal < NUMBER_OF_COIN_PAIRS) { // Check against total pairs
        const nextPairIdx = currentPairVal + 1;
        console.log(`[GameCanvas Effect 8] Preparing to advance to pair index: ${nextPairIdx}`);
        
        setActiveCoins([]); 
        console.log(`[GameCanvas Effect 8] Called setActiveCoins([])`);

        if (nextPairIdx < NUMBER_OF_COIN_PAIRS) {
          setCurrentPairIndex(nextPairIdx);
          console.log(`[GameCanvas Effect 8] Called setCurrentPairIndex(${nextPairIdx})`);
        } else {
          console.log(`[GameCanvas Effect 8] All ${NUMBER_OF_COIN_PAIRS} pairs collected and cleared. No more coins.`);
          setCurrentPairIndex(nextPairIdx); // Set to NUMBER_OF_COIN_PAIRS to stop Effect 8.5
        }
      }
    }
  }, [activeCoins, isClient, isLoading, canvasSize, processedLevelRef, setActiveCoins, setCurrentPairIndex, NUMBER_OF_COIN_PAIRS]);


  // Effect 8.5: Spawns a new pair when currentPairIndex changes (and conditions are met)
  useEffect(() => {
    console.log(`[GameCanvas Effect 8.5] Running. currentPairIndex: ${currentPairIndex}, activeCoins.length: ${activeCoins.length}, isLoading: ${isLoading}`);

    if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
      console.log(`[GameCanvas Effect 8.5] Pre-conditions (isLoading, isClient, processedLevel, canvasSize) not met, returning.`);
      return;
    }
    
    if (currentPairIndex >= NUMBER_OF_COIN_PAIRS) {
        console.log(`[GameCanvas Effect 8.5] currentPairIndex (${currentPairIndex}) is >= NUMBER_OF_COIN_PAIRS (${NUMBER_OF_COIN_PAIRS}). No spawn.`);
        if(activeCoins.length > 0) setActiveCoins([]); 
        return;
    }
    
    // Only spawn if activeCoins is empty (meaning previous pair was cleared by Effect 8)
    if (activeCoins.length === 0) {
        console.log(`[GameCanvas Effect 8.5] Conditions met for spawning pair index: ${currentPairIndex}. activeCoins is empty.`);
        const newPair = spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height);
        console.log(`[GameCanvas Effect 8.5] spawnNewCoinPair for index ${currentPairIndex} returned ${newPair.length} coins:`, JSON.parse(JSON.stringify(newPair.map(c=>({id: c.id, x:c.x, y:c.y})))));
        setActiveCoins(newPair);
    } else {
        console.log(`[GameCanvas Effect 8.5] Not spawning. activeCoins.length is ${activeCoins.length} (expected 0).`);
    }
  }, [currentPairIndex, isLoading, isClient, processedLevelRef, canvasSize, spawnNewCoinPair, setActiveCoins, activeCoins.length, NUMBER_OF_COIN_PAIRS]);

  const gameLoop = useCallback(() => {
    const player = playerInstanceRef.current;
    const currentLevel = processedLevelRef.current; 
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;

    if (!ctx || !canvas) {
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      return;
    }
    
    if (!currentLevel) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; 
      ctx.fillRect(0,0,canvas.width, canvas.height);
      ctx.fillStyle = 'white';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Failed to load level data. Please check server and file path.', canvas.width / 2, canvas.height / 2);
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      return;
    }
    
    if (!player) {
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const loopStartTime = Date.now();
    let deltaTime = loopStartTime - lastFrameTime.current;
    const MAX_DELTA_TIME_MS = 100; 
    if (deltaTime > MAX_DELTA_TIME_MS) deltaTime = MAX_DELTA_TIME_MS;
    const deltaTimeFactor = Math.max(0.05, Math.min(2, deltaTime / (1000 / 60))); 
    lastFrameTime.current = loopStartTime;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentExecuteActionVal = executeActionRef.current;
    if (currentExecuteActionVal) {
      switch (currentExecuteActionVal) {
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
      executeActionRef.current = null; 
    }

    player.vx = 0;
    if (player.isMovingLeft) player.vx = -PLAYER_SPEED;
    if (player.isMovingRight) player.vx = PLAYER_SPEED;
    player.vy += GRAVITY * deltaTimeFactor;
    
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
    player.activePlatformId = activePlatformThisFrame ? activePlatformThisFrame.id : null;
    
    if (activePlatformThisFrame && activePlatformThisFrame.vx && activePlatformThisFrame.direction) {
      let platformInducedMoveX = activePlatformThisFrame.vx * activePlatformThisFrame.direction * deltaTimeFactor;
      player.x += platformInducedMoveX;
    }
    
    const p3Tile = currentLevel.tiles.find(t => t.id === 'p3');
    if (p3Tile && p3BasePositionRef.current && levelPath === '/levels/level2.json') { 
      if (p3MovementStateRef.current) {
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
        if (progress >= 1) p3MovementStateRef.current = null;
      } else {
        p3CurrentTargetIndexRef.current = (p3CurrentTargetIndexRef.current + 1 + Math.floor(Math.random() * (p3InterestPointsRef.current.length -1))) % p3InterestPointsRef.current.length;
        if (p3InterestPointsRef.current.length > 0) {
            const targetDrift = p3InterestPointsRef.current[p3CurrentTargetIndexRef.current];
            p3MovementStateRef.current = {
              startTime: loopStartTime, startX: p3Tile.x, startY: p3Tile.y,
              targetX: p3BasePositionRef.current.x + targetDrift.x,
              targetY: p3BasePositionRef.current.y + targetDrift.y,
            };
        }
      }
    }
    
    currentLevel.tiles.forEach(tile => {
      if (tile.id !== 'p3' && tile.vx && tile.direction) { 
        let newX = tile.x + (tile.vx * tile.direction * deltaTimeFactor);
        let tileMovementBoundaryLeft = 0;
        let tileMovementBoundaryRight = canvas.width;
        if (tile.id === 'boat1') {
            const water = currentLevel.tiles.find(t => t.id === 'water_area');
            if (water) {
                 tileMovementBoundaryLeft = water.x;
                 tileMovementBoundaryRight = water.x + water.width;
            }
        }
        if (newX + tile.width > tileMovementBoundaryRight) {
          newX = tileMovementBoundaryRight - tile.width; tile.direction *= -1;             
        } else if (newX < tileMovementBoundaryLeft ) {
          newX = tileMovementBoundaryLeft; tile.direction *= -1;             
        }
        tile.x = newX;
      }
    });

    const p_ground = currentLevel.tiles.find(t => t.id === 'p_ground');
    if (p_ground && player.y + player.height > p_ground.y && player.vy >=0 ) { 
         player.y = p_ground.y - player.height;
         player.isOnGround = true; player.vy = 0;
         player.activePlatformId = p_ground.id;
    } else if (!p_ground && player.y + player.height > canvas.height && player.vy >=0) { 
        player.y = canvas.height - player.height;
        player.isOnGround = true; player.vy = 0;
        player.activePlatformId = null; 
    }

    if (player.x < 0) player.x = 0;
    if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;

    if (parentPlayerRef) parentPlayerRef.current = { ...player };

    let coinsNeedUpdate = false;
    const updatedCoins = activeCoinsRef.current.map(coin => {
      let newOpacity = coin.currentOpacity;
      let newParticles = [...coin.particles];
      let newIsVisuallyPresent = coin.isVisuallyPresent;
      let newRotationAngle = coin.rotationAngle;
      let coinUpdatedThisFrame = false;

      if (!coin.isCollected && loopStartTime >= coin.targetSpawnTime && coin.currentOpacity < 1) {
        newOpacity = Math.min(1, coin.currentOpacity + (deltaTime / COIN_FADE_IN_DURATION));
        coinUpdatedThisFrame = true;
      }
      
      if (coin.isCollected && coin.collectionTime && newIsVisuallyPresent) { 
        for (let i = 0; i < COIN_PARTICLE_COUNT; i++) {
          newParticles.push({
            x: coin.x + coin.width / 2, y: coin.y + coin.height / 2,
            vx: (Math.random() - 0.5) * PLAYER_SPEED * COIN_PARTICLE_SPEED_MULTIPLIER,
            vy: (Math.random() - 0.5) * PLAYER_SPEED * COIN_PARTICLE_SPEED_MULTIPLIER - 2,
            size: COIN_PARTICLE_SIZE, opacity: 1, life: COIN_PARTICLE_LIFESPAN,
          });
        }
        newIsVisuallyPresent = false; 
        newOpacity = 0; 
        coinUpdatedThisFrame = true;
      }
      
      if (newParticles.length > 0) {
        newParticles = newParticles.map(p => {
          p.x += p.vx * deltaTimeFactor;
          p.y += p.vy * deltaTimeFactor;
          p.vy += GRAVITY * COIN_PARTICLE_GRAVITY_FACTOR * deltaTimeFactor;
          p.life -= deltaTime;
          p.opacity = Math.max(0, p.life / COIN_PARTICLE_LIFESPAN);
          return p;
        }).filter(p => p.opacity > 0);
        coinUpdatedThisFrame = true;
      }
      
      if (coin.rotationSpeed !== 0) {
        newRotationAngle = (coin.rotationAngle + coin.rotationSpeed * deltaTimeFactor) % (Math.PI * 2);
        coinUpdatedThisFrame = true;
      }
      
      if (coinUpdatedThisFrame) coinsNeedUpdate = true;
      return { ...coin, currentOpacity: newOpacity, particles: newParticles, isVisuallyPresent: newIsVisuallyPresent, rotationAngle: newRotationAngle };
    });
    
    if (coinsNeedUpdate) {
      setActiveCoins(updatedCoins);
    }
    
    if (player) {
      let playerCollectedACoin = false;
      const coinsAfterCollection = activeCoinsRef.current.map(coin => {
        if (!coin.isCollected && coin.isVisuallyPresent && coin.currentOpacity > 0.5 && 
            checkCollision(player, { x: coin.x, y: coin.y, width: coin.width, height: coin.height })) {
          playerCollectedACoin = true;
          return { ...coin, isCollected: true, collectionTime: Date.now() };
        }
        return coin;
      });
      if (playerCollectedACoin) {
        setActiveCoins(coinsAfterCollection);
      }
    }
    
    let enemiesNeedUpdate = false;
    const updatedEnemies = activeEnemiesRef.current.map(enemy => {
        let newEnemyX = enemy.x + (enemy.vx * enemy.direction * deltaTimeFactor);
        let enemyUpdatedThisFrame = false;
        if (newEnemyX + enemy.width > canvas.width) {
            newEnemyX = canvas.width - enemy.width; enemy.direction *= -1; enemyUpdatedThisFrame = true;
        } else if (newEnemyX < 0) {
            newEnemyX = 0; enemy.direction *= -1; enemyUpdatedThisFrame = true;
        }
        if (enemy.x !== newEnemyX) enemyUpdatedThisFrame = true;
        if (enemyUpdatedThisFrame) enemiesNeedUpdate = true;
        return { ...enemy, x: newEnemyX };
    });

    if (enemiesNeedUpdate) {
        setActiveEnemies(updatedEnemies);
    }

    if (player) {
      let playerCollidedWithEnemy = false;
      const enemiesAfterCollision = activeEnemiesRef.current.map(enemy => {
          if (checkCollision(player, enemy)) {
              // console.log("[GameLoop] Player collided with enemy!");
              playerCollidedWithEnemy = true;
              // toast({ title: "Collision!", description: "Ouch! You hit an enemy.", variant: "destructive" });
              const groundPlatform = currentLevel.tiles.find(t => t.id === 'p_ground');
              if (groundPlatform) {
                  player.x = canvas.width / 2 - player.width / 2;
                  player.y = groundPlatform.y - player.height;
              } else {
                  player.x = canvas.width / 2 - player.width / 2;
                  player.y = canvas.height - player.height; // Fallback to canvas bottom
              }
              player.vx = 0; player.vy = 0; player.isOnGround = true;
          }
          return enemy; // Enemy state doesn't change on collision for now
      });
      // No need to call setActiveEnemies if enemies don't change state from collision
    }
    
    currentLevel.tiles.forEach(tile => {
      if (tile.layer !== 'foreground') { 
        if (tile.type === 1) { 
          let specificImage = assets.tileImage; 
          if (tile.id?.startsWith('stone_') && assets.stoneImage) specificImage = assets.stoneImage;
          if (specificImage?.complete) ctx.drawImage(specificImage, tile.x, tile.y, tile.width, tile.height);
          else { ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height); }
        } else { 
          let imgToDraw: HTMLImageElement | null = null;
          if (tile.id === 'tree1' && assets.tree1Image) imgToDraw = assets.tree1Image;
          else if (tile.id === 'tree2' && assets.tree2Image) imgToDraw = assets.tree2Image;
          else if (tile.id === 'house1' && assets.houseImage) imgToDraw = assets.houseImage;
          if (imgToDraw?.complete) ctx.drawImage(imgToDraw, tile.x, tile.y, tile.width, tile.height);
          else if (!imgToDraw) { ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height); }
        }
      }
    });
    
    renderCoins(ctx, activeCoinsRef.current, assets.coinImage);
    renderEnemies(ctx, activeEnemiesRef.current);
    if (player) renderPlayer(ctx, player, assets.playerImage);

    currentLevel.tiles.forEach(tile => {
      if (tile.layer === 'foreground') {
        let imgToDraw: HTMLImageElement | null = null;
        if ((tile.id === 'bush_left_1' || tile.id === 'bush_right_1') && assets.smallBushImage) imgToDraw = assets.smallBushImage;
        else if ((tile.id === 'bush_left_2' || tile.id === 'bush_right_2') && assets.largeBushImage) imgToDraw = assets.largeBushImage;
        if (imgToDraw?.complete) ctx.drawImage(imgToDraw, tile.x, tile.y, tile.width, tile.height);
        else if (!imgToDraw) { ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height); }
      }
    });
    
    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, [
      isClient, assets, resetExecuteAction, parentPlayerRef, levelPath,
      processRawLevelData, spawnNewCoinPair, spawnSingleEnemy, // Include memoized helpers
      setActiveCoins, setActiveEnemies, // Stable setters
      p3BasePositionRef, p3InterestPointsRef, p3CurrentTargetIndexRef, p3MovementStateRef,
      GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, COIN_FADE_IN_DURATION, COIN_PARTICLE_COUNT,
      COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR,
      COIN_PARTICLE_SIZE, COIN_ROTATION_SPEED_MAX, COIN_ROTATION_SPEED_MIN, P3_MOVEMENT_DURATION,
      // No need to depend on activeCoins, activeEnemies, currentPairIndex directly if using refs and functional updates for their setters
  ]);

  // Effect 9: Start/Stop Game Loop
  useEffect(() => {
    console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize: W${canvasSize.width}H${canvasSize.height}, processedLevel: ${!!processedLevelRef.current}`);
    
    const conditionsMet = isClient && !isLoading && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevelRef.current;
    
    if (conditionsMet) {
      console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); 
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    } else {
      console.log(`[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start. isClient:${isClient}, isLoading:${isLoading}, canvasExists:${!!canvasRef.current}, canvasW:${canvasSize.width}, canvasH:${canvasSize.height}, processedLevelExists:${!!processedLevelRef.current}`);
      if (animationFrameIdRef.current) {
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
  }, [isClient, isLoading, canvasSize, gameLoop, processedLevel]); // processedLevel (state) added to re-evaluate loop start when it's ready

  if (!isClient) {
    // console.log("[GameCanvas] Rendering null because not client-side yet (isClient is false).");
    return null; 
  }
  
  // console.log(`[GameCanvas] Rendering. isClient: ${isClient}, isLoading: ${isLoading}, canvasSize: W${canvasSize.width}H${canvasSize.height}`);
  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block', 
        width: '100%',    
        height: '100%',
      }}
      aria-label="Game Canvas"
      tabIndex={0} 
    />
  );
}

