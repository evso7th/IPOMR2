
"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState, GameStats } from '@/types/game';
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
  onGameStatsUpdate?: (stats: GameStats) => void;
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
  // console.warn(`[parseDimension] Unexpected value type: ${typeof value}, value: ${value}`);
  return 0;
};


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
  // const activeEnemiesRef = useRef<EnemyState[]>(activeEnemies); // Not used yet, direct state access in gameLoop

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

  // const { toast } = useToast();


  const processRawLevelData = useCallback((
    rawDataToProcess: RawLevelData,
    currentCanvasWidth: number,
    currentCanvasHeight: number
  ): ProcessedLevelData | null => {
    // console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
    if (!rawDataToProcess || currentCanvasWidth === 0 || currentCanvasHeight === 0) {
      // console.warn("[GameCanvas processRawLevelData] Pre-conditions not met. Returning null.");
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
          // console.warn(`[processRawLevelData] Unknown anchor: ${rawTile.positioning.anchor} for tile id: ${rawTile.id}. Defaulting to top-left with offset.`);
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
    // Ensure player is not embedded in the platform if yOffset is negative
    const playerInitialY = playerStartPlatform.y - PLAYER_HEIGHT + Math.min(0, (rawDataToProcess.playerStart.yOffsetPx || 0));


    const newPlayer: PlayerState = {
      x: playerInitialX,
      y: playerInitialY,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      vx: 0, vy: 0, isOnGround: false, isMovingLeft: false, isMovingRight: false,
      color: PLAYER_COLOR, image: assets.playerImageLoaded ? assets.playerImage ?? undefined : undefined, facingDirection: 'right',
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
    return { playerStart: { xPx: playerInitialX, yPx: playerInitialY }, tiles: processedTiles };
  }, [assets.playerImage, assets.playerImageLoaded, levelPath, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR, P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE]);


  // Full spawnNewCoinPair logic
  const spawnNewCoinPair = useCallback(
    (currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number, currentCanvasHeight: number): CoinState[] => {
      console.log(`[spawnNewCoinPair] FULL LOGIC Called for pair index ${currentPairIndexRef.current}. Canvas W:${currentCanvasWidth}, H:${currentCanvasHeight}. ProcessedLevel exists: ${!!currentProcessedLevel}`);
      if (!currentProcessedLevel || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
        console.warn("[spawnNewCoinPair] Pre-conditions not met (no level or zero canvas size). No coins spawned.");
        return [];
      }

      const p_ground = currentProcessedLevel.tiles.find(t => t.id === 'p_ground');
      if (!p_ground) {
        console.warn("[spawnNewCoinPair] p_ground tile not found. Cannot determine coin spawn zone. No coins spawned.");
        return [];
      }
      const p_groundTopY = p_ground.y;

      const gamePlatforms = currentProcessedLevel.tiles.filter(tile => tile.type === 1 && tile.id !== 'p_ground' && tile.id !== 'p_top_boundary');
      let actualHighestPlatformTopY = p_groundTopY; // Default to p_ground if no other platforms

      if (gamePlatforms.length > 0) {
        actualHighestPlatformTopY = Math.min(...gamePlatforms.map(p => p.y));
      }
      
      const ySpawnZoneBottomCoinTopEdge = p_groundTopY - COIN_VERTICAL_SPAWN_BOTTOM_OFFSET - COIN_SIZE;
      const ySpawnZoneTopCoinTopEdge = actualHighestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;

      if (ySpawnZoneTopCoinTopEdge >= ySpawnZoneBottomCoinTopEdge) {
        console.warn(`[spawnNewCoinPair] Invalid spawn zone: Top edge (${ySpawnZoneTopCoinTopEdge}) is not above Bottom edge (${ySpawnZoneBottomCoinTopEdge}). No coins spawned.`);
        return [];
      }
      
      const newCoins: CoinState[] = [];
      // Spawn exactly 2 coins for the current pair
      for (let i = 0; i < 2; i++) {
        let xPos;
        if (i === 0) { // First coin of the pair on the left
          xPos = Math.random() * (currentCanvasWidth / 2 - COIN_SIZE);
        } else { // Second coin of the pair on the right
          xPos = currentCanvasWidth / 2 + Math.random() * (currentCanvasWidth / 2 - COIN_SIZE);
        }
        const yPos = ySpawnZoneTopCoinTopEdge + Math.random() * (ySpawnZoneBottomCoinTopEdge - ySpawnZoneTopCoinTopEdge);

        const coin: CoinState = {
          id: `coin-${Date.now()}-${currentPairIndexRef.current}-${i}`,
          x: xPos,
          y: yPos,
          width: COIN_SIZE,
          height: COIN_SIZE,
          isCollected: false,
          targetSpawnTime: Date.now() + (i * COIN_SPAWN_STAGGER_DELAY),
          currentOpacity: 0,
          particles: [],
          isVisuallyPresent: true,
          rotationAngle: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() * (COIN_ROTATION_SPEED_MAX - COIN_ROTATION_SPEED_MIN)) + COIN_ROTATION_SPEED_MIN,
        };
        newCoins.push(coin);
      }
      console.log(`[spawnNewCoinPair] FULL LOGIC: Created ${newCoins.length} coins for pair ${currentPairIndexRef.current}:`, JSON.parse(JSON.stringify(newCoins.map(c=>({id:c.id, x:c.x.toFixed(0), y:c.y.toFixed(0), isCollected: c.isCollected})))));
      return newCoins;
    },
    [COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT, COIN_SPAWN_STAGGER_DELAY, COIN_ROTATION_SPEED_MAX, COIN_ROTATION_SPEED_MIN]
  );


  const spawnSingleEnemy = useCallback((currentProcessedLevelData: ProcessedLevelData | null, currentCanvasWidth: number): EnemyState | null => {
    if (!currentProcessedLevelData) return null;
    const p1 = currentProcessedLevelData.tiles.find(t => t.id === 'p1' || t.id === 'floating_platform_left' || t.id === 'floating_platform_1');
    const p2 = currentProcessedLevelData.tiles.find(t => t.id === 'p2' || t.id === 'floating_platform_right' || t.id === 'floating_platform_2');
    if (!p1 || !p2) {
       // console.warn("[spawnSingleEnemy] Could not find p1 or p2 platforms to determine enemy Y position.");
       return null;
    }
    const p1CenterY = p1.y + p1.height / 2;
    const p2CenterY = p2.y + p2.height / 2;
    const enemyY = (p1CenterY + p2CenterY) / 2 - ENEMY_RADIUS;
    return {
      id: `enemy-${Date.now()}`, x: ENEMY_RADIUS, y: enemyY, radius: ENEMY_RADIUS,
      width: ENEMY_RADIUS * 2, height: ENEMY_RADIUS * 2,
      vx: PLATFORM_SPEED * ENEMY_SPEED_FACTOR, direction: 1, color: ENEMY_COLOR,
    };
  }, [ENEMY_RADIUS, ENEMY_COLOR, PLATFORM_SPEED, ENEMY_SPEED_FACTOR]);


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
    // console.log(`[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize: ${JSON.stringify(canvasSize)}`);
    if (canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      // console.log(`[GameCanvas Effect 2] Canvas attributes set to W:${canvasSize.width}, H:${canvasSize.height}`);
      if (!ctxRef.current) {
        ctxRef.current = canvasRef.current.getContext('2d');
        // console.log(`[GameCanvas Effect 2] Canvas context ${ctxRef.current ? 'obtained' : 'NOT obtained'}.`);
      }
    }
  }, [canvasSize]);


  // Effect 3: Observe parent element size and update canvasSize state
  useEffect(() => {
    // console.log(`[GameCanvas Effect 3] Running: Observe parent size. isClient: ${isClient}`);
    if (!isClient || !canvasRef.current?.parentElement) {
      return;
    }
    const parentElement = canvasRef.current.parentElement;

    const updateCanvasSizeState = () => {
      const newWidth = parentElement.clientWidth;
      const newHeight = parentElement.clientHeight;
      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          if ((newWidth > 0 && newHeight > 0) || (newWidth === 0 && newHeight === 0 && (currentSize.width !== 0 || currentSize.height !== 0) )) {
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
    
    console.log(`[GameCanvas Effect 4] INITIATING NEW LEVEL LOAD for ${levelPath}. Resetting states.`);
    setIsLoading(true); 
    setRawLevelData(null); 
    setProcessedLevel(null); 
    processedLevelRef.current = null;
    setActiveCoins([]); 
    setCurrentPairIndex(0); 
    setActiveEnemies([]); 
    playerInstanceRef.current = null; 
    if(parentPlayerRef) parentPlayerRef.current = null;
    
    loadLevel(levelPath).then(data => {
      if (data) {
        setRawLevelData(data);
      } else {
        setRawLevelData(null); // Ensure rawLevelData is null on error
      }
    }).catch(error => {
        console.error(`[GameCanvas Effect 4] Error loading level ${levelPath}:`, error);
        setRawLevelData(null);
    });
  }, [levelPath, isClient, parentPlayerRef, setIsLoading, setRawLevelData, setProcessedLevel, setActiveCoins, setActiveEnemies, setCurrentPairIndex]);


  // Effect 5: Process raw level data
  useEffect(() => {
    // console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${allAssetsLoaded}`);
    
    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded) {
      if (processedLevelRef.current !== null) {
        setProcessedLevel(null); 
        processedLevelRef.current = null;
        playerInstanceRef.current = null; 
        if (parentPlayerRef) parentPlayerRef.current = null;
      }
      return;
    }

    const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);

    if (newProcessedLevel) {
      setProcessedLevel(newProcessedLevel);
      if (playerInstanceRef.current && parentPlayerRef) {
        parentPlayerRef.current = playerInstanceRef.current;
      }
    } else {
      setProcessedLevel(null);
      playerInstanceRef.current = null;
      if (parentPlayerRef) parentPlayerRef.current = null;
    }
  }, [
    isClient, rawLevelData, canvasSize, allAssetsLoaded, 
    processRawLevelData, parentPlayerRef, 
    setProcessedLevel 
  ]);


  // Effect 6: Update refs when states change
  useEffect(() => { 
    activeCoinsRef.current = activeCoins; 
    // console.log(`[GameCanvas Effect for activeCoins STATE] activeCoins updated in state (${activeCoins.length} coins):`, JSON.parse(JSON.stringify(activeCoins.map(c=>({id:c.id, x:c.x.toFixed(0),y:c.y.toFixed(0),isCollected: c.isCollected})))));
  }, [activeCoins]);
  useEffect(() => { currentPairIndexRef.current = currentPairIndex; }, [currentPairIndex]);
  useEffect(() => { executeActionRef.current = executeAction; }, [executeAction]);
  useEffect(() => { 
    processedLevelRef.current = processedLevel; 
    // console.log("[GameCanvas Effect for processedLevelRef] processedLevelRef.current updated:", processedLevelRef.current ? "Exists" : "null");
  }, [processedLevel]);


  // Effect to update game stats for GameHeader
  useEffect(() => {
    if (onGameStatsUpdate) {
      const uncollectedInPair = activeCoinsRef.current.filter(c => !c.isCollected && c.isVisuallyPresent).length;
      const currentPairDisplayForStats = currentPairIndexRef.current ; 

      // console.log(`[GameCanvas Stats Update] Uncollected in pair: ${uncollectedInPair}, Current Pair Idx (0-based): ${currentPairDisplayForStats}, Total Pairs: ${NUMBER_OF_COIN_PAIRS}`);
      onGameStatsUpdate({
        uncollectedInPair: uncollectedInPair, // This might be total uncollected if pair logic is off
        currentPairNum: currentPairDisplayForStats, 
        totalPairsNum: NUMBER_OF_COIN_PAIRS,
      });
    }
  }, [activeCoins, currentPairIndex, onGameStatsUpdate]);


  // Effect 7: Initial entity spawn and finish loading
  useEffect(() => {
    console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevelRef.current}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoins.length}`);
    
    if (!isClient || canvasSize.width === 0 || canvasSize.height === 0) {
        console.log(`[GameCanvas Effect 7] Pre-conditions (isClient, canvasSize) not met for entity spawn, returning.`);
        return; 
    }

    if (!isLoading) { 
        console.log(`[GameCanvas Effect 7] isLoading is false, skipping logic (already loaded or loading finished).`);
        return;
    }

    if (!processedLevelRef.current) {
        console.log(`[GameCanvas Effect 7] processedLevel is still null. Setting isLoading to false to prevent stall. Game may not display level elements or entities.`);
        setActiveCoins([]); // Ensure coins are clear if level isn't ready
        setActiveEnemies([]);
        setIsLoading(false);
        return;
    }
    
    let coinsAttempted = false;
    if (activeCoins.length === 0 && processedLevelRef.current.tiles.length > 0 && currentPairIndexRef.current === 0) {
        console.log(`[GameCanvas Effect 7] Spawning INITIAL coin pair (index ${currentPairIndexRef.current}) for level ${levelPath}`);
        const newCoins = spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height);
        console.log(`[GameCanvas Effect 7] spawnNewCoinPair for initial pair returned ${newCoins.length} coins. Setting activeCoins.`);
        setActiveCoins(newCoins);
        coinsAttempted = true;
    } else if (activeCoins.length > 0 || processedLevelRef.current.tiles.length === 0 || currentPairIndexRef.current !== 0) {
        coinsAttempted = true; 
    }


    let enemiesAttempted = false;
    if (levelPath !== '/levels/level2.json' && levelPath !== '/levels/level1.json') {
        if (activeEnemies.length === 0 && processedLevelRef.current.tiles.length > 0) {
            const newEnemy = spawnSingleEnemy(processedLevelRef.current, canvasSize.width);
            if (newEnemy) setActiveEnemies([newEnemy]);
            enemiesAttempted = true;
        } else if (activeEnemies.length > 0 || processedLevelRef.current.tiles.length === 0) {
             enemiesAttempted = true;
        }
    } else {
        enemiesAttempted = true; 
    }
    
    if (coinsAttempted && enemiesAttempted) {
        console.log("[GameCanvas Effect 7] All entities attempted or not needed, setting isLoading to false.");
        setIsLoading(false);
    } else {
         console.log(`[GameCanvas Effect 7] Entities not yet fully attempted. isLoading: ${isLoading} coinsAttempted: ${coinsAttempted}, enemiesAttempted: ${enemiesAttempted}`);
    }
  }, [
    isClient, isLoading, processedLevel, canvasSize, levelPath, 
    // activeCoins.length, activeEnemies.length, // Removed to avoid re-triggering if only these change while isLoading=false
    spawnNewCoinPair, spawnSingleEnemy, 
    setActiveCoins, setActiveEnemies, setIsLoading
  ]);

  // Effect 8: Check if current coin pair is collected and advance to the next if so
  useEffect(() => {
    console.log(`[GameCanvas Effect 8] Running. activeCoinsRef.current length: ${activeCoinsRef.current.length}, currentPairIndex: ${currentPairIndexRef.current}, isLoading: ${isLoading}`);
    if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
      console.log(`[GameCanvas Effect 8] Pre-conditions not met, returning.`);
      return;
    }

    if (activeCoinsRef.current.length === 0 && currentPairIndexRef.current < NUMBER_OF_COIN_PAIRS) {
      console.log(`[GameCanvas Effect 8] activeCoins is empty, but currentPairIndex ${currentPairIndexRef.current} suggests a pair should be active. This might indicate an issue or end of pairs.`);
      // This could be where we trigger the next pair if the previous was just cleared
      return;
    }
    
    console.log(`[GameCanvas Effect 8] Checking collection for ${activeCoinsRef.current.length} coins. Pair Index: ${currentPairIndexRef.current}`);
    activeCoinsRef.current.forEach(c => {
      console.log(`[GameCanvas Effect 8] Coin ${c.id.slice(-5)}: collected=${c.isCollected}, particles=${c.particles.length}, present=${c.isVisuallyPresent}`);
    });


    const allCollectedAndParticlesGone =
      activeCoinsRef.current.length > 0 && // Only proceed if there are coins to check
      activeCoinsRef.current.every(c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent);

    console.log(`[GameCanvas Effect 8] allCollectedAndParticlesGone: ${allCollectedAndParticlesGone}`);

    if (allCollectedAndParticlesGone) {
      console.log(`[GameCanvas Effect 8] All coins in current pair ${currentPairIndexRef.current} collected and particles gone.`);
      const currentPairVal = currentPairIndexRef.current; 
      const nextPairIdx = currentPairVal + 1;

      console.log(`[GameCanvas Effect 8] Current pair ${currentPairVal} fully cleared. Next pair index would be ${nextPairIdx}.`);
      
      // Crucial: Clear current coins BEFORE incrementing index to trigger next spawn correctly
      console.log("[GameCanvas Effect 8] Calling setActiveCoins([]) to clear old pair.");
      setActiveCoins([]); 

      if (nextPairIdx < NUMBER_OF_COIN_PAIRS) { 
        console.log(`[GameCanvas Effect 8] Advancing to pair index: ${nextPairIdx}`);
        setCurrentPairIndex(nextPairIdx);
      } else {
        console.log(`[GameCanvas Effect 8] All ${NUMBER_OF_COIN_PAIRS} pairs collected and cleared. No more coins for this level round.`);
        setCurrentPairIndex(nextPairIdx); // Set to NUMBER_OF_COIN_PAIRS to indicate completion.
      }
    }
  }, [activeCoins, isClient, isLoading, canvasSize, processedLevel, setActiveCoins, setCurrentPairIndex, NUMBER_OF_COIN_PAIRS]);


  // Effect 8.5: Spawns a new pair when currentPairIndex changes (and conditions are met)
  useEffect(() => {
    console.log(`[GameCanvas Effect 8.5] Running. currentPairIndex: ${currentPairIndex}, activeCoins.length: ${activeCoins.length}, isLoading: ${isLoading}`);

    if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
      console.log(`[GameCanvas Effect 8.5] Pre-conditions (isLoading, isClient, processedLevel, canvasSize) not met, returning.`);
      return;
    }
    
    if (currentPairIndex >= NUMBER_OF_COIN_PAIRS) {
        console.log(`[GameCanvas Effect 8.5] currentPairIndex (${currentPairIndex}) is >= NUMBER_OF_COIN_PAIRS (${NUMBER_OF_COIN_PAIRS}). No spawn.`);
        if(activeCoins.length > 0) { // Should have been cleared by Effect 8
            console.warn(`[GameCanvas Effect 8.5] Active coins not empty even though all pairs should be done. Clearing.`);
            setActiveCoins([]); 
        }
        return;
    }
    
    if (activeCoins.length === 0 && currentPairIndex < NUMBER_OF_COIN_PAIRS) { 
        console.log(`[GameCanvas Effect 8.5] Conditions met for spawning pair index: ${currentPairIndex}. activeCoins is empty.`);
        const newPair = spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height);
        console.log(`[GameCanvas Effect 8.5] spawnNewCoinPair for index ${currentPairIndex} returned ${newPair.length} coins with IDs: ${newPair.map(c=>c.id).join(', ')}. Setting activeCoins.`);
        setActiveCoins(newPair);
    } else {
        console.log(`[GameCanvas Effect 8.5] Not spawning. activeCoins.length is ${activeCoins.length} (expected 0) or currentPairIndex ${currentPairIndex} is out of bounds.`);
    }
  }, [currentPairIndex, isLoading, isClient, spawnNewCoinPair, setActiveCoins, NUMBER_OF_COIN_PAIRS, canvasSize.width, canvasSize.height, processedLevel]); // Added processedLevel

  const gameLoop = useCallback(() => {
    // console.log("[gameLoop] CALLED");
    const player = playerInstanceRef.current;
    const currentLevel = processedLevelRef.current; 
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;

    if (!ctx || !canvas) {
      // console.warn("[gameLoop] No context or canvas, requesting next frame.");
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
      return;
    }
    
    if (!currentLevel) {
      // console.warn("[gameLoop] No currentLevel, drawing error message.");
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
      // console.warn("[gameLoop] No player instance, requesting next frame.");
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
      // console.log(`[gameLoop] ACTION: ${currentExecuteActionVal}, Player Y: ${player.y.toFixed(2)}, Player VY: ${player.vy.toFixed(2)}, IsOnGround: ${player.isOnGround}`);
      switch (currentExecuteActionVal) {
        case 'moveLeft': player.isMovingLeft = true; player.facingDirection = 'left'; break;
        case 'moveRight': player.isMovingRight = true; player.facingDirection = 'right'; break;
        case 'stopMoveLeft': player.isMovingLeft = false; break;
        case 'stopMoveRight': player.isMovingRight = false; break;
        case 'jump':
          // console.log(`[gameLoop] Processing jump. isOnGround: ${player.isOnGround}`);
          if (player.isOnGround) {
            // console.log(`[gameLoop] Jump initiated. player.vy: ${player.vy}, player.isOnGround: true`);
            player.vy = JUMP_STRENGTH;
            player.isOnGround = false;
            // console.log(`[gameLoop] After jump. player.vy: ${player.vy}, player.isOnGround: ${player.isOnGround}`);
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

      // Use player.x for vertical check as nextPlayerX is after horizontal resolution
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

    const currentActiveCoins = activeCoinsRef.current;
    const updatedCoins = currentActiveCoins.map(coin => {
      let newOpacity = coin.currentOpacity;
      let newParticles = [...coin.particles];
      let newIsVisuallyPresent = coin.isVisuallyPresent;
      let newRotationAngle = coin.rotationAngle;

      if (!coin.isCollected && loopStartTime >= coin.targetSpawnTime && coin.currentOpacity < 1) {
        newOpacity = Math.min(1, coin.currentOpacity + (deltaTime / COIN_FADE_IN_DURATION));
      }
      
      if (coin.isCollected && coin.collectionTime && newIsVisuallyPresent) { 
        if (newParticles.length === 0) { 
            for (let i = 0; i < COIN_PARTICLE_COUNT; i++) {
              newParticles.push({
                x: coin.x + coin.width / 2, y: coin.y + coin.height / 2,
                vx: (Math.random() - 0.5) * PLAYER_SPEED * COIN_PARTICLE_SPEED_MULTIPLIER,
                vy: (Math.random() - 0.5) * PLAYER_SPEED * COIN_PARTICLE_SPEED_MULTIPLIER - 2,
                size: COIN_PARTICLE_SIZE, opacity: 1, life: COIN_PARTICLE_LIFESPAN,
              });
            }
        }
        newIsVisuallyPresent = false; 
        newOpacity = 0; 
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
      }
      
      if (coin.rotationSpeed !== 0) {
        newRotationAngle = (coin.rotationAngle + coin.rotationSpeed * deltaTimeFactor) % (Math.PI * 2);
      }
      
      return { ...coin, currentOpacity: newOpacity, particles: newParticles, isVisuallyPresent: newIsVisuallyPresent, rotationAngle: newRotationAngle };
    });
    
    if (JSON.stringify(currentActiveCoins) !== JSON.stringify(updatedCoins)) {
      setActiveCoins(updatedCoins);
    }
    
    if (player) {
      let playerCollectedACoinThisFrame = false;
      const coinsAfterCollectionProcessing = activeCoinsRef.current.map(coin => {
        if (!coin.isCollected && coin.isVisuallyPresent && coin.currentOpacity > 0.5 && 
            playerInstanceRef.current &&
            checkCollision(playerInstanceRef.current, { x: coin.x, y: coin.y, width: coin.width, height: coin.height })
        ) {
          // console.log(`[gameLoop] Player collided with coin ID: ${coin.id} at Player X:${playerInstanceRef.current.x.toFixed(2)} Y:${playerInstanceRef.current.y.toFixed(2)}, Coin X:${coin.x.toFixed(2)} Y:${coin.y.toFixed(2)}`);
          playerCollectedACoinThisFrame = true;
          return { ...coin, isCollected: true, collectionTime: Date.now() };
        }
        return coin;
      });

      if (playerCollectedACoinThisFrame) {
        // console.log("[GameCanvas gameLoop] Player collected a coin. Updating activeCoins.");
        setActiveCoins(coinsAfterCollectionProcessing);
      }
    }
    
    const currentActiveEnemies = activeEnemies; 
    const updatedEnemies = currentActiveEnemies.map(enemy => {
        let newEnemyX = enemy.x + (enemy.vx * enemy.direction * deltaTimeFactor);
        if (newEnemyX + enemy.width > canvas.width) {
            newEnemyX = canvas.width - enemy.width; enemy.direction *= -1;
        } else if (newEnemyX < 0) {
            newEnemyX = 0; enemy.direction *= -1;
        }
        return { ...enemy, x: newEnemyX };
    });

    if (JSON.stringify(currentActiveEnemies) !== JSON.stringify(updatedEnemies)) {
        setActiveEnemies(updatedEnemies);
    }

    if (player) {
      activeEnemies.forEach(enemy => { 
          if (checkCollision(player, enemy)) {
              const p_ground_platform = currentLevel.tiles.find(t => t.id === 'p_ground');
              if (p_ground_platform) {
                  player.x = canvas.width / 2 - player.width / 2;
                  player.y = p_ground_platform.y - player.height;
              } else {
                  player.x = canvas.width / 2 - player.width / 2;
                  player.y = canvas.height - player.height; 
              }
              player.vx = 0; player.vy = 0; player.isOnGround = true;
          }
      });
    }
    
    currentLevel.tiles.forEach(tile => {
      if (tile.layer !== 'foreground') { 
        if (tile.type === 1) { 
          let specificImage = assets.tileImage; 
          if (tile.id?.startsWith('stone_') && assets.stoneImage) specificImage = assets.stoneImage;
          if (specificImage?.complete) ctx.drawImage(specificImage, tile.x, tile.y, tile.width, tile.height);
          else { ctx.fillStyle = tile.color ?? 'grey'; ctx.fillRect(tile.x, tile.y, tile.width, tile.height); }
        } else { 
          let imgToDraw: HTMLImageElement | null = null;
          if (tile.id === 'tree1' && assets.tree1Image) imgToDraw = assets.tree1Image;
          else if (tile.id === 'tree2' && assets.tree2Image) imgToDraw = assets.tree2Image;
          else if (tile.id === 'house1' && assets.houseImage) imgToDraw = assets.houseImage;
          if (imgToDraw?.complete) ctx.drawImage(imgToDraw, tile.x, tile.y, tile.width, tile.height);
          else if (!imgToDraw && tile.color) { ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height); }
        }
      }
    });
    
    // console.log("[gameLoop] Calling renderCoins with activeCoinsRef.current:", JSON.parse(JSON.stringify(activeCoinsRef.current)));
    renderCoins(ctx, activeCoinsRef.current, assets.coinImage);
    renderEnemies(ctx, activeEnemies); 
    if (player) renderPlayer(ctx, player, assets.playerImage);

    currentLevel.tiles.forEach(tile => {
      if (tile.layer === 'foreground') {
        let imgToDraw: HTMLImageElement | null = null;
        if ((tile.id === 'bush_left_1' || tile.id === 'bush_right_1') && assets.smallBushImage) imgToDraw = assets.smallBushImage;
        else if ((tile.id === 'bush_left_2' || tile.id === 'bush_right_2') && assets.largeBushImage) imgToDraw = assets.largeBushImage;
        if (imgToDraw?.complete) ctx.drawImage(imgToDraw, tile.x, tile.y, tile.width, tile.height);
        else if (!imgToDraw && tile.color) { ctx.fillStyle = tile.color; ctx.fillRect(tile.x, tile.y, tile.width, tile.height); }
      }
    });
    
    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
  }, [
      isClient, assets, resetExecuteAction, parentPlayerRef, levelPath,
      processRawLevelData, spawnNewCoinPair, spawnSingleEnemy, 
      setActiveCoins, setActiveEnemies, 
      GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, COIN_FADE_IN_DURATION, COIN_PARTICLE_COUNT,
      COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR,
      COIN_PARTICLE_SIZE, COIN_ROTATION_SPEED_MAX, COIN_ROTATION_SPEED_MIN, 
      P3_MOVEMENT_DURATION, 
      PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR, COIN_SIZE, 
      ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR, PLATFORM_SPEED, 
      COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR, 
      MAX_JUMP_HEIGHT, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN 
  ]);

  // Effect 9: Start/Stop Game Loop
  useEffect(() => {
    // console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isClient: ${isClient}, isLoading: ${isLoading}, canvasRef: ${!!canvasRef.current}, canvasSize: W${canvasSize.width}H${canvasSize.height}, processedLevel: ${!!processedLevelRef.current}`);
    const conditionsMet = isClient && !isLoading && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevelRef.current;
    
    if (conditionsMet) {
      // console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); 
      animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    } else {
      // console.log(`[GameCanvas Effect 9] Conditions NOT MET. isClient:${isClient}, isLoading:${isLoading}, canvasExists:${!!canvasRef.current}, canvasW:${canvasSize.width}, canvasH:${canvasSize.height}, processedLevelExists:${!!processedLevelRef.current}`);
      if (animationFrameIdRef.current) {
        // console.log("[GameCanvas Effect 9] Conditions no longer met, cancelling animation frame.");
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
  }, [isClient, isLoading, canvasSize, gameLoop, processedLevel]); 

  // console.log(`[GameCanvas] Rendering. isClient: ${isClient}, isLoading: ${isLoading}, canvasSize: W${canvasSize.width}xH${canvasSize.height}`);
  if (!isClient) {
    return null; 
  }

  if (isLoading) {
    return (
      <div className="relative w-full h-full">
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
          }}
          aria-label="Game Canvas Loading"
          tabIndex={0}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 text-muted-foreground">
          <p>Initializing Canvas...</p>
        </div>
      </div>
    );
  }

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

