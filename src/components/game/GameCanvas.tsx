
"use client";

import type { ReactNode } from 'react';
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PlayerState, RawLevelData, ProcessedLevelData, Tile as ProcessedTile, RawTileData, CoinState, GameAction, Rect, Particle, EnemyState } from '@/types/game';
import {
  GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
  COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, COIN_SPAWN_TOP_MARGIN, MAX_JUMP_HEIGHT,
  COIN_FADE_IN_DURATION, COIN_SPAWN_STAGGER_DELAY, COIN_PARTICLE_COUNT,
  COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR,
  COIN_PARTICLE_SIZE, ENEMY_RADIUS, ENEMY_COLOR, ENEMY_SPEED_FACTOR,
  PLATFORM_SPEED, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX,
  COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SHADOW_BLUR, COIN_SHADOW_COLOR,
  P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION,
} from '@/config/gameConfig';
// import { useToast } from "@/hooks/use-toast";
import { checkCollision } from '@/game/utils/collision';
import { renderPlayer } from '@/game/entities/playerRenderer';
import { renderCoins } from '@/game/entities/coinRenderer';
// import { renderLevel } from '@/game/entities/levelRenderer'; // renderLevel logic is now in gameLoop
import { renderEnemies } from '@/game/entities/enemyRenderer';
import { loadLevel } from '@/lib/levelLoader';

interface GameCanvasProps {
  levelPath: string;
  onPlayerAction: (action: GameAction) => void;
  playerRef: React.MutableRefObject<PlayerState | null>;
  executeAction: GameAction | null;
  resetExecuteAction: () => void;
}

