
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
import {
  GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
  COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
  COIN_FADE_IN_DURATION, COIN_SPAWN_STAGGER_DELAY,
  COIN_PARTICLE_COUNT, COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR, COIN_PARTICLE_SIZE,
  ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, PLATFORM_SPEED,
  COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX,
  COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR,
  P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION,
} from '@/config/gameConfig';
// import { useToast } from "@/hooks/use-toast";
import { checkCollision } from '@/game/utils/collision';
import { renderPlayer } from '@/game/entities/playerRenderer';
// import { renderLevel } from '@/game/entities/levelRenderer'; // Integrated into gameLoop
import { renderCoins } from '@/game/entities/coinRenderer';
import { renderEnemies } from '@/game/entities/enemyRenderer';
import { loadLevel } from '@/lib/levelLoader';

interface GameCanvasProps {
  levelPath: string;
  playerRef?: React.MutableRefObject<PlayerState | null>;
  executeAction?: GameAction | null;
  resetExecuteAction?: () => void;
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
  }
  console.warn(`[GameCanvas parseDimension] Invalid dimension value: ${value}, defaulting to 0.`);
  return 0;
};

export default function GameCanvas({
  levelPath,
  playerRef: parentPlayerRef,
  executeAction,
  resetExecuteAction,
}: GameCanvasProps) {
  console.log(`[GameCanvas] Component body. levelPath: ${levelPath}`);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
    boatImage: null as HTMLImageElement | null,
    playerImageLoaded: false,
    tileImageLoaded: false,
    coinImageLoaded: false,
    stoneImageLoaded: false,
    tree1ImageLoaded: false,
    tree2ImageLoaded: false,
    smallBushImageLoaded: false,
    largeBushImageLoaded: false,
    houseImageLoaded: false,
    boatImageLoaded: false,
  });

  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [rawLevelData, setRawLevelData] = useState<RawLevelData | null>(null);
  const [processedLevel, setProcessedLevel] = useState<ProcessedLevelData | null>(null);
  const playerInstanceRef = useRef<PlayerState | null>(null);
  const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);
  
  const p3BasePositionRef = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const p3CurrentTargetIndexRef = useRef<number>(0);
  const p3MovementStateRef = useRef<{
    startTime: number;
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
  } | null>(null);
  
  const lastFrameTime = useRef<number>(Date.now());
  const executeActionRef = useRef<GameAction | null>(null);
  const processedLevelRef = useRef<ProcessedLevelData | null>(null);


  const processRawLevelData = useCallback((
    currentRawLevelData: RawLevelData | null, 
    currentCanvasWidth: number, 
    currentCanvasHeight: number
  ): ProcessedLevelData | null => {
    console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
    if (!currentRawLevelData || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
      console.warn("[GameCanvas processRawLevelData] No raw data or invalid canvas size, returning null.");
      return null;
    }

    const processedTiles: ProcessedTile[] = currentRawLevelData.tiles.map(rawTile => {
      const tileWidth = parseDimension(rawTile.width, currentCanvasWidth);
      const tileHeight = parseDimension(rawTile.height, currentCanvasHeight);
      const xOffset = rawTile.positioning.xOffsetPx || 0;
      const yOffset = rawTile.positioning.yOffsetPx || 0;
      let tileX = 0;
      let tileY = 0;

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
        default: console.warn(`[processRawLevelData] Unknown anchor: ${rawTile.positioning.anchor} for tile ${rawTile.id}. Defaulting to top-left.`); tileX = xOffset; tileY = yOffset;
      }
      return {
        ...rawTile,
        x: tileX,
        y: tileY,
        width: tileWidth,
        height: tileHeight,
        vx: rawTile.vx !== undefined ? rawTile.vx * PLATFORM_SPEED : 0,
        direction: rawTile.direction !== undefined ? rawTile.direction : 1,
        layer: rawTile.layer || 'background',
      };
    });
    
    const p_ground_tile = processedTiles.find(tile => tile.id === 'p_ground');
    const p_ground_top_y = p_ground_tile ? p_ground_tile.y : currentCanvasHeight - 1;

    if (levelPath === '/levels/level2.json') {
        p3BasePositionRef.current = {
            x: (currentCanvasWidth / 2) - (P3_SIZE_W / 2),
            y: p_ground_top_y - 300, 
        };
        console.log("[processRawLevelData] Level 2: p_ground_top_y:", p_ground_top_y, "p3BasePosRef.current:", p3BasePositionRef.current);

        p3InterestPointsRef.current = [
            { x: 0, y: 0 }, { x: P3_DRIFT_RANGE, y: 0 }, { x: 0, y: P3_DRIFT_RANGE },
            { x: -P3_DRIFT_RANGE, y: 0 }, { x: 0, y: -P3_DRIFT_RANGE },
            { x: P3_DRIFT_RANGE, y: -P3_DRIFT_RANGE}, { x: -P3_DRIFT_RANGE, y: P3_DRIFT_RANGE}
        ].map(p => ({ x: p.x, y: p.y }));

        p3CurrentTargetIndexRef.current = 0;
        p3MovementStateRef.current = null; 
        
        const newP3TileX = p3BasePositionRef.current.x + p3InterestPointsRef.current[0].x;
        const newP3TileY = p3BasePositionRef.current.y + p3InterestPointsRef.current[0].y;

        const p3Tile: ProcessedTile = {
            id: 'p3',
            x: newP3TileX, y: newP3TileY,
            width: P3_SIZE_W, height: P3_SIZE_H,
            type: 1, color: 'hsl(var(--muted))',
            vx: 0, direction: 0, layer: 'background',
            positioning: { anchor: 'top-left', xOffsetPx: 0, yOffsetPx: 0 } 
        };
        processedTiles.push(p3Tile);
        console.log("[processRawLevelData] Level 2: Added p3Tile:", p3Tile);
         p3MovementStateRef.current = {
            startTime: Date.now(),
            startX: newP3TileX, startY: newP3TileY,
            targetX: newP3TileX, targetY: newP3TileY, // Start at the first point
        };
    }

    const playerStartPlatform = processedTiles.find(tile => tile.id === currentRawLevelData.playerStart.platformId);
    let playerX = 0;
    let playerY = 0;

    if (playerStartPlatform) {
      playerY = playerStartPlatform.y - PLAYER_HEIGHT - (currentRawLevelData.playerStart.yOffsetPx || 0);
      switch (currentRawLevelData.playerStart.horizontalAlign) {
        case 'left': playerX = playerStartPlatform.x + (currentRawLevelData.playerStart.xOffsetPx || 0); break;
        case 'center': playerX = playerStartPlatform.x + (playerStartPlatform.width / 2) - (PLAYER_WIDTH / 2) + (currentRawLevelData.playerStart.xOffsetPx || 0); break;
        case 'right': playerX = playerStartPlatform.x + playerStartPlatform.width - PLAYER_WIDTH - (currentRawLevelData.playerStart.xOffsetPx || 0); break;
      }
    } else {
      console.warn(`[processRawLevelData] Player start platform with id "${currentRawLevelData.playerStart.platformId}" not found! Defaulting player to 0,0.`);
    }
    
    const newPlayer: PlayerState = {
      x: playerX, y: playerY,
      width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
      vx: 0, vy: 0,
      isOnGround: false, isMovingLeft: false, isMovingRight: false,
      color: PLAYER_COLOR, image: assets.playerImage || undefined,
      facingDirection: 'right', activePlatformId: null,
    };

    playerInstanceRef.current = newPlayer;
    if (parentPlayerRef) {
      parentPlayerRef.current = newPlayer;
    }
    console.log(`[processRawLevelData] Successfully processed. Player:`, newPlayer, "Number of tiles:", processedTiles.length);
    return { playerStart: { xPx: playerX, yPx: playerY }, tiles: processedTiles };
  }, [assets.playerImage, parentPlayerRef, levelPath, P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION]); // Added assets.playerImage


  const spawnNewCoinPair = useCallback((currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number, currentCanvasHeight: number): CoinState[] => {
    console.log(`[spawnNewCoinPair] DIAGNOSTIC SPAWN Called. Canvas W:${currentCanvasWidth}, H:${currentCanvasHeight}. ProcessedLevel exists: ${!!currentProcessedLevel}`);
    if (!currentProcessedLevel || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
      console.warn("[spawnNewCoinPair] Pre-conditions not met. No coins spawned.");
      return [];
    }
  
    const p_ground = currentProcessedLevel.tiles.find(tile => tile.id === 'p_ground');
    if (!p_ground) {
      console.warn("[spawnNewCoinPair] 'p_ground' tile not found. Cannot determine spawn zone. No coins spawned.");
      return [];
    }
    console.log(`[spawnNewCoinPair] p_ground found. TopY: ${p_ground.y}`);
    const p_groundTopY = p_ground.y;
  
    const gamePlatforms = currentProcessedLevel.tiles.filter(tile => tile.type === 1 && tile.id !== 'p_ground');
    const actualHighestPlatformTopY = gamePlatforms.length > 0
      ? Math.min(...gamePlatforms.map(p => p.y))
      : p_groundTopY; 
    console.log(`[spawnNewCoinPair] Actual highest platform TopY: ${actualHighestPlatformTopY}`);

    const ySpawnZoneBottomCoinTopEdge = p_groundTopY - COIN_VERTICAL_SPAWN_BOTTOM_OFFSET - COIN_SIZE;
    const ySpawnZoneTopCoinTopEdge = actualHighestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;
    
    console.log(`[spawnNewCoinPair] ySpawnZoneBottomCoinTopEdge: ${ySpawnZoneBottomCoinTopEdge}, ySpawnZoneTopCoinTopEdge: ${ySpawnZoneTopCoinTopEdge}`);

    if (ySpawnZoneTopCoinTopEdge >= ySpawnZoneBottomCoinTopEdge) {
      console.warn(`[spawnNewCoinPair] Invalid spawn zone: Top (${ySpawnZoneTopCoinTopEdge}) is above or equal to Bottom (${ySpawnZoneBottomCoinTopEdge}). No coins spawned.`);
      return [];
    }
  
    const newCoins: CoinState[] = [];
    const numberOfCoinsToSpawn = 10;
    console.log(`[spawnNewCoinPair] Attempting to spawn ${numberOfCoinsToSpawn} coins.`);
  
    for (let i = 0; i < numberOfCoinsToSpawn; i++) {
      const randomY = Math.random() * (ySpawnZoneBottomCoinTopEdge - ySpawnZoneTopCoinTopEdge) + ySpawnZoneTopCoinTopEdge;
      let randomX;
      if (i < numberOfCoinsToSpawn / 2) { // First half on the left
        randomX = Math.random() * (currentCanvasWidth / 2 - COIN_SIZE);
      } else { // Second half on the right
        randomX = Math.random() * (currentCanvasWidth / 2 - COIN_SIZE) + currentCanvasWidth / 2;
      }
  
      newCoins.push({
        id: `coin-${Date.now()}-${i}`,
        x: randomX, y: randomY,
        width: COIN_SIZE, height: COIN_SIZE,
        isCollected: false,
        targetSpawnTime: Date.now() + i * COIN_SPAWN_STAGGER_DELAY, 
        currentOpacity: 0, // Start fully transparent
        particles: [],
        isVisuallyPresent: true,
        rotationAngle: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() * (COIN_ROTATION_SPEED_MAX - COIN_ROTATION_SPEED_MIN) + COIN_ROTATION_SPEED_MIN) * (Math.random() < 0.5 ? 1 : -1),
      });
    }
    console.log(`[spawnNewCoinPair] DIAGNOSTIC SPAWN: Created ${newCoins.length} coins:`, newCoins.length > 0 ? newCoins[0] : 'none');
    return newCoins;
  }, [MAX_JUMP_HEIGHT, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, COIN_SIZE, COIN_SPAWN_STAGGER_DELAY, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX]);

  const spawnSingleEnemy = useCallback((currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number): EnemyState | null => {
    if (!currentProcessedLevel) return null;
    const p1 = currentProcessedLevel.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
    const p2 = currentProcessedLevel.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');
    if (!p1 || !p2) return null;

    const enemyY = (p1.y + p1.height / 2 + p2.y + p2.height / 2) / 2 - ENEMY_RADIUS;
    return {
      id: `enemy-${Date.now()}`, x: 0, y: enemyY,
      radius: ENEMY_RADIUS, width: ENEMY_RADIUS * 2, height: ENEMY_RADIUS * 2,
      vx: PLATFORM_SPEED * ENEMY_SPEED_FACTOR, direction: 1, color: ENEMY_COLOR,
    };
  }, [ENEMY_RADIUS, PLATFORM_SPEED, ENEMY_SPEED_FACTOR, ENEMY_COLOR]);

  // Effect 0: Update executeActionRef when prop changes
  useEffect(() => {
    executeActionRef.current = executeAction;
  }, [executeAction]);

  // Effect 1: Set isClient and load assets
  useEffect(() => {
    console.log("[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state:", isClient);
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
    
    const tree1Img = new Image(); tree1Img.src = '/assets/images/tree1.png'; tree1Img.setAttribute('data-ai-hint', 'tree nature large'); // For tree1 on level 2 (or if used generically)
    tree1Img.onload = () => setAssets(prev => ({ ...prev, tree1Image: tree1Img, tree1ImageLoaded: true }));
    tree1Img.onerror = () => { console.error("Failed to load tree1 image."); setAssets(prev => ({ ...prev, tree1ImageLoaded: true })); };

    const tree2Img = new Image(); tree2Img.src = '/assets/images/tree2.png'; tree2Img.setAttribute('data-ai-hint', 'tree nature');
    tree2Img.onload = () => setAssets(prev => ({ ...prev, tree2Image: tree2Img, tree2ImageLoaded: true }));
    tree2Img.onerror = () => { console.error("Failed to load tree2 image."); setAssets(prev => ({ ...prev, tree2ImageLoaded: true })); };

    const sbImg = new Image(); sbImg.src = '/assets/images/flowers.png'; sbImg.setAttribute('data-ai-hint', 'flowers small');
    sbImg.onload = () => setAssets(prev => ({ ...prev, smallBushImage: sbImg, smallBushImageLoaded: true }));
    sbImg.onerror = () => { console.error("Failed to load small bush (flowers) image."); setAssets(prev => ({ ...prev, smallBushImageLoaded: true })); };

    const lbImg = new Image(); lbImg.src = '/assets/images/bush1.png'; lbImg.setAttribute('data-ai-hint', 'bush large');
    lbImg.onload = () => setAssets(prev => ({ ...prev, largeBushImage: lbImg, largeBushImageLoaded: true }));
    lbImg.onerror = () => { console.error("Failed to load large bush (bush1) image."); setAssets(prev => ({ ...prev, largeBushImageLoaded: true })); };
    
    const hImg = new Image(); hImg.src = '/assets/images/house1.png'; hImg.setAttribute('data-ai-hint', 'house building');
    hImg.onload = () => setAssets(prev => ({ ...prev, houseImage: hImg, houseImageLoaded: true }));
    hImg.onerror = () => { console.error("Failed to load house image."); setAssets(prev => ({ ...prev, houseImageLoaded: true })); };

    const boatImg = new Image(); boatImg.src = '/assets/images/boat.png'; boatImg.setAttribute('data-ai-hint', 'boat water');
    boatImg.onload = () => setAssets(prev => ({ ...prev, boatImage: boatImg, boatImageLoaded: true }));
    boatImg.onerror = () => { console.error("Failed to load boat image."); setAssets(prev => ({ ...prev, boatImageLoaded: true })); };

  }, [isClient]); // isClient is the only dependency here

  // Effect 2: Apply canvasSize to canvas attributes
  useEffect(() => {
    console.log("[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize:", canvasSize);
    if (isClient && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
    }
  }, [isClient, canvasSize]);

  // Effect 3: Observe parent size
  useEffect(() => {
    console.log("[GameCanvas Effect 3] Running: Observe parent size");
    if (!isClient || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const parentElement = canvas.parentElement;
    if (!parentElement) return;

    const updateCanvasSizeState = (newWidth: number, newHeight: number) => {
      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
          return { width: newWidth, height: newHeight };
        }
        return currentSize;
      });
    };
    
    const initialWidth = Math.max(0, parentElement.clientWidth);
    const initialHeight = Math.max(0, parentElement.clientHeight);
    if (initialWidth > 0 && initialHeight > 0) updateCanvasSizeState(initialWidth, initialHeight);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(entries => {
        if (!entries || entries.length === 0) return;
        const entry = entries[0];
        const newWidth = Math.max(0, entry.contentRect.width);
        const newHeight = Math.max(0, entry.contentRect.height);
        updateCanvasSizeState(newWidth, newHeight);
      });
      resizeObserver.observe(parentElement);
    } else {
      const handleResize = () => {
        const newWidth = Math.max(0, parentElement.clientWidth);
        const newHeight = Math.max(0, parentElement.clientHeight);
        updateCanvasSizeState(newWidth, newHeight);
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
    return () => resizeObserver?.disconnect();
  }, [isClient]);


  // Effect 4: Load raw level data
  useEffect(() => {
    console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      console.log("[GameCanvas Effect 4] Not client or no levelPath, returning.");
      return;
    }
    setRawLevelData(null); 
    setIsLoading(true); // Always set to loading when levelPath changes

    loadLevel(levelPath)
      .then(data => {
        console.log(`[GameCanvas Effect 4] ${data ? 'Successfully loaded' : 'Failed to load'} rawLevelData for ${levelPath}`);
        setRawLevelData(data); 
      })
      .catch((err) => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, err);
        setRawLevelData(null);
      });
  }, [isClient, levelPath, setIsLoading, setRawLevelData]); 


  // Effect 5: Process raw level data
  useEffect(() => {
    console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${Object.values(assets).every(v => typeof v === 'boolean' ? v : !!v)}`);
    const allAssetsLoaded = assets.playerImageLoaded && assets.tileImageLoaded && assets.coinImageLoaded &&
                            assets.stoneImageLoaded && assets.tree1ImageLoaded && assets.tree2ImageLoaded &&
                            assets.smallBushImageLoaded && assets.largeBushImageLoaded && assets.houseImageLoaded && assets.boatImageLoaded;

    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded) {
      if (processedLevel !== null) {
        console.log("[GameCanvas Effect 5] Critical data missing or changed, clearing processedLevel.");
        setProcessedLevel(null);
      }
      if (!allAssetsLoaded) console.log("[GameCanvas Effect 5] Waiting for all assets to load...");
      else if (!rawLevelData) console.log("[GameCanvas Effect 5] Waiting for rawLevelData...");
      else if (canvasSize.width === 0 || canvasSize.height === 0) console.log("[GameCanvas Effect 5] Waiting for canvasSize...");
      
      if (isLoading === false && (!rawLevelData || !allAssetsLoaded || canvasSize.width === 0 || canvasSize.height === 0)) {
          console.log("[GameCanvas Effect 5] Critical data missing, ensuring isLoading is true.");
          if(!isLoading) setIsLoading(true);
      }
      return;
    }
    
    console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
    const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
    if (newProcessedLevel) {
      console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel and newPlayer.");
      setProcessedLevel(newProcessedLevel);
      if (playerInstanceRef.current && parentPlayerRef) { // Ensure player instance is passed up
          parentPlayerRef.current = playerInstanceRef.current;
      }
    } else {
      console.warn("[GameCanvas Effect 5] Processing rawLevelData failed. Setting processedLevel to null.");
      setProcessedLevel(null);
      if(!isLoading) setIsLoading(true); 
    }
  }, [
    isClient, rawLevelData, canvasSize, assets, processRawLevelData, 
    setProcessedLevel, setIsLoading, isLoading, parentPlayerRef
  ]);


  // Effect 6: Update processedLevelRef.current when processedLevel state changes
  useEffect(() => {
    processedLevelRef.current = processedLevel;
    console.log("[GameCanvas Effect 6] processedLevelRef.current updated:", processedLevelRef.current ? "Exists" : "null");
  }, [processedLevel]);


  // Effect 7: Spawn entities and finish loading
  useEffect(() => {
    console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevel}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoins.length}`);
    
    // This effect should only run its main logic if we are currently in a loading state
    if (!isLoading) {
      console.log("[GameCanvas Effect 7] isLoading is false, skipping main logic.");
      return;
    }

    if (!isClient || canvasSize.width === 0 || canvasSize.height === 0) {
        console.log("[GameCanvas Effect 7] Pre-conditions (isClient, canvasSize) not met for entity spawn/loading completion, returning.");
        return;
    }
    
    if (!processedLevel) {
        console.warn("[GameCanvas Effect 7] processedLevel is null. Setting isLoading to false. Game may not display level elements.");
        setActiveCoins([]); 
        setActiveEnemies([]);
        setIsLoading(false);
        return;
    }

    let coinsAttemptedToSpawn = false;
    if (activeCoins.length === 0 && processedLevel.tiles.length > 0) {
        console.log(`[GameCanvas Effect 7] Spawning new coin pair for level ${levelPath}`);
        const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
        setActiveCoins(newCoins); 
        console.log(`[GameCanvas Effect 7] spawnNewCoinPair returned ${newCoins.length} coins. Setting activeCoins.`);
        coinsAttemptedToSpawn = true;
    } else if (activeCoins.length > 0 || processedLevel.tiles.length === 0) {
        coinsAttemptedToSpawn = true;
    }


    let enemiesAttemptedToSpawn = false;
    const noEnemiesOnThisLevel = levelPath === '/levels/level1.json' || levelPath === '/levels/level2.json';

    if (!noEnemiesOnThisLevel) {
        if (activeEnemies.length === 0 && processedLevel.tiles.length > 0) {
            console.log(`[GameCanvas Effect 7] Spawning enemies for level ${levelPath}`);
            const newEnemy = spawnSingleEnemy(processedLevel, canvasSize.width);
            if (newEnemy) {
                setActiveEnemies([newEnemy]);
            }
            enemiesAttemptedToSpawn = true;
        } else if (activeEnemies.length > 0 || processedLevel.tiles.length === 0) {
            enemiesAttemptedToSpawn = true;
        }
    } else {
        console.log(`[GameCanvas Effect 7] Enemies not spawned for level: ${levelPath}`);
        enemiesAttemptedToSpawn = true; 
    }
    
    if (coinsAttemptedToSpawn && enemiesAttemptedToSpawn) {
        console.log("[GameCanvas Effect 7] All entities attempted or not needed, setting isLoading to false.");
        setIsLoading(false);
    }
  }, [
      isClient, isLoading, processedLevel, canvasSize, levelPath, 
      // activeCoins.length, activeEnemies.length, // Removed to break potential loops
      spawnNewCoinPair, spawnSingleEnemy, 
      setActiveCoins, setActiveEnemies, setIsLoading
  ]);


  // Effect 8: Check coin respawn logic
  useEffect(() => {
    console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, processedLevel: ${!!processedLevelRef.current}`);
    if (isLoading || !isClient || !canvasRef.current || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
      return;
    }
    const allCollectedAndParticlesGone = activeCoins.length > 0 && activeCoins.every(c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent);
    if (allCollectedAndParticlesGone) {
      console.log("[GameCanvas Effect 8] All coins collected and particles gone, spawning new pair.");
      setActiveCoins(spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height));
    }
  }, [activeCoins, isClient, isLoading, canvasSize, spawnNewCoinPair, setActiveCoins, processedLevelRef]); // Added processedLevelRef
  

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const currentLevel = processedLevelRef.current; // Use the ref here
    const player = playerInstanceRef.current;

    if (!canvas || !player) { 
      console.log(`[gameLoop] Canvas or Player or ProcessedLevel not ready. Canvas: ${!!canvas}, Player: ${!!player}, ProcessedLevel: ${!!currentLevel}`);
      requestAnimationFrame(gameLoop);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      requestAnimationFrame(gameLoop);
      return;
    }
     if (!currentLevel) {
      console.log("[gameLoop] currentLevel is null, drawing fail message.");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'white';
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText("Failed to load level data.", canvas.width / 2, canvas.height / 2 - 20);
      ctx.fillText("Please check server and file path.", canvas.width / 2, canvas.height / 2 + 10);
      requestAnimationFrame(gameLoop);
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
    
    // Update and Render Tiles (Background and Platforms)
    currentLevel.tiles.forEach(tile => {
      if (tile.vx && tile.direction) {
        const waterPit = tile.id === 'boat1' ? currentLevel.tiles.find(t => t.id === 'water_pit') : null;
        let newX = tile.x + (tile.vx * tile.direction * deltaTimeFactor);
        if (waterPit) {
            if (newX + tile.width > waterPit.x + waterPit.width && tile.direction === 1) {
                newX = waterPit.x + waterPit.width - tile.width;
                tile.direction = -1;
            } else if (newX < waterPit.x && tile.direction === -1) {
                newX = waterPit.x;
                tile.direction = 1;
            }
        } else {
            if (newX + tile.width > canvas.width && tile.direction === 1) {
                newX = canvas.width - tile.width;
                tile.direction = -1;
            } else if (newX < 0 && tile.direction === -1) {
                newX = 0;
                tile.direction = 1;
            }
        }
        tile.x = newX;
      }
      if (tile.id === 'p3' && p3BasePositionRef.current && levelPath === '/levels/level2.json') {
          if (!p3MovementStateRef.current) { 
              const initialTargetPoint = p3InterestPointsRef.current[p3CurrentTargetIndexRef.current];
              p3MovementStateRef.current = {
                  startTime: loopStartTime,
                  startX: tile.x, startY: tile.y,
                  targetX: p3BasePositionRef.current.x + initialTargetPoint.x,
                  targetY: p3BasePositionRef.current.y + initialTargetPoint.y,
              };
          }
          const p3State = p3MovementStateRef.current;
          const elapsed = loopStartTime - p3State.startTime;
          const progress = Math.min(elapsed / P3_MOVEMENT_DURATION, 1);
          
          tile.x = p3State.startX + (p3State.targetX - p3State.startX) * progress;
          tile.y = p3State.startY + (p3State.targetY - p3State.startY) * progress;

          if (progress >= 1) {
              p3CurrentTargetIndexRef.current = (p3CurrentTargetIndexRef.current + 1) % p3InterestPointsRef.current.length;
              const nextTargetPoint = p3InterestPointsRef.current[p3CurrentTargetIndexRef.current];
              p3MovementStateRef.current = {
                  startTime: loopStartTime,
                  startX: tile.x, startY: tile.y,
                  targetX: p3BasePositionRef.current.x + nextTargetPoint.x,
                  targetY: p3BasePositionRef.current.y + nextTargetPoint.y,
              };
          }
      }

      if (tile.layer !== 'foreground') {
        if (tile.type === 1) { // Platform
            if (tile.id.startsWith("stone_") && assets.stoneImage?.complete) {
                 ctx.drawImage(assets.stoneImage, tile.x, tile.y, tile.width, tile.height);
            } else if (tile.id === "boat1" && assets.boatImage?.complete) {
                 ctx.drawImage(assets.boatImage, tile.x, tile.y, tile.width, tile.height);
            } else if (tile.id === "p3" && levelPath === "/levels/level2.json" && assets.tileImage?.complete) { 
                 ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
            } else if (assets.tileImage?.complete) {
                 ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
            } else {
                 ctx.fillStyle = tile.color;
                 ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
            }
        } else { // Decorative background
            if (tile.id === "tree1" && assets.tree1Image?.complete) { 
                 ctx.drawImage(assets.tree1Image, tile.x, tile.y, tile.width, tile.height);
            } else if (tile.id === "tree2" && assets.tree2Image?.complete) { 
                 ctx.drawImage(assets.tree2Image, tile.x, tile.y, tile.width, tile.height);
            } else if (tile.id.startsWith("tree_level1") && assets.tree2Image?.complete) { 
                 ctx.drawImage(assets.tree2Image, tile.x, tile.y, tile.width, tile.height);
            } else if (tile.id === "house1" && assets.houseImage?.complete) {
                 ctx.drawImage(assets.houseImage, tile.x, tile.y, tile.width, tile.height);
            } else {
                 ctx.fillStyle = tile.color;
                 ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
            }
        }
      }
    });
    
    setActiveCoins(prevCoins => prevCoins.map(coin => {
        let newCoin = { ...coin };
        if (!newCoin.isCollected && Date.now() >= newCoin.targetSpawnTime && newCoin.currentOpacity < 1) {
            const opacityIncrease = deltaTime / COIN_FADE_IN_DURATION;
            newCoin.currentOpacity = Math.min(1, newCoin.currentOpacity + opacityIncrease);
        }
        if (newCoin.isCollected && newCoin.particles.length > 0) {
            newCoin.particles = newCoin.particles.map(p => ({
                ...p,
                x: p.x + p.vx * COIN_PARTICLE_SPEED_MULTIPLIER * deltaTimeFactor,
                y: p.y + p.vy * COIN_PARTICLE_SPEED_MULTIPLIER * deltaTimeFactor + (GRAVITY * COIN_PARTICLE_GRAVITY_FACTOR * deltaTimeFactor),
                life: p.life - deltaTime,
                opacity: Math.max(0, (p.life - deltaTime) / COIN_PARTICLE_LIFESPAN),
            })).filter(p => p.life > 0);

            if (newCoin.particles.length === 0) {
                newCoin.isVisuallyPresent = false;
            }
        }
        if (newCoin.rotationSpeed !== 0) {
            newCoin.rotationAngle = (newCoin.rotationAngle + newCoin.rotationSpeed * deltaTimeFactor) % (Math.PI * 2);
        }
        return newCoin;
    }));
    renderCoins(ctx, activeCoins, assets.coinImage);
    
    setActiveEnemies(prevEnemies => prevEnemies.map(enemy => {
        let newEnemy = { ...enemy };
        newEnemy.x += newEnemy.vx * newEnemy.direction * deltaTimeFactor;
        if (newEnemy.x + newEnemy.radius * 2 > canvas.width && newEnemy.direction === 1) {
            newEnemy.x = canvas.width - newEnemy.radius * 2;
            newEnemy.direction = -1;
        } else if (newEnemy.x < 0 && newEnemy.direction === -1) {
            newEnemy.x = 0;
            newEnemy.direction = 1;
        }
        if (player && checkCollision(player, newEnemy)) {
            const p_ground = currentLevel.tiles.find(t => t.id === 'p_ground');
            if (p_ground) {
                player.x = canvas.width / 2 - player.width / 2;
                player.y = p_ground.y - player.height;
            } else { 
                player.x = canvas.width / 2 - player.width / 2;
                player.y = canvas.height - player.height;
            }
            player.vx = 0; player.vy = 0; player.isOnGround = true; player.activePlatformId = p_ground ? 'p_ground' : null;
            // toast({ title: "Ouch!", description: "Hit by an enemy!", variant: "destructive" });
        }
        return newEnemy;
    }));
    renderEnemies(ctx, activeEnemies);

    if (player) {
        const currentExecuteAction = executeActionRef.current;
        if (currentExecuteAction) {
            switch (currentExecuteAction) {
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
            if (resetExecuteAction) resetExecuteAction();
            executeActionRef.current = null;
        }

        player.vy += GRAVITY * deltaTimeFactor;
        if (player.isMovingLeft) player.vx = -PLAYER_SPEED;
        else if (player.isMovingRight) player.vx = PLAYER_SPEED;
        else player.vx = 0;

        let nextPlayerX = player.x + player.vx * deltaTimeFactor;
        let nextPlayerY = player.y + player.vy * deltaTimeFactor;
        
        let onGroundThisFrame = false;
        let currentActivePlatformId: string | null = null;
        
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
                        onGroundThisFrame = true;
                        currentActivePlatformId = tile.id;
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
        player.isOnGround = onGroundThisFrame;
        player.activePlatformId = currentActivePlatformId;

        const activePlatform = player.activePlatformId ? currentLevel.tiles.find(t => t.id === player.activePlatformId) : null;
        if (activePlatform && activePlatform.vx && activePlatform.direction) {
            player.x += activePlatform.vx * activePlatform.direction * deltaTimeFactor;
        }
         if (player.activePlatformId === 'p3' && levelPath === '/levels/level2.json') {
            const p3Tile = currentLevel.tiles.find(t => t.id === 'p3');
             if (p3Tile && p3MovementStateRef.current) {
                 // The player's Y should also adjust if P3 moves vertically.
                 // Calculate P3's vertical delta for this frame and apply it.
                 // This is simplified; true delta would require storing P3's prev Y.
                 // For now, this might not be perfectly smooth if P3 has vertical easing.
             }
        }

        if (player.y + player.height > canvas.height) {
            player.y = canvas.height - player.height;
            player.isOnGround = true;
            player.vy = 0;
            const groundPlatform = currentLevel.tiles.find(t => t.id === 'p_ground');
            player.activePlatformId = groundPlatform ? groundPlatform.id : null;
        }
        if (player.x < 0) player.x = 0;
        if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
        
        if (player.isMovingLeft) player.facingDirection = 'left';
        else if (player.isMovingRight) player.facingDirection = 'right';

        renderPlayer(ctx, player, assets.playerImage);

        activeCoins.forEach(coin => {
          if (!coin.isCollected && coin.isVisuallyPresent && coin.currentOpacity > 0.5 && checkCollision(player, coin)) {
            coin.isCollected = true;
            coin.collectionTime = Date.now();
            coin.particles = Array.from({ length: COIN_PARTICLE_COUNT }, () => ({
                x: coin.x + coin.width / 2,
                y: coin.y + coin.height / 2,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4 - 2, 
                size: COIN_PARTICLE_SIZE,
                opacity: 1,
                life: COIN_PARTICLE_LIFESPAN,
            }));
          }
        });
    }

    // Foreground elements
    currentLevel.tiles.forEach(tile => {
        if (tile.layer === 'foreground') {
           if ((tile.id.startsWith("bush_left_") || tile.id.startsWith("bush_right_") || tile.id.startsWith("bush_small")) && assets.smallBushImage?.complete) {
               ctx.drawImage(assets.smallBushImage, tile.x, tile.y, tile.width, tile.height);
           } else if (tile.id.startsWith("bush_large") && assets.largeBushImage?.complete) { 
               ctx.drawImage(assets.largeBushImage, tile.x, tile.y, tile.width, tile.height);
           } else {
               ctx.fillStyle = tile.color;
               ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
           }
        }
    });

    requestAnimationFrame(gameLoop);
  }, [
    isClient, assets, resetExecuteAction, levelPath,
    // No need to include activeCoins or activeEnemies here if using functional updates for them
    // However, since we're mapping over them, it's safer to include them or their setters if direct mutation happens
    activeCoins, activeEnemies, // Keep if directly read and potentially mutated
    setActiveCoins, setActiveEnemies, // Or include setters if using functional updates
    // Dependencies for P3 platform movement
    P3_MOVEMENT_DURATION,
    // Game config values
    GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_COLOR,
    COIN_FADE_IN_DURATION, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR,
    COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SIZE, COIN_ROTATION_SPEED_MAX,
    PLATFORM_SPEED, ENEMY_SPEED_FACTOR, ENEMY_COLOR, ENEMY_RADIUS,
    // Note: parentPlayerRef is a ref, its .current changes don't trigger re-render of GameCanvas
    // executeActionRef is also a ref, its .current changes don't trigger re-render here
    // p3 refs are also refs and stable
  ]);

  // Effect 9: Setup game loop
  useEffect(() => {
    console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasRef: ${!!canvasRef.current}, canvasSize: W${canvasSize.width}H${canvasSize.height}, processedLevel: ${!!processedLevel}`);
    
    let animationFrameId: number;
    const conditionsMet = isClient && !isLoading && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevel;
    console.log(`[GameCanvas Effect 9] Conditions: isClient=${isClient}, isLoading=${isLoading}, canvas=${!!canvasRef.current}, W=${canvasSize.width}, H=${canvasSize.height}, processedLevel=${!!processedLevel}. Met: ${conditionsMet}`);
    
    if (conditionsMet) {
      console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); 
      animationFrameId = requestAnimationFrame(gameLoop);
    } else {
      console.log("[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start.");
    }
    return () => {
      console.log("[GameCanvas Effect 9] Cleanup: Cancelling animation frame.");
      cancelAnimationFrame(animationFrameId);
    };
  }, [isClient, isLoading, canvasSize, processedLevel, gameLoop]); 


  console.log(`[GameCanvas] Rendering. isClient: ${isClient}, isLoading: ${isLoading}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);
  
  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      tabIndex={0} 
    />
  );
}

