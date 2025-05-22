
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
    return parseFloat(value); // Fallback for numbers as strings without unit
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

  // const { toast } = useToast();

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
      return { ...rawTile, x: tileX, y: tileY, width: tileWidth, height: tileHeight, vx: rawTile.vx, direction: rawTile.direction };
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
      vx: 0, vy: 0, isOnGround: false, isMovingLeft: false, isMovingRight: false,
      color: PLAYER_COLOR, image: assets.playerImage || undefined, facingDirection: 'right',
      activePlatformId: null,
    };
    playerInstanceRef.current = newPlayer;
    if (parentPlayerRef) parentPlayerRef.current = newPlayer;
    
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
        console.warn("[GameCanvas processRawLevelData] p_ground tile not found for Level 2, P3 positioning might be incorrect.");
    }
    console.log(`[processRawLevelData] Successfully processed. Player:`, newPlayer ? `X:${newPlayer.x.toFixed(0)} Y:${newPlayer.y.toFixed(0)}` : 'null', `Number of tiles: ${processedTiles.length}`);
    return { playerStart: { xPx: playerInitialX, yPx: playerInitialY }, tiles: processedTiles };
  }, [assets.playerImage, levelPath, parentPlayerRef]);

  const spawnNewCoinPair = useCallback(
    (currentProcessedLevelData: ProcessedLevelData | null, currentCanvasWidth: number, currentCanvasHeight: number): CoinState[] => {
      console.log(`[spawnNewCoinPair] Called. Canvas W:${currentCanvasWidth}, H:${currentCanvasHeight}. ProcessedLevel exists: ${!!currentProcessedLevelData}`);
      if (!currentProcessedLevelData || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
        console.warn("[spawnNewCoinPair] Pre-conditions not met (no level or zero canvas size). No coins spawned.");
        return [];
      }
  
      const p_ground = currentProcessedLevelData.tiles.find(tile => tile.id === 'p_ground');
      if (!p_ground) {
        console.warn("[spawnNewCoinPair] p_ground tile not found. Cannot determine spawn zone. No coins spawned.");
        return [];
      }
      const p_groundTopY = p_ground.y;
  
      const gamePlatforms = currentProcessedLevelData.tiles.filter(tile => tile.type === 1 && tile.id !== 'p_ground' && tile.id !== 'p3');
      let actualHighestPlatformTopY = p_groundTopY; 
      if (gamePlatforms.length > 0) {
        actualHighestPlatformTopY = Math.min(...gamePlatforms.map(p => p.y));
      }
      
      const ySpawnZoneBottomCoinTopEdge = p_groundTopY - COIN_VERTICAL_SPAWN_BOTTOM_OFFSET - COIN_SIZE;
      const ySpawnZoneTopCoinTopEdge = actualHighestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;
  
      if (ySpawnZoneTopCoinTopEdge >= ySpawnZoneBottomCoinTopEdge) {
        console.warn(`[spawnNewCoinPair] Invalid spawn zone: Top edge (${ySpawnZoneTopCoinTopEdge}) is not below Bottom edge (${ySpawnZoneBottomCoinTopEdge}). No coins spawned.`);
        return [];
      }
  
      const newCoins: CoinState[] = [];
      const numberOfCoinsToSpawn = 10;
  
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
      console.log(`[spawnNewCoinPair] Created ${newCoins.length} coins.`);
      return newCoins;
    }, []
  );

  const spawnSingleEnemy = useCallback((currentProcessedLevelData: ProcessedLevelData | null, currentCanvasWidth: number): EnemyState | null => {
    if (!currentProcessedLevelData) return null;

    const p1 = currentProcessedLevelData.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
    const p2 = currentProcessedLevelData.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');

    if (!p1 || !p2) {
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

  }, [isClient]); // isClient is the only true dependency here

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
    }
  }, [canvasSize]);

  // Effect 3: Observe parent element size and update canvasSize state
  useEffect(() => {
    console.log(`[GameCanvas Effect 3] Running: Observe parent size. isClient: ${isClient}`);
    if (!isClient || !canvasRef.current?.parentElement) {
        console.log(`[GameCanvas Effect 3] Not client or no parentElement. isClient: ${isClient}, parent: ${!!canvasRef.current?.parentElement}`);
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

    updateCanvasSizeState(); // Initial call
    const resizeObserver = new ResizeObserver(updateCanvasSizeState);
    resizeObserver.observe(parentElement);
    console.log("[GameCanvas Effect 3] ResizeObserver observing parent.");
    
    const handleWindowResize = () => { updateCanvasSizeState(); };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      console.log("[GameCanvas Effect 3] Cleanup: ResizeObserver disconnected, window resize listener removed.");
    };
  }, [isClient]); // Depends only on isClient

  // Effect 4: Load raw level data (initiates loading sequence)
  useEffect(() => {
    console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      console.log(`[GameCanvas Effect 4] Not client or no levelPath, returning. isClient: ${isClient}, levelPath: ${levelPath}`);
      return;
    }
    
    console.log(`[GameCanvas Effect 4] Initiating new level load for: ${levelPath}. Setting isLoading to true, clearing old data.`);
    setIsLoading(true);
    setRawLevelData(null); 
    setProcessedLevel(null);
    processedLevelRef.current = null; 
    playerInstanceRef.current = null;
    if(parentPlayerRef) parentPlayerRef.current = null;
    setActiveCoins([]);
    setActiveEnemies([]);

    loadLevel(levelPath).then(data => {
      if (data) {
        console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
        setRawLevelData(data);
      } else {
        console.error(`[GameCanvas Effect 4] Failed to load rawLevelData for ${levelPath}.`);
        setRawLevelData(null); // Ensure it's null on failure
      }
    }).catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null); // Ensure it's null on error
    });
  }, [levelPath, isClient, parentPlayerRef, setIsLoading, setRawLevelData, setProcessedLevel, setActiveCoins, setActiveEnemies ]);


  // Effect 5: Process raw level data
  useEffect(() => {
    console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${allAssetsLoaded}`);
    
    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded) {
      console.log(`[GameCanvas Effect 5] Conditions not met for processing. isClient:${isClient}, rawLevelData:${!!rawLevelData}, canvasW:${canvasSize.width}, allAssetsLoaded:${allAssetsLoaded}`);
      if (processedLevelRef.current !== null) { // Clear if previously processed
        console.log("[GameCanvas Effect 5] Clearing processedLevel due to unmet conditions.");
        setProcessedLevel(null);
        processedLevelRef.current = null;
        playerInstanceRef.current = null;
        if (parentPlayerRef) parentPlayerRef.current = null;
      }
      return;
    }
    console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
    const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
    
    if (newProcessedLevel) {
      console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel.");
      setProcessedLevel(newProcessedLevel);
      // playerInstanceRef is set inside processRawLevelData
    } else {
      console.error("[GameCanvas Effect 5] processRawLevelData returned null. Level processing failed.");
      setProcessedLevel(null);
      playerInstanceRef.current = null; 
      if (parentPlayerRef) parentPlayerRef.current = null;
    }
  }, [isClient, rawLevelData, canvasSize, allAssetsLoaded, processRawLevelData, parentPlayerRef, setProcessedLevel, p3BasePositionRef, p3InterestPointsRef, p3CurrentTargetIndexRef, p3MovementStateRef]);


  // Effect 6: Update processedLevelRef when processedLevel state changes
  useEffect(() => {
    processedLevelRef.current = processedLevel;
    console.log("[GameCanvas Effect 6] processedLevelRef.current updated:", processedLevel ? `Tiles: ${processedLevel.tiles.length}` : "null");
  }, [processedLevel]);


  // Effect 7: Spawn entities and finish loading
  useEffect(() => {
    console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevel}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoins.length}`);
    
    if (!isLoading) {
        console.log("[GameCanvas Effect 7] isLoading is false, skipping main spawn logic.");
        return;
    }

    if (!isClient || canvasSize.width === 0 || canvasSize.height === 0) {
        console.log(`[GameCanvas Effect 7] Pre-conditions (isClient, canvasSize) not met. isClient: ${isClient}, canvasW: ${canvasSize.width}`);
        return;
    }
    
    // If processedLevel is null, it means level loading/processing failed. We should stop loading.
    if (!processedLevel) {
        console.warn("[GameCanvas Effect 7] processedLevel is null. Setting isLoading to false. Game may not display level elements or show error on canvas.");
        setActiveCoins([]); // Clear any potential old coins
        setActiveEnemies([]); // Clear any potential old enemies
        setIsLoading(false);
        return;
    }
    
    // At this point, isLoading is true, and all basic pre-conditions are met.
    // processedLevel also exists.

    let coinsAttempted = false;
    if (activeCoins.length === 0 && processedLevel.tiles.length > 0) {
        console.log(`[GameCanvas Effect 7] Spawning new coin pair for level ${levelPath}`);
        const newCoins = spawnNewCoinPair(processedLevel, canvasSize.width, canvasSize.height);
        console.log(`[GameCanvas Effect 7] spawnNewCoinPair returned ${newCoins.length} coins. Setting activeCoins.`);
        setActiveCoins(newCoins);
        coinsAttempted = true;
    } else if (activeCoins.length > 0 || processedLevel.tiles.length === 0) {
        coinsAttempted = true; // Coins exist or not needed
    }

    let enemiesAttempted = false;
    if (levelPath !== '/levels/level2.json' && levelPath !== '/levels/level1.json') {
        if (activeEnemies.length === 0 && processedLevel.tiles.length > 0) {
            const newEnemy = spawnSingleEnemy(processedLevel, canvasSize.width);
            if (newEnemy) setActiveEnemies([newEnemy]);
            enemiesAttempted = true;
        } else if (activeEnemies.length > 0 || processedLevel.tiles.length === 0) {
            enemiesAttempted = true;
        }
    } else {
        console.log(`[GameCanvas Effect 7] Enemies not spawned for level: ${levelPath}`);
        enemiesAttempted = true; 
    }
    
    if (coinsAttempted && enemiesAttempted) {
        console.log("[GameCanvas Effect 7] All entities attempted or not needed. Setting isLoading to false.");
        setIsLoading(false);
    } else {
         console.log(`[GameCanvas Effect 7] Not all entities attempted. coinsAttempted: ${coinsAttempted}, enemiesAttempted: ${enemiesAttempted}. isLoading remains true.`);
    }
  }, [
    isClient, isLoading, processedLevel, canvasSize, levelPath, 
    activeCoins.length, activeEnemies.length, // To re-evaluate if entities are needed
    spawnNewCoinPair, spawnSingleEnemy, 
    setActiveCoins, setActiveEnemies, setIsLoading
  ]);


  // Effect 8: Check coin respawn
  useEffect(() => {
    console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, processedLevel: ${!!processedLevelRef.current}`);
    if (isLoading || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) return;

    const allCollectedAndParticlesGone = activeCoins.length > 0 && activeCoins.every(c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent);
    if (allCollectedAndParticlesGone) {
        console.log("[GameCanvas Effect 8] All coins collected and particles gone, spawning new pair.");
        setActiveCoins(spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height));
    }
  }, [activeCoins, isLoading, canvasSize, spawnNewCoinPair, setActiveCoins]); // processedLevelRef.current is not a state/prop, so not direct dep.

  // Effect for handling executeAction prop changes
  useEffect(() => {
    executeActionRef.current = executeAction;
  }, [executeAction]);

  const gameLoop = useCallback(() => {
    const currentExecuteAction = executeActionRef.current;
    const player = playerInstanceRef.current;
    const currentLevel = processedLevelRef.current; // Read from ref
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;

    if (!ctx || !canvas) {
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      return;
    }
    
    if (!currentLevel) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; // Semi-transparent overlay
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
                 if (hadHorizontalCollisionWithThisTile && tile.id !== 'p_ground') { // Don't prevent landing on p_ground if also side collision
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
            const targetDrift = p3InterestPointsRef.current[p3CurrentTargetIndexRef.current];
            p3MovementStateRef.current = {
                startTime: loopStartTime,
                startX: p3Tile.x,
                startY: p3Tile.y,
                targetX: p3BasePositionRef.current.x + targetDrift.x,
                targetY: p3BasePositionRef.current.y + targetDrift.y,
            };
        }
    }
    
    currentLevel.tiles.forEach(tile => {
      if (tile.id !== 'p3' && tile.vx && tile.direction) { 
        let newX = tile.x + (tile.vx * tile.direction * deltaTimeFactor);
        let tileMovementBoundary = canvas.width;
        if (tile.id === 'boat1') {
            const water = currentLevel.tiles.find(t => t.id === 'water_area');
            if (water) tileMovementBoundary = water.x + water.width; 
        }

        if (newX + tile.width > tileMovementBoundary) {
          newX = tileMovementBoundary - tile.width; 
          tile.direction *= -1;             
        } 
        else if (newX < (tile.id === 'boat1' && currentLevel.tiles.find(t => t.id === 'water_area') ? currentLevel.tiles.find(t => t.id === 'water_area')!.x : 0) ) {
          newX = (tile.id === 'boat1' && currentLevel.tiles.find(t => t.id === 'water_area') ? currentLevel.tiles.find(t => t.id === 'water_area')!.x : 0);                         
          tile.direction *= -1;             
        }
        tile.x = newX;
      }
    });

    if (player.y + player.height > canvas.height) {
        player.y = canvas.height - player.height;
        player.isOnGround = true; player.vy = 0;
        const groundTile = currentLevel.tiles.find(t => t.id === 'p_ground' && player.y + player.height >= t.y && player.y <= t.y + t.height);
        player.activePlatformId = groundTile ? groundTile.id : null;
    }
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;

    if (parentPlayerRef) parentPlayerRef.current = { ...player };

    setActiveCoins(prevCoins => prevCoins.map(coin => {
      let newOpacity = coin.currentOpacity;
      let newParticles = [...coin.particles];
      let isVisuallyPresent = coin.isVisuallyPresent;

      if (!coin.isCollected && loopStartTime >= coin.targetSpawnTime && coin.currentOpacity < 1) {
        newOpacity = Math.min(1, coin.currentOpacity + (deltaTime / COIN_FADE_IN_DURATION));
      } else if (coin.isCollected && coin.particles.length === 0 && coin.isVisuallyPresent) { 
        for (let i = 0; i < COIN_PARTICLE_COUNT; i++) {
          newParticles.push({
            x: coin.x + coin.width / 2, y: coin.y + coin.height / 2,
            vx: (Math.random() - 0.5) * PLAYER_SPEED * COIN_PARTICLE_SPEED_MULTIPLIER,
            vy: (Math.random() - 0.5) * PLAYER_SPEED * COIN_PARTICLE_SPEED_MULTIPLIER - 2,
            size: COIN_PARTICLE_SIZE, opacity: 1, life: COIN_PARTICLE_LIFESPAN,
          });
        }
        isVisuallyPresent = false; 
        newOpacity = 0; 
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
    }));

    if (player) {
      setActiveCoins(prevCoins =>
        prevCoins.map(coin => {
          if (!coin.isCollected && coin.isVisuallyPresent && coin.currentOpacity > 0.5 && 
              checkCollision(player!, { x: coin.x, y: coin.y, width: coin.width, height: coin.height })) {
            return { ...coin, isCollected: true, collectionTime: Date.now() };
          }
          return coin;
        })
      );
    }

    setActiveEnemies(prevEnemies => prevEnemies.map(enemy => {
      let newEnemyX = enemy.x + (enemy.vx * enemy.direction * deltaTimeFactor);
      if (newEnemyX + enemy.width > canvas.width || newEnemyX < 0) {
        enemy.direction *= -1;
        newEnemyX = enemy.x + (enemy.vx * enemy.direction * deltaTimeFactor); 
      }
      return { ...enemy, x: newEnemyX };
    }));

    if (player) {
      activeEnemies.forEach(enemy => {
        if (checkCollision(player!, enemy)) {
          const ground = currentLevel.tiles.find(t => t.id === 'p_ground');
          if (ground) {
            player.x = canvas.width / 2 - player.width / 2;
            player.y = ground.y - player.height;
            player.vx = 0; player.vy = 0; player.isOnGround = true;
            player.activePlatformId = ground.id;
          } else { 
            player.x = canvas.width / 2 - player.width / 2;
            player.y = canvas.height - player.height; 
            player.vx = 0; player.vy = 0; player.isOnGround = true;
            player.activePlatformId = null;
          }
        }
      });
    }
    
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
      isClient, assets, resetExecuteAction, 
      parentPlayerRef, levelPath, 
      setActiveCoins, setActiveEnemies, 
      p3BasePositionRef, p3InterestPointsRef, p3CurrentTargetIndexRef, p3MovementStateRef,
      spawnNewCoinPair, spawnSingleEnemy, // Added useCallback-wrapped functions
      // No isLoading, canvasSize, processedLevel here. Game loop should use refs for them.
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
      console.log(`[GameCanvas Effect 9] Conditions NOT MET. Game loop will not start. isClient:${isClient}, !isLoading:${!isLoading}, canvasRef:${!!canvasRef.current}, canvasW:${canvasSize.width}, canvasH:${canvasSize.height}, processedLevel:${!!processedLevel}`);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    }
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
        console.log("[GameCanvas Effect 9] Cleanup: Game loop cancelled.");
      }
    };
  }, [isClient, isLoading, canvasSize, processedLevel, gameLoop]);
  

  console.log(`[GameCanvas] Rendering. isClient: ${isClient}, isLoading: ${isLoading}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);
  if (!isClient) {
    return null; // Or a placeholder if preferred for SSR, though dynamic import should handle this.
  }

  // This is a simplified render path. The game loop handles the actual drawing on the canvas.
  // We only render the canvas element itself here.
  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block', // Default for canvas, good to be explicit
        width: '100%',    // Let CSS handle display width
        height: '100%',   // Let CSS handle display height
        // outline: '2px solid hotpink', // For debugging canvas bounds
        // backgroundColor: 'rgba(0, 0, 255, 0.1)', // For debugging canvas visibility
      }}
      aria-label="Game Canvas"
    />
  );
}