export default function GameCanvas({ levelPath, onPlayerAction, playerRef: parentPlayerRef, executeAction, resetExecuteAction }: GameCanvasProps) {
  console.log(`[GameCanvas] Component body. levelPath: ${levelPath}`);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // const { toast } = useToast(); // Commented out as not currently used

  const [rawLevelData, setRawLevelData] = useState<RawLevelData | null>(null);
  const [processedLevel, setProcessedLevel] = useState<ProcessedLevelData | null>(null);
  const processedLevelRef = useRef<ProcessedLevelData | null>(null);

  const playerInstanceRef = useRef<PlayerState | null>(null);
  const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);

  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const [assets, setAssets] = useState<{
    playerImage: HTMLImageElement | null;
    tileImage: HTMLImageElement | null;
    coinImage: HTMLImageElement | null;
    stoneImage: HTMLImageElement | null;
    treeImage: HTMLImageElement | null; // For tree1.png
    tree2Image: HTMLImageElement | null; // For tree2.png
    flowerImage: HTMLImageElement | null; // For flowers.png (used as 'bush1' on level2, or small bushes on level1)
    smallBushImage: HTMLImageElement | null; // Specifically for flowers.png (small bushes)
    largeBushImage: HTMLImageElement | null; // Specifically for bush1.png (large bushes)
    houseImage: HTMLImageElement | null; // For house1.png
    playerImageLoaded: boolean;
    tileImageLoaded: boolean;
    coinImageLoaded: boolean;
    stoneImageLoaded: boolean;
    treeImageLoaded: boolean;
    tree2ImageLoaded: boolean;
    flowerImageLoaded: boolean;
    smallBushImageLoaded: boolean;
    largeBushImageLoaded: boolean;
    houseImageLoaded: boolean;
  }>({
    playerImage: null, tileImage: null, coinImage: null, stoneImage: null, treeImage: null, tree2Image: null, flowerImage: null, smallBushImage: null, largeBushImage: null, houseImage: null,
    playerImageLoaded: false, tileImageLoaded: false, coinImageLoaded: false, stoneImageLoaded: false, treeImageLoaded: false, tree2ImageLoaded: false, flowerImageLoaded: false, smallBushImageLoaded: false, largeBushImageLoaded: false, houseImageLoaded: false,
  });

  const p3BasePosition = useRef<{ x: number; y: number } | null>(null);
  const p3InterestPoints = useRef<{ x: number; y: number }[]>([]);
  const p3CurrentTargetIndex = useRef<number>(0);
  const p3MovementStateRef = useRef<{ startTime: number; startX: number; startY: number; targetX: number; targetY: number } | null>(null);

  const executeActionRef = useRef<GameAction | null>(executeAction);
  const lastFrameTime = useRef<number>(Date.now());


  const parseDimension = useCallback((dim: string | number, totalSize: number): number => {
    if (typeof dim === 'number') {
      return dim;
    }
    if (typeof dim === 'string') {
      if (dim.endsWith('%')) {
        return (parseFloat(dim) / 100) * totalSize;
      }
      if (dim.endsWith('px')) {
        return parseFloat(dim);
      }
      return parseFloat(dim); 
    }
    return 0;
  }, []);

  const processRawLevelData = useCallback(
    (currentRawLevelData: RawLevelData | null, currentCanvasWidth: number, currentCanvasHeight: number): ProcessedLevelData | null => {
      console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
      if (!currentRawLevelData || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
        console.warn("[GameCanvas processRawLevelData] Invalid input, returning null.");
        return null;
      }

      const processedTiles: ProcessedTile[] = [];
      let playerStartX = PLAYER_WIDTH * 2; 
      let playerStartY = currentCanvasHeight - PLAYER_HEIGHT - 100; 

      const { tiles: rawTiles, playerStart: rawPlayerStart } = currentRawLevelData;

      rawTiles.forEach(rawTile => {
        const tileWidth = parseDimension(rawTile.width, currentCanvasWidth);
        const tileHeight = parseDimension(rawTile.height, currentCanvasHeight);
        let tileX = 0;
        let tileY = 0;

        const xOffset = rawTile.positioning.xOffsetPx || 0;
        const yOffset = rawTile.positioning.yOffsetPx || 0;

        switch (rawTile.positioning.anchor) {
          case 'top-left':
            tileX = xOffset;
            tileY = yOffset;
            break;
          case 'top-center':
            tileX = (currentCanvasWidth / 2) - (tileWidth / 2) + xOffset;
            tileY = yOffset;
            break;
          case 'top-right':
            tileX = currentCanvasWidth - tileWidth - xOffset;
            tileY = yOffset;
            break;
          case 'center-left':
            tileX = xOffset;
            tileY = (currentCanvasHeight / 2) - (tileHeight / 2) + yOffset;
            break;
          case 'center':
            tileX = (currentCanvasWidth / 2) - (tileWidth / 2) + xOffset;
            tileY = (currentCanvasHeight / 2) - (tileHeight / 2) + yOffset;
            break;
          case 'center-right':
            tileX = currentCanvasWidth - tileWidth - xOffset;
            tileY = (currentCanvasHeight / 2) - (tileHeight / 2) + yOffset;
            break;
          case 'bottom-left':
            tileX = xOffset;
            tileY = currentCanvasHeight - tileHeight - yOffset;
            break;
          case 'bottom-center':
            tileX = (currentCanvasWidth / 2) - (tileWidth / 2) + xOffset;
            tileY = currentCanvasHeight - tileHeight - yOffset;
            break;
          case 'bottom-right':
            tileX = currentCanvasWidth - tileWidth - xOffset;
            tileY = currentCanvasHeight - tileHeight - yOffset;
            break;
          default: 
            tileX = xOffset;
            tileY = yOffset;
        }
        
        const newTile: ProcessedTile = {
          id: rawTile.id,
          x: tileX,
          y: tileY,
          width: tileWidth,
          height: tileHeight,
          type: rawTile.type,
          color: rawTile.color,
          vx: rawTile.vx,
          direction: rawTile.direction,
          layer: rawTile.layer,
        };
        processedTiles.push(newTile);

        if (rawPlayerStart && rawTile.id === rawPlayerStart.platformId) {
          playerStartY = newTile.y - PLAYER_HEIGHT - (rawPlayerStart.yOffsetPx || 0);
          switch (rawPlayerStart.horizontalAlign) {
            case 'left':
              playerStartX = newTile.x + (rawPlayerStart.xOffsetPx || 0);
              break;
            case 'center':
              playerStartX = newTile.x + (newTile.width / 2) - (PLAYER_WIDTH / 2) + (rawPlayerStart.xOffsetPx || 0);
              break;
            case 'right':
              playerStartX = newTile.x + newTile.width - PLAYER_WIDTH - (rawPlayerStart.xOffsetPx || 0);
              break;
          }
        }
      });
      
      if (levelPath === "/levels/level2.json") {
        const p_ground_tile = processedTiles.find(t => t.id === 'p_ground');
        if (p_ground_tile) {
            const p_ground_top_y = p_ground_tile.y;
            const p3_size_w = P3_SIZE_W;
            const p3_size_h = P3_SIZE_H;
            // const p3_x = (currentCanvasWidth / 2) - (p3_size_w / 2);
            // const p3_y = p_ground_top_y - 300 - p3_size_h; 
            
            const p3_center_x = 100;
            const p3_center_y = 100;
            const p3_x = p3_center_x - p3_size_w / 2;
            const p3_y = p3_center_y - p3_size_h / 2;


            p3BasePosition.current = { x: p3_x, y: p3_y };
            p3InterestPoints.current = [
              { x: 0, y: 0 }, // Center
              { x: P3_DRIFT_RANGE, y: 0 },
              { x: -P3_DRIFT_RANGE, y: 0 },
              { x: 0, y: P3_DRIFT_RANGE },
              { x: 0, y: -P3_DRIFT_RANGE },
              { x: P3_DRIFT_RANGE, y: P3_DRIFT_RANGE },
              { x: -P3_DRIFT_RANGE, y: -P3_DRIFT_RANGE },
            ];
            p3CurrentTargetIndex.current = 0; 
            p3MovementStateRef.current = null; 

            const p3Tile: ProcessedTile = {
              id: 'p3',
              x: p3BasePosition.current.x + p3InterestPoints.current[0].x,
              y: p3BasePosition.current.y + p3InterestPoints.current[0].y,
              width: p3_size_w,
              height: p3_size_h,
              type: 1, 
              color: 'hsl(var(--chart-3))', 
              vx: 0, 
              direction: 0,
              layer: 'background',
            };
            processedTiles.push(p3Tile);
        } else {
            console.warn("[processRawLevelData] Level 2: p_ground tile not found, cannot position p3 relative to it.");
        }
      }

      const result: ProcessedLevelData = {
        playerStart: { xPx: playerStartX, yPx: playerStartY },
        tiles: processedTiles,
      };

      const newPlayer: PlayerState = {
        x: result.playerStart.xPx,
        y: result.playerStart.yPx,
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
      };
      playerInstanceRef.current = newPlayer;
      if (parentPlayerRef) parentPlayerRef.current = newPlayer;
      
      console.log(`[processRawLevelData] Successfully processed. Player:`, newPlayer, "Number of tiles:", result.tiles.length);
      return result;
    },
    [parseDimension, levelPath, assets.playerImage, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR, P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, parentPlayerRef]
  );

  const spawnNewCoinPair = useCallback(
    (currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number, currentCanvasHeight: number): CoinState[] => {
      console.log(`[spawnNewCoinPair] DIAGNOSTIC SPAWN Called. Canvas W:${currentCanvasWidth}, H:${currentCanvasHeight}. ProcessedLevel exists: ${!!currentProcessedLevel}`);
      if (!currentProcessedLevel || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
        console.warn("[spawnNewCoinPair] Pre-conditions not met (no processed level or invalid canvas size). No coins spawned.");
        return [];
      }
      const newCoins: CoinState[] = [];
      const p_ground = currentProcessedLevel.tiles.find(t => t.id === 'p_ground');
      if (!p_ground) {
        console.warn("[spawnNewCoinPair] p_ground not found. Cannot determine coin spawn zone. No coins spawned.");
        return [];
      }
      const p_groundTopY = p_ground.y;
      
      let gamePlatforms = currentProcessedLevel.tiles.filter(t => t.type === 1 && t.id !== 'p_ground');
      if (levelPath === "/levels/level2.json") {
          gamePlatforms = gamePlatforms.filter(t => t.id !== 'p3'); 
      }

      let actualHighestPlatformTopY = p_groundTopY;
      if (gamePlatforms.length > 0) {
        actualHighestPlatformTopY = Math.min(...gamePlatforms.map(p => p.y));
      }
      const ySpawnZoneBottomCoinTopEdge = p_groundTopY - COIN_VERTICAL_SPAWN_BOTTOM_OFFSET - COIN_SIZE;
      const ySpawnZoneTopCoinTopEdge = actualHighestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;

      if (ySpawnZoneTopCoinTopEdge >= ySpawnZoneBottomCoinTopEdge) {
          console.warn(`[spawnNewCoinPair] Invalid spawn zone: Top edge (${ySpawnZoneTopCoinTopEdge}) is above or at bottom edge (${ySpawnZoneBottomCoinTopEdge}). No coins spawned.`);
          return [];
      }

      console.log(`[spawnNewCoinPair] Spawning coins. Zone Top: ${ySpawnZoneTopCoinTopEdge}, Zone Bottom: ${ySpawnZoneBottomCoinTopEdge}, Highest Platform Top: ${actualHighestPlatformTopY}`);
      
      for (let i = 0; i < 10; i++) { // Always try to spawn 10 coins
          const isLeftHalf = i < 5;
          const xMin = isLeftHalf ? 0 : currentCanvasWidth / 2;
          const xMax = isLeftHalf ? currentCanvasWidth / 2 - COIN_SIZE : currentCanvasWidth - COIN_SIZE;
          
          const coinX = Math.random() * (xMax - xMin) + xMin;
          const coinY = Math.random() * (ySpawnZoneBottomCoinTopEdge - ySpawnZoneTopCoinTopEdge) + ySpawnZoneTopCoinTopEdge;

          newCoins.push({
            id: `coin-${Date.now()}-${i}`,
            x: coinX,
            y: coinY,
            width: COIN_SIZE,
            height: COIN_SIZE,
            isCollected: false,
            targetSpawnTime: Date.now() + i * COIN_SPAWN_STAGGER_DELAY,
            currentOpacity: 0,
            particles: [],
            isVisuallyPresent: true,
            rotationAngle: Math.random() * Math.PI * 2,
            rotationSpeed: Math.random() * (COIN_ROTATION_SPEED_MAX - COIN_ROTATION_SPEED_MIN) + COIN_ROTATION_SPEED_MIN,
          });
      }
      console.log(`[spawnNewCoinPair] Created ${newCoins.length} coins.`);
      return newCoins;
    },
    [levelPath, COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, MAX_JUMP_HEIGHT, COIN_SPAWN_TOP_MARGIN, COIN_SPAWN_STAGGER_DELAY, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX]
  );

  const spawnSingleEnemy = useCallback(
    (currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number): EnemyState | null => {
      if (!currentProcessedLevel) return null;
  
      const p1_id = levelPath === '/levels/level1.json' ? 'floating_platform_left' : 'p1';
      const p2_id = levelPath === '/levels/level1.json' ? 'floating_platform_right' : 'p2';

      const p1 = currentProcessedLevel.tiles.find(t => t.id === p1_id);
      const p2 = currentProcessedLevel.tiles.find(t => t.id === p2_id);
  
      if (!p1 || !p2) {
        console.warn(`[spawnSingleEnemy] P1 ('${p1_id}') or P2 ('${p2_id}') not found for level ${levelPath}, cannot spawn enemy.`);
        return null;
      }
  
      const enemyY = (p1.y + p1.height / 2 + p2.y + p2.height / 2) / 2 - ENEMY_RADIUS;
      const newEnemy: EnemyState = {
        id: `enemy-${Date.now()}`,
        x: ENEMY_RADIUS * 2,
        y: enemyY,
        radius: ENEMY_RADIUS,
        width: ENEMY_RADIUS * 2,
        height: ENEMY_RADIUS * 2,
        vx: PLATFORM_SPEED * ENEMY_SPEED_FACTOR,
        direction: 1,
        color: ENEMY_COLOR,
      };
      console.log("[GameCanvas spawnSingleEnemy] Spawned new enemy:", newEnemy);
      return newEnemy;
    },
    [levelPath, ENEMY_RADIUS, PLATFORM_SPEED, ENEMY_SPEED_FACTOR, ENEMY_COLOR] 
  );

  // Effect 1: Set isClient and load assets
  useEffect(() => {
    console.log(`[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state: ${isClient}`);
    setIsClient(true);

    const pImg = new Image();
    pImg.src = `/assets/images/hero_jeans3.png`;
    pImg.setAttribute('data-ai-hint', 'character orange blue');
    pImg.onload = () => setAssets(prev => ({ ...prev, playerImage: pImg, playerImageLoaded: true }));
    pImg.onerror = () => { console.error("Failed to load player image."); setAssets(prev => ({ ...prev, playerImageLoaded: true })); };

    const tImg = new Image();
    tImg.src = `/assets/images/platform_grass.png`;
    tImg.setAttribute('data-ai-hint', 'platform grass dirt');
    tImg.onload = () => setAssets(prev => ({ ...prev, tileImage: tImg, tileImageLoaded: true }));
    tImg.onerror = () => { console.error("Failed to load tile image."); setAssets(prev => ({ ...prev, tileImageLoaded: true })); };

    const cImg = new Image();
    cImg.src = `/assets/images/thankscoin.png`; // Path changed for actual coin image
    cImg.setAttribute('data-ai-hint', 'collectible coin gold');
    cImg.onload = () => setAssets(prev => ({ ...prev, coinImage: cImg, coinImageLoaded: true }));
    cImg.onerror = () => { console.error("Failed to load coin image."); setAssets(prev => ({ ...prev, coinImageLoaded: true })); };
    
    const stImg = new Image();
    stImg.src = `/assets/images/stone1.jpg`; // Path changed for actual stone image
    stImg.setAttribute('data-ai-hint', 'stone rock platform');
    stImg.onload = () => setAssets(prev => ({ ...prev, stoneImage: stImg, stoneImageLoaded: true }));
    stImg.onerror = () => { console.error("Failed to load stone image."); setAssets(prev => ({ ...prev, stoneImageLoaded: true })); };
    
    const tree1Img = new Image();
    tree1Img.src = `/assets/images/tree1.png`;
    tree1Img.setAttribute('data-ai-hint', 'tree nature decor');
    tree1Img.onload = () => setAssets(prev => ({ ...prev, treeImage: tree1Img, treeImageLoaded: true }));
    tree1Img.onerror = () => { console.error("Failed to load tree1 image."); setAssets(prev => ({ ...prev, treeImageLoaded: true })); };

    const tree2Img = new Image();
    tree2Img.src = `/assets/images/tree2.png`;
    tree2Img.setAttribute('data-ai-hint', 'tree nature decor');
    tree2Img.onload = () => setAssets(prev => ({ ...prev, tree2Image: tree2Img, tree2ImageLoaded: true }));
    tree2Img.onerror = () => { console.error("Failed to load tree2 image."); setAssets(prev => ({ ...prev, tree2ImageLoaded: true })); };

    const flowerImg = new Image(); 
    flowerImg.src = `/assets/images/flowers.png`;
    flowerImg.setAttribute('data-ai-hint', 'flowers plant decor');
    flowerImg.onload = () => setAssets(prev => ({ ...prev, flowerImage: flowerImg, flowerImageLoaded: true }));
    flowerImg.onerror = () => { console.error("Failed to load flower image."); setAssets(prev => ({ ...prev, flowerImageLoaded: true })); };

    const smallBushImg = new Image(); 
    smallBushImg.src = `/assets/images/flowers.png`; 
    smallBushImg.setAttribute('data-ai-hint', 'flowers small bush');
    smallBushImg.onload = () => setAssets(prev => ({ ...prev, smallBushImage: smallBushImg, smallBushImageLoaded: true }));
    smallBushImg.onerror = () => { console.error("Failed to load smallBush image."); setAssets(prev => ({ ...prev, smallBushImageLoaded: true })); };
    
    const largeBushImg = new Image(); 
    largeBushImg.src = `/assets/images/bush1.png`;
    largeBushImg.setAttribute('data-ai-hint', 'bush large decor');
    largeBushImg.onload = () => setAssets(prev => ({ ...prev, largeBushImage: largeBushImg, largeBushImageLoaded: true }));
    largeBushImg.onerror = () => { console.error("Failed to load largeBush image."); setAssets(prev => ({ ...prev, largeBushImageLoaded: true })); };

    const houseImg = new Image();
    houseImg.src = `/assets/images/house1.png`;
    houseImg.setAttribute('data-ai-hint', 'house building structure');
    houseImg.onload = () => setAssets(prev => ({ ...prev, houseImage: houseImg, houseImageLoaded: true }));
    houseImg.onerror = () => { console.error("Failed to load house image."); setAssets(prev => ({ ...prev, houseImageLoaded: true })); };

  }, []); 

  // Effect 2: Apply canvasSize to canvas element attributes
  useEffect(() => {
    console.log(`[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize: {width: ${canvasSize.width}, height: ${canvasSize.height}}`);
    if (canvasRef.current) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
    }
  }, [canvasSize]); // isClient removed as canvasRef.current is guarded by isClient in Effect 3

  // Effect 3: Observe parent size and update canvasSize state
  useEffect(() => {
    console.log(`[GameCanvas Effect 3] Running: Observe parent size`);
    const canvas = canvasRef.current;
    if (!isClient || !canvas) return;

    const updateCanvasSizeState = (entries?: ResizeObserverEntry[]) => {
        const parentElement = canvas.parentElement;
        if (parentElement) {
            const newWidth = parentElement.clientWidth;
            const newHeight = parentElement.clientHeight;
            setCanvasSize(currentSize => {
                if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
                    console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
                    return { width: newWidth > 0 ? newWidth : 0, height: newHeight > 0 ? newHeight : 0 };
                }
                return currentSize;
            });
        }
    };
    
    updateCanvasSizeState(); 

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      resizeObserver = new ResizeObserver(updateCanvasSizeState);
      resizeObserver.observe(canvas.parentElement);
    } else {
      window.addEventListener('resize', () => updateCanvasSizeState());
    }

    return () => {
      if (resizeObserver && canvas.parentElement) {
        resizeObserver.unobserve(canvas.parentElement);
      } else {
        window.removeEventListener('resize', () => updateCanvasSizeState());
      }
    };
  }, [isClient, setCanvasSize]);


  // Effect 4: Load raw level data
  useEffect(() => {
    console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      if (isLoading) setIsLoading(false); 
      return;
    }
    
    setRawLevelData(null); 
    if (!isLoading) setIsLoading(true); 

    loadLevel(levelPath)
      .then(data => {
        if (data) {
          console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
          setRawLevelData(data);
        } else {
          console.error(`[GameCanvas Effect 4] Failed to load rawLevelData for ${levelPath}. Setting rawLevelData to null.`);
          setRawLevelData(null);
          if (isLoading) setIsLoading(false); 
        }
      })
      .catch(error => {
        console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
        if (isLoading) setIsLoading(false); 
      });
  }, [levelPath, isClient, setIsLoading, setRawLevelData]); 


  // Effect 5: Process raw level data and initialize player
  useEffect(() => {
    const allAssetsLoaded = assets.playerImageLoaded && assets.tileImageLoaded && assets.coinImageLoaded && assets.stoneImageLoaded && assets.treeImageLoaded && assets.tree2ImageLoaded && assets.flowerImageLoaded && assets.smallBushImageLoaded && assets.largeBushImageLoaded && assets.houseImageLoaded;
    console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${allAssetsLoaded}`);

    if (isClient && rawLevelData && canvasSize.width > 0 && canvasSize.height > 0 && allAssetsLoaded) {
      console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
      
      setActiveCoins([]); // Clear coins before processing new level
      setActiveEnemies([]); // Clear enemies

      const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
      
      if (newProcessedLevel) {
        console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel.");
        setProcessedLevel(newProcessedLevel);
        // Player creation moved to processRawLevelData
      } else {
        console.warn("[GameCanvas Effect 5] processRawLevelData returned null. Setting processedLevel to null.");
        setProcessedLevel(null);
        if (isLoading) setIsLoading(false); 
      }
    } else {
       console.log("[GameCanvas Effect 5] Critical data missing. isClient:", isClient, "rawLevelData:", !!rawLevelData, `canvasSize: W${canvasSize.width}xH${canvasSize.height}`, "allAssetsLoaded:", allAssetsLoaded);
       if (isLoading && (!rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded)) {
         // If still loading but critical data missing, don't flip isLoading to false prematurely
       } else if (!isLoading && (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded)){
         // Conditions not met, but not loading. This path should ideally not be hit if isLoading logic is correct.
       }
    }
  }, [
    isClient, rawLevelData, canvasSize, assets, isLoading, // Added isLoading here
    processRawLevelData, 
    setProcessedLevel, setActiveCoins, setActiveEnemies, setIsLoading // Added setIsLoading
  ]);


  // Effect 6: Sync processedLevel to ref
  useEffect(() => {
    console.log(`[GameCanvas Effect 6] Running. processedLevel updated. Is null: ${!processedLevel}`);
    processedLevelRef.current = processedLevel;
  }, [processedLevel]);


  // Effect 7: Spawn entities and finish loading
  useEffect(() => {
    console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevelRef.current}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoins.length}`);

    if (!isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
      console.log("[GameCanvas Effect 7] Pre-conditions (isClient, processedLevel, canvasSize) not met for entity spawn, returning.");
      return;
    }
    
    if (!isLoading) {
        console.log("[GameCanvas Effect 7] isLoading is false, skipping spawn logic (already loaded or loading finished).");
        return;
    }

    let coinsSpawnedOrAttempted = activeCoins.length > 0;
    if (!coinsSpawnedOrAttempted && processedLevelRef.current.tiles.length > 0) {
        console.log(`[GameCanvas Effect 7] Spawning new coin pair for level ${levelPath}`);
        const newCoins = spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height);
        console.log(`[GameCanvas Effect 7] spawnNewCoinPair returned ${newCoins.length} coins. Setting activeCoins.`);
        setActiveCoins(newCoins);
        coinsSpawnedOrAttempted = true;
    } else if (processedLevelRef.current.tiles.length === 0) {
        console.log("[GameCanvas Effect 7] No tiles in level, skipping coin spawn.");
        coinsSpawnedOrAttempted = true; 
    }


    let enemiesSpawnedOrAttempted = activeEnemies.length > 0;
    if (levelPath !== '/levels/level2.json' && levelPath !== '/levels/level1.json') {
      if (!enemiesSpawnedOrAttempted && processedLevelRef.current.tiles.length > 0) {
        const newEnemy = spawnSingleEnemy(processedLevelRef.current, canvasSize.width);
        if (newEnemy) {
          setActiveEnemies([newEnemy]);
        }
        enemiesSpawnedOrAttempted = true;
      } else if (processedLevelRef.current.tiles.length === 0) {
         enemiesSpawnedOrAttempted = true; 
      }
    } else {
      console.log(`[GameCanvas Effect 7] Enemies not spawned for level: ${levelPath}`);
      enemiesSpawnedOrAttempted = true; 
    }
    
    if (coinsSpawnedOrAttempted && enemiesSpawnedOrAttempted) {
        console.log("[GameCanvas Effect 7] All entities attempted or not needed, setting isLoading to false.");
        setIsLoading(false);
    } else {
        console.log(`[GameCanvas Effect 7] Still waiting for entities. coinsSpawnedOrAttempted: ${coinsSpawnedOrAttempted}, enemiesSpawnedOrAttempted: ${enemiesSpawnedOrAttempted}`);
    }

  }, [
      isClient, isLoading, processedLevel, canvasSize, levelPath, 
      // activeCoins.length, activeEnemies.length, // Removed to prevent loops if spawn is called multiple times
      spawnNewCoinPair, spawnSingleEnemy, setActiveCoins, setActiveEnemies, setIsLoading
  ]);

  // Effect 8: Respawn coins
   useEffect(() => {
    console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, processedLevel: ${!!processedLevelRef.current}`);
    if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
      return;
    }

    const allCollectedAndParticlesGone = activeCoins.length > 0 && activeCoins.every(c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent);
    if (allCollectedAndParticlesGone) {
      console.log("[GameCanvas Effect 8] All coins collected and particles gone, spawning new pair.");
      const newCoins = spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height);
      setActiveCoins(newCoins);
    }
  }, [activeCoins, isClient, isLoading, canvasSize, spawnNewCoinPair, processedLevelRef, setActiveCoins]); 
  
  useEffect(() => {
    executeActionRef.current = executeAction;
  }, [executeAction]);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const player = playerInstanceRef.current;
    const currentLevelData = processedLevelRef.current; 

    if (!ctx || !player || !currentLevelData || !canvas) {
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

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentExecuteActionVal = executeActionRef.current;
    if (currentExecuteActionVal) {
      switch (currentExecuteActionVal) {
        case 'moveLeft':
          player.isMovingLeft = true;
          break;
        case 'moveRight':
          player.isMovingRight = true;
          break;
        case 'jump':
          if (player.isOnGround) {
            player.vy = JUMP_STRENGTH;
            player.isOnGround = false;
          }
          break;
        case 'stopMoveLeft':
          player.isMovingLeft = false;
          break;
        case 'stopMoveRight':
          player.isMovingRight = false;
          break;
      }
      resetExecuteAction(); 
      executeActionRef.current = null; 
    }
    
    player.vx = 0;
    if (player.isMovingLeft) {
      player.vx = -PLAYER_SPEED;
      player.facingDirection = 'left';
    }
    if (player.isMovingRight) {
      player.vx = PLAYER_SPEED;
      player.facingDirection = 'right';
    }

    player.vy += GRAVITY * deltaTimeFactor;
    
    let proposedX = player.x + player.vx * deltaTimeFactor;
    let proposedY = player.y + player.vy * deltaTimeFactor;

    let platformInducedMoveX = 0;
    let onMovingPlatform = false;
    let activePlatformId: string | null = null;

    const updatedTiles = currentLevelData.tiles.map(tile => {
      if (tile.vx && tile.direction) {
        let newTileX = tile.x + (tile.vx * tile.direction * deltaTimeFactor);
        let newDirection = tile.direction;
        const tileSpecificMovementBounds = { left: 0, right: canvas.width };

        if (tile.id === 'boat1') {
            const waterPit = currentLevelData.tiles.find(t => t.id === 'water_pit');
            if (waterPit) {
                tileSpecificMovementBounds.left = waterPit.x;
                tileSpecificMovementBounds.right = waterPit.x + waterPit.width;
            }
        }
        
        if (newTileX + tile.width > tileSpecificMovementBounds.right) {
            newTileX = tileSpecificMovementBounds.right - tile.width;
            newDirection = -1;
        } else if (newTileX < tileSpecificMovementBounds.left) {
            newTileX = tileSpecificMovementBounds.left;
            newDirection = 1;
        }
        return { ...tile, x: newTileX, direction: newDirection };
      }
      return tile;
    });

    const p3Tile = updatedTiles.find(t => t.id === 'p3');
    let p3_delta_x = 0;
    let p3_delta_y = 0;

    if (p3Tile && p3BasePosition.current && p3InterestPoints.current.length > 0) {
        if (!p3MovementStateRef.current) {
            const nextTargetIndex = (p3CurrentTargetIndex.current + 1 + Math.floor(Math.random() * (p3InterestPoints.current.length -1))) % p3InterestPoints.current.length;
             if (nextTargetIndex === p3CurrentTargetIndex.current && p3InterestPoints.current.length > 1) { 
                p3CurrentTargetIndex.current = (nextTargetIndex + 1) % p3InterestPoints.current.length;
            } else {
                 p3CurrentTargetIndex.current = nextTargetIndex;
            }
            
            const targetOffset = p3InterestPoints.current[p3CurrentTargetIndex.current];
            p3MovementStateRef.current = {
                startTime: loopStartTime,
                startX: p3Tile.x,
                startY: p3Tile.y,
                targetX: p3BasePosition.current.x + targetOffset.x,
                targetY: p3BasePosition.current.y + targetOffset.y,
            };
        }

        const state = p3MovementStateRef.current;
        const elapsedTime = loopStartTime - state.startTime;
        let t = elapsedTime / P3_MOVEMENT_DURATION;
        t = Math.min(t, 1); 

        const newP3X = state.startX + (state.targetX - state.startX) * t;
        const newP3Y = state.startY + (state.targetY - state.startY) * t;
        
        p3_delta_x = newP3X - p3Tile.x;
        p3_delta_y = newP3Y - p3Tile.y;

        p3Tile.x = newP3X;
        p3Tile.y = newP3Y;

        if (t >= 1) {
            p3MovementStateRef.current = null; 
        }
    }
    
     if (processedLevelRef.current) {
        processedLevelRef.current = { ...processedLevelRef.current, tiles: updatedTiles };
    }

    player.isOnGround = false;
    activePlatformId = null; // Reset active platform ID at the start of collision checks
    updatedTiles.forEach(tile => {
      if (tile.type === 1 && checkCollision({ ...player, y: proposedY }, tile)) {
        if (player.vy > 0) { 
          proposedY = tile.y - player.height;
          player.vy = 0;
          player.isOnGround = true;
          activePlatformId = tile.id;
          if (tile.vx && tile.direction) {
            platformInducedMoveX = tile.vx * tile.direction * deltaTimeFactor;
            onMovingPlatform = true;
          }
          if (tile.id === 'p3') { 
            platformInducedMoveX = p3_delta_x; 
            player.y += p3_delta_y; 
            proposedY = player.y; 
            onMovingPlatform = true;
          }
        } else if (player.vy < 0) { 
          proposedY = tile.y + tile.height;
          player.vy = 0;
        }
      }
    });
    player.y = proposedY;

    if (onMovingPlatform && activePlatformId !== 'p3') { 
        proposedX += platformInducedMoveX;
    } else if (onMovingPlatform && activePlatformId === 'p3') { 
        proposedX += p3_delta_x; 
    }

    updatedTiles.forEach(tile => {
      if (tile.type === 1 && checkCollision({ ...player, x: proposedX }, tile)) {
        if (player.vx > 0) { 
          proposedX = tile.x - player.width;
        } else if (player.vx < 0) { 
          proposedX = tile.x + tile.width;
        }
        player.vx = 0; 
      }
    });
    player.x = proposedX;
    
    if (player.y + player.height > canvas.height) {
      player.y = canvas.height - player.height;
      player.vy = 0;
      player.isOnGround = true;
      activePlatformId = null; 
      const groundPlatform = updatedTiles.find(t => t.id === 'p_ground');
      if (groundPlatform) activePlatformId = groundPlatform.id;
    }
    
    // Update activeCoins using functional updates
    setActiveCoins(prevCoins => {
        let allCoinsCollectedAndParticlesGoneThisFrame = prevCoins.length > 0;
        const nextCoins = prevCoins.map(coin => {
            let newCoin = { ...coin };
            let particlesStillActive = false;

            if (newCoin.particles.length > 0) {
                newCoin.particles = newCoin.particles
                    .map(p => {
                        const newLife = p.life - deltaTime;
                        if (newLife <= 0) return null;
                        return {
                            ...p,
                            x: p.x + p.vx * deltaTimeFactor,
                            y: p.y + p.vy * deltaTimeFactor,
                            vy: p.vy + (COIN_PARTICLE_GRAVITY_FACTOR * GRAVITY * deltaTimeFactor),
                            opacity: Math.max(0, (newLife / COIN_PARTICLE_LIFESPAN)),
                            life: newLife,
                        };
                    })
                    .filter(p => p !== null) as Particle[];
                if (newCoin.particles.length > 0) particlesStillActive = true;
            }
            
            if (newCoin.isCollected) {
                if (!particlesStillActive && newCoin.isVisuallyPresent) { 
                    newCoin.isVisuallyPresent = false; 
                }
            } else { 
                if (loopStartTime >= newCoin.targetSpawnTime && newCoin.currentOpacity < 1) {
                    newCoin.currentOpacity += deltaTime / COIN_FADE_IN_DURATION;
                    newCoin.currentOpacity = Math.min(newCoin.currentOpacity, 1);
                }
            }
            
            if (!newCoin.isCollected && newCoin.currentOpacity > 0.5 && checkCollision(player, newCoin)) {
                newCoin.isCollected = true;
                newCoin.currentOpacity = 0; 
                for (let i = 0; i < COIN_PARTICLE_COUNT; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = Math.random() * COIN_PARTICLE_SPEED_MULTIPLIER + 0.5;
                    newCoin.particles.push({
                        x: newCoin.x + newCoin.width / 2,
                        y: newCoin.y + newCoin.height / 2,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        size: COIN_PARTICLE_SIZE,
                        opacity: 1,
                        life: COIN_PARTICLE_LIFESPAN,
                    });
                }
            }
            
            newCoin.rotationAngle = (newCoin.rotationAngle + newCoin.rotationSpeed * deltaTimeFactor) % (Math.PI * 2);

            if (!newCoin.isCollected || newCoin.particles.length > 0 || newCoin.isVisuallyPresent) {
                allCoinsCollectedAndParticlesGoneThisFrame = false;
            }
            return newCoin;
        });
        
        // Return the new array if it's different, or the previous one if not, to avoid unnecessary re-renders
        // This basic check might not be deep enough for complex objects, but for now it's a start
        if (JSON.stringify(prevCoins) !== JSON.stringify(nextCoins)) {
            return nextCoins;
        }
        return prevCoins;
    });


    setActiveEnemies(prevEnemies => {
        const nextEnemies = prevEnemies.map(enemy => {
          let newEnemyX = enemy.x + (enemy.vx * enemy.direction * deltaTimeFactor);
          let newEnemyDirection = enemy.direction;
    
          if (newEnemyX + enemy.width > canvas.width) {
            newEnemyX = canvas.width - enemy.width;
            newEnemyDirection = -1;
          } else if (newEnemyX < 0) {
            newEnemyX = 0;
            newEnemyDirection = 1;
          }
          const updatedEnemy = { ...enemy, x: newEnemyX, direction: newEnemyDirection };
          
          if (checkCollision(player, updatedEnemy)) {
            console.log("[GameLoop] Collision with enemy!");
            // toast({ title: "Ouch!", description: "Hit by an enemy!", variant: "destructive" });
            const ground = currentLevelData.tiles.find(t => t.id === 'p_ground');
            if (ground) {
                player.x = canvas.width / 2 - player.width / 2;
                player.y = ground.y - player.height;
            } else { 
                 player.x = canvas.width / 2 - player.width / 2;
                 player.y = canvas.height - player.height - 50; 
            }
            player.vx = 0;
            player.vy = 0;
            player.isOnGround = true;
            activePlatformId = ground ? ground.id : null;
          }
          return updatedEnemy;
        });

        if (JSON.stringify(prevEnemies) !== JSON.stringify(nextEnemies)) {
            return nextEnemies;
        }
        return prevEnemies;
    });


    updatedTiles.forEach(tile => {
      if (tile.layer !== 'foreground') { // Background and main platforms
        if (tile.type === 1) { 
          if (tile.id.startsWith('stone_') && assets.stoneImage?.complete) {
            ctx.drawImage(assets.stoneImage, tile.x, tile.y, tile.width, tile.height);
          } else if (assets.tileImage?.complete) {
            ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
          } else {
            ctx.fillStyle = tile.color;
            ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
          }
        } else { // Decorative background elements (type != 1)
          if (tile.id === 'tree1' && assets.treeImage?.complete) {
            ctx.drawImage(assets.treeImage, tile.x, tile.y, tile.width, tile.height);
          } else if (tile.id === 'tree2' && assets.tree2Image?.complete) {
            ctx.drawImage(assets.tree2Image, tile.x, tile.y, tile.width, tile.height);
          } else if (tile.id === 'house1' && assets.houseImage?.complete) {
            ctx.drawImage(assets.houseImage, tile.x, tile.y, tile.width, tile.height);
          } else if (tile.id !== 'water_area' && tile.id !== 'water_pit') { // Avoid drawing water with fillRect if it has specific rendering elsewhere or none
            ctx.fillStyle = tile.color;
            ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
          }
        }
      }
    });

    // Render water if present
    const waterTile = updatedTiles.find(t => t.id === 'water_area' || t.id === 'water_pit');
    if (waterTile) {
      ctx.fillStyle = waterTile.color;
      ctx.fillRect(waterTile.x, waterTile.y, waterTile.width, waterTile.height);
    }
    
    // Render coins if activeCoins is not empty
    // The actual coins state is now accessed via a closure in the functional update of setActiveCoins,
    // so for rendering, we need to ensure activeCoins from useState is used.
    // However, for stability, we pass activeCoins state to renderCoins.
    if (activeCoins.length > 0) {
        renderCoins(ctx, activeCoins, assets.coinImage);
    }

    renderEnemies(ctx, activeEnemies);
    renderPlayer(ctx, player, assets.playerImage);

     updatedTiles.forEach(tile => {
      if (tile.layer === 'foreground') {
        if ((tile.id === "bush_left_1" || tile.id === "bush_right_1") && assets.smallBushImage?.complete) {
            ctx.drawImage(assets.smallBushImage, tile.x, tile.y, tile.width, tile.height);
        } else if ((tile.id === "bush_left_2" || tile.id === "bush_right_2") && assets.largeBushImage?.complete) {
            ctx.drawImage(assets.largeBushImage, tile.x, tile.y, tile.width, tile.height);
        } else if (tile.id === "bush1" && assets.flowerImage?.complete) { 
             ctx.drawImage(assets.flowerImage, tile.x, tile.y, tile.width, tile.height);
        }
        else {
          ctx.fillStyle = tile.color;
          ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
        }
      }
    });

    lastFrameTime.current = loopStartTime;
    requestAnimationFrame(gameLoop);
  }, [
    isClient, assets, resetExecuteAction, 
    setActiveCoins, setActiveEnemies, 
    canvasSize, 
    levelPath, 
    GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
    COIN_SIZE, COIN_FADE_IN_DURATION, COIN_PARTICLE_COUNT,
    COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SIZE, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR,
    ENEMY_COLOR, ENEMY_RADIUS, ENEMY_SPEED_FACTOR, PLATFORM_SPEED,
    P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION,
    p3BasePosition, p3InterestPoints, p3CurrentTargetIndex, p3MovementStateRef,
    // Dependencies that gameLoop truly needs to be re-created for if they change
    // activeCoins, activeEnemies are now handled by functional updates to avoid direct dependency
  ]);


  // Effect 9: Game Loop Setup
  useEffect(() => {
    console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, processedLevel: ${!!processedLevelRef.current}`);
    let animationFrameId: number;
    
    const conditionsMet = isClient && !isLoading && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevelRef.current;

    if (conditionsMet) {
      console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); 
      animationFrameId = requestAnimationFrame(gameLoop);
    } else {
      console.log(`[GameCanvas Effect 9] Conditions NOT MET. isLoading: ${isLoading}, isClient: ${isClient}, canvasRef: ${!!canvasRef.current}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, processedLevel: ${!!processedLevelRef.current}`);
    }

    return () => {
      console.log("[GameCanvas Effect 9] Cleanup: Cancelling animation frame.");
      cancelAnimationFrame(animationFrameId);
    };
  }, [isClient, isLoading, canvasSize, processedLevel, gameLoop]); // Add processedLevel (state) here

  // Keyboard controls
  useEffect(() => {
    if (!isClient) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPlayerAction('moveLeft');
      if (e.key === 'ArrowRight') onPlayerAction('moveRight');
      if (e.key === 'ArrowUp' || e.key === ' ') onPlayerAction('jump');
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPlayerAction('stopMoveLeft');
      if (e.key === 'ArrowRight') onPlayerAction('stopMoveRight');
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onPlayerAction, isClient]);
  
  console.log(`[GameCanvas] Before return. isClient: ${isClient}, isLoading: ${isLoading}`);

  if (!isClient) {
    // console.log("[GameCanvas] Rendering: Loading Game Client (isClient is false)...");
    return <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground rounded-md">Loading Game Client...</div>;
  }

  if (isLoading) {
    // console.log("[GameCanvas] Rendering: Initializing Canvas... (isLoading is true)");
    return (
      <div className="relative w-full h-full">
        <canvas ref={canvasRef} className="w-full h-full block" tabIndex={0} />
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center text-muted-foreground rounded-md z-10">
          Initializing Canvas...
        </div>
      </div>
    );
  }
  
  // console.log("[GameCanvas] Rendering: Game Canvas - ACTIVE!");
  return (
    <canvas ref={canvasRef} className="w-full h-full block" tabIndex={0} />
  );
}

