
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
  // console.log(`[GameCanvas] Component body. levelPath: ${levelPath}`);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // const { toast } = useToast();

  const [rawLevelData, setRawLevelData] = useState<RawLevelData | null>(null);
  const [processedLevel, setProcessedLevel] = useState<ProcessedLevelData | null>(null);
  const processedLevelRef = useRef<ProcessedLevelData | null>(null);

  const playerInstanceRef = useRef<PlayerState | null>(null);
  const executeActionRef = useRef<GameAction | null>(null);
  const lastFrameTime = useRef<number>(Date.now());

  const [activeCoins, setActiveCoins] = useState<CoinState[]>([]);
  const [activeEnemies, setActiveEnemies] = useState<EnemyState[]>([]);

  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const [assets, setAssets] = useState<{
    playerImage: HTMLImageElement | null;
    tileImage: HTMLImageElement | null;
    coinImage: HTMLImageElement | null;
    stoneImage: HTMLImageElement | null;
    treeImage: HTMLImageElement | null;
    tree2Image: HTMLImageElement | null;
    flowerImage: HTMLImageElement | null;
    smallBushImage: HTMLImageElement | null;
    largeBushImage: HTMLImageElement | null;
    houseImage: HTMLImageElement | null;
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
      // console.log(`[GameCanvas processRawLevelData] Called with canvasSize W: ${currentCanvasWidth} H: ${currentCanvasHeight} for level: ${levelPath}`);
      if (!currentRawLevelData || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
        // console.warn("[GameCanvas processRawLevelData] Invalid input, returning null.");
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
      
      if (levelPath === "/levels/level2.json") { // Specific logic for p3 on level2
        const p_ground_tile = processedTiles.find(t => t.id === 'p_ground');
        if (p_ground_tile) {
            const p_ground_top_y = p_ground_tile.y;
            p3BasePosition.current = { x: (currentCanvasWidth / 2) - (P3_SIZE_W / 2), y: p_ground_top_y - 300 };
            // console.log("[processRawLevelData] Level 2: p_ground_top_y:", p_ground_top_y, "p3BasePosRef.current:", p3BasePosition.current);

            p3InterestPoints.current = [
              { x: 0, y: 0 }, 
              { x: P3_DRIFT_RANGE, y: 0 },
              { x: -P3_DRIFT_RANGE, y: 0 },
              { x: 0, y: P3_DRIFT_RANGE },
              { x: 0, y: -P3_DRIFT_RANGE },
            ];
            p3CurrentTargetIndex.current = 0; 
            p3MovementStateRef.current = null; 

            const p3Tile: ProcessedTile = {
              id: 'p3',
              x: p3BasePosition.current.x + p3InterestPoints.current[0].x,
              y: p3BasePosition.current.y + p3InterestPoints.current[0].y,
              width: P3_SIZE_W,
              height: P3_SIZE_H,
              type: 1, 
              color: 'hsl(var(--chart-3))', 
              vx: 0, 
              direction: 0,
              layer: 'background',
            };
            processedTiles.push(p3Tile);
            // console.log("[processRawLevelData] Level 2: Added p3Tile:", p3Tile);
        } else {
            // console.warn("[processRawLevelData] Level 2: p_ground tile not found, cannot position p3 relative to it.");
        }
      }

      const result: ProcessedLevelData = {
        playerStart: { xPx: playerStartX, yPx: playerStartY },
        tiles: processedTiles,
      };
      
      // console.log(`[processRawLevelData] Successfully processed. Player:`, {x: result.playerStart.xPx, y: result.playerStart.yPx}, "Number of tiles:", result.tiles.length);
      return result;
    },
    [parseDimension, levelPath, PLAYER_WIDTH, PLAYER_HEIGHT, P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE] 
  );

  const spawnNewCoinPair = useCallback(
    (currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number, currentCanvasHeight: number): CoinState[] => {
      // console.log(`[spawnNewCoinPair] Called. Canvas W:${currentCanvasWidth}, H:${currentCanvasHeight}. ProcessedLevel exists: ${!!currentProcessedLevel}`);
      if (!currentProcessedLevel || currentCanvasWidth <= 0 || currentCanvasHeight <= 0) {
        // console.warn("[spawnNewCoinPair] Pre-conditions not met (no processed level or invalid canvas size). No coins spawned.");
        return [];
      }

      const newCoins: CoinState[] = [];
      const p_ground = currentProcessedLevel.tiles.find(t => t.id === 'p_ground');
      if (!p_ground) {
        // console.warn("[spawnNewCoinPair] p_ground not found. Cannot determine coin spawn zone. No coins spawned.");
        return [];
      }
      const p_groundTopY = p_ground.y;
      
      let gamePlatforms = currentProcessedLevel.tiles.filter(t => t.type === 1 && t.id !== 'p_ground' && t.id !== 'house_roof_platform');
      if (levelPath === "/levels/level2.json") { // Exclude p3 for level 2 coin spawning considerations
          gamePlatforms = gamePlatforms.filter(t => t.id !== 'p3'); 
      }

      let actualHighestPlatformTopY = p_groundTopY;
      if (gamePlatforms.length > 0) {
        actualHighestPlatformTopY = Math.min(p_groundTopY, ...gamePlatforms.map(p => p.y));
      }
      const ySpawnZoneBottomCoinTopEdge = p_groundTopY - COIN_VERTICAL_SPAWN_BOTTOM_OFFSET - COIN_SIZE;
      const ySpawnZoneTopCoinTopEdge = actualHighestPlatformTopY - MAX_JUMP_HEIGHT - COIN_SPAWN_TOP_MARGIN - COIN_SIZE;

      if (ySpawnZoneTopCoinTopEdge >= ySpawnZoneBottomCoinTopEdge) {
          // console.warn(`[spawnNewCoinPair] Invalid spawn zone: Top edge (${ySpawnZoneTopCoinTopEdge.toFixed(2)}) is above or at bottom edge (${ySpawnZoneBottomCoinTopEdge.toFixed(2)}). Highest platform top Y: ${actualHighestPlatformTopY.toFixed(2)}. p_ground top Y: ${p_groundTopY.toFixed(2)}. No coins spawned.`);
          return [];
      }
      
      // console.log(`[spawnNewCoinPair] Spawning coins. Zone Top: ${ySpawnZoneTopCoinTopEdge.toFixed(2)}, Zone Bottom: ${ySpawnZoneBottomCoinTopEdge.toFixed(2)}, Highest Platform Top: ${actualHighestPlatformTopY.toFixed(2)}`);
      
      for (let i = 0; i < 10; i++) { 
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
      // console.log(`[spawnNewCoinPair] Created ${newCoins.length} coins. Coins:`, newCoins);
      return newCoins;
    },
    [levelPath, COIN_SIZE, COIN_VERTICAL_SPAWN_BOTTOM_OFFSET, MAX_JUMP_HEIGHT, COIN_SPAWN_TOP_MARGIN, COIN_SPAWN_STAGGER_DELAY, COIN_ROTATION_SPEED_MIN, COIN_ROTATION_SPEED_MAX]
  );

  const spawnSingleEnemy = useCallback(
    (currentProcessedLevel: ProcessedLevelData | null, currentCanvasWidth: number): EnemyState | null => {
      if (!currentProcessedLevel) return null;
  
      const p1_id_options = ['p1', 'floating_platform_left', 'floating_platform_1'];
      const p2_id_options = ['p2', 'floating_platform_right', 'floating_platform_2'];

      const p1 = currentProcessedLevel.tiles.find(t => p1_id_options.includes(t.id));
      const p2 = currentProcessedLevel.tiles.find(t => p2_id_options.includes(t.id));
        
      if (!p1 || !p2) {
        // console.warn(`[spawnSingleEnemy] P1 or P2 not found for level ${levelPath} using options ${p1_id_options.join('/')} and ${p2_id_options.join('/')}, cannot spawn enemy.`);
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
      // console.log("[GameCanvas spawnSingleEnemy] Spawned new enemy:", newEnemy);
      return newEnemy;
    },
    [levelPath, ENEMY_RADIUS, PLATFORM_SPEED, ENEMY_SPEED_FACTOR, ENEMY_COLOR] 
  );

  // Effect 1: Set isClient and load assets
  useEffect(() => {
    // console.log(`[GameCanvas Effect 1] Running: Set isClient, Load Assets. Current isClient state: ${isClient}`);
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
    cImg.src = `/assets/images/thankscoin.png`;
    cImg.setAttribute('data-ai-hint', 'collectible coin gold');
    cImg.onload = () => setAssets(prev => ({ ...prev, coinImage: cImg, coinImageLoaded: true }));
    cImg.onerror = () => { console.error("Failed to load coin image."); setAssets(prev => ({ ...prev, coinImageLoaded: true })); };
    
    const stImg = new Image();
    stImg.src = `/assets/images/stone1.jpg`;
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
    // console.log(`[GameCanvas Effect 2] Running: Apply canvasSize to attributes. Current canvasSize: {width: ${canvasSize.width}, height: ${canvasSize.height}}`);
    if (canvasRef.current) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      // console.log(`[GameCanvas Effect 2] Set canvas DOM size to W:${canvasRef.current.width} H:${canvasRef.current.height}`);
    }
  }, [canvasSize]);

  // Effect 3: Observe parent size and update canvasSize state
  const updateCanvasSizeState = useCallback((entries?: ResizeObserverEntry[]) => {
    const canvas = canvasRef.current;
    if (canvas && canvas.parentElement) {
      const newWidth = canvas.parentElement.clientWidth;
      const newHeight = canvas.parentElement.clientHeight;

      setCanvasSize(currentSize => {
        if (currentSize.width !== newWidth || currentSize.height !== newHeight) {
          // console.log(`[GameCanvas Effect 3 updateCanvasSizeState] Updating canvasSize from W:${currentSize.width} H:${currentSize.height} to W:${newWidth} H:${newHeight}`);
          return { width: newWidth > 0 ? newWidth : 0, height: newHeight > 0 ? newHeight : 0 };
        }
        return currentSize;
      });
    }
  }, [setCanvasSize]); 

  useEffect(() => {
    // console.log(`[GameCanvas Effect 3] Running: Observe parent size`);
    const canvas = canvasRef.current;
    if (!isClient || !canvas || !canvas.parentElement) return;
    
    updateCanvasSizeState(); 

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateCanvasSizeState);
      resizeObserver.observe(canvas.parentElement);
    } else {
      window.addEventListener('resize', updateCanvasSizeState);
    }

    return () => {
      // console.log("[GameCanvas Effect 3] Cleanup: Removing resize observer/listener.");
      if (resizeObserver && canvas.parentElement) {
        resizeObserver.unobserve(canvas.parentElement);
      } else {
        window.removeEventListener('resize', updateCanvasSizeState);
      }
    };
  }, [isClient, updateCanvasSizeState]);


  // Effect 4: Load raw level data
  useEffect(() => {
    // console.log(`[GameCanvas Effect 4] Running: Load raw level data for levelPath: ${levelPath}. isClient: ${isClient}`);
    if (!isClient || !levelPath) {
      if (isLoading) setIsLoading(false); 
      return;
    }
    
    setRawLevelData(null); 
    if (!isLoading) setIsLoading(true); 

    loadLevel(levelPath)
      .then(data => {
        if (data) {
          // console.log(`[GameCanvas Effect 4] Successfully loaded rawLevelData for ${levelPath}`);
          setRawLevelData(data);
        } else {
          // console.error(`[GameCanvas Effect 4] Failed to load rawLevelData for ${levelPath}. Setting rawLevelData to null.`);
          setRawLevelData(null);
        }
      })
      .catch(error => {
        // console.error(`[GameCanvas Effect 4] Error in loadLevel promise for ${levelPath}:`, error);
        setRawLevelData(null);
      });
  }, [levelPath, isClient, setIsLoading, setRawLevelData]); 


  // Effect 5: Process raw level data and initialize player
  useEffect(() => {
    const allAssetsLoaded = assets.playerImageLoaded && assets.tileImageLoaded && assets.coinImageLoaded && assets.stoneImageLoaded && assets.treeImageLoaded && assets.tree2ImageLoaded && assets.flowerImageLoaded && assets.smallBushImageLoaded && assets.largeBushImageLoaded && assets.houseImageLoaded;
    // console.log(`[GameCanvas Effect 5] Running: Process raw level data. isClient: ${isClient}, rawLevelData: ${!!rawLevelData}, canvasSize: W${canvasSize.width}xH${canvasSize.height}, allAssetsLoaded: ${allAssetsLoaded}`);

    if (!isClient || !rawLevelData || canvasSize.width === 0 || canvasSize.height === 0 || !allAssetsLoaded) {
        // console.log("[GameCanvas Effect 5] Critical data missing, ensuring isLoading is true if not already.");
        if (!isLoading) setIsLoading(true); 
        setProcessedLevel(null);
        return;
    }
    
    // console.log("[GameCanvas Effect 5] Conditions met, processing rawLevelData...");
    if (!isLoading) setIsLoading(true); 
    setActiveCoins([]); 
    setActiveEnemies([]); 

    const newProcessedLevel = processRawLevelData(rawLevelData, canvasSize.width, canvasSize.height);
    
    if (newProcessedLevel) {
      // console.log("[GameCanvas Effect 5] Successfully processed level. Setting newProcessedLevel and newPlayer.");
      const newPlayer: PlayerState = {
        x: newProcessedLevel.playerStart.xPx,
        y: newProcessedLevel.playerStart.yPx,
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
      setProcessedLevel(newProcessedLevel);
      // isLoading will be set to false in Effect 7
    } else {
      // console.warn("[GameCanvas Effect 5] processRawLevelData returned null. Setting processedLevel to null.");
      setProcessedLevel(null);
      if (isLoading) setIsLoading(false); 
    }
  }, [
    isClient, rawLevelData, canvasSize, assets, 
    processRawLevelData, setIsLoading, setProcessedLevel, setActiveCoins, setActiveEnemies,
    parentPlayerRef, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR, isLoading // Added isLoading
  ]);


  // Effect 6: Sync processedLevel to ref
  useEffect(() => {
    // console.log(`[GameCanvas Effect 6] Running. processedLevel updated. Is null: ${!processedLevel}`);
    processedLevelRef.current = processedLevel;
  }, [processedLevel]);


  // Effect 7: Spawn entities and finish loading
  useEffect(() => {
    // console.log(`[GameCanvas Effect 7] Running. isLoading: ${isLoading}, isClient: ${isClient}, processedLevel: ${!!processedLevelRef.current}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, levelPath: ${levelPath}, activeCoins.length: ${activeCoins.length}`);

    if (!isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
      // console.log("[GameCanvas Effect 7] Pre-conditions (isClient, processedLevel, canvasSize) not met for entity spawn, returning.");
      return;
    }
    
    if (!isLoading) { // Only run if still loading
        // console.log("[GameCanvas Effect 7] isLoading is false, skipping spawn logic (already loaded or loading finished).");
        return;
    }

    let coinsSpawnedOrAttempted = activeCoins.length > 0;
    if (!coinsSpawnedOrAttempted && processedLevelRef.current.tiles.length > 0) {
        // console.log(`[GameCanvas Effect 7] Spawning new coin pair for level ${levelPath}`);
        const newCoins = spawnNewCoinPair(processedLevelRef.current, canvasSize.width, canvasSize.height);
        // console.log(`[GameCanvas Effect 7] spawnNewCoinPair returned ${newCoins.length} coins. Setting activeCoins.`);
        setActiveCoins(newCoins);
        coinsSpawnedOrAttempted = true;
    } else if (processedLevelRef.current.tiles.length === 0) {
        // console.log("[GameCanvas Effect 7] No tiles in level, skipping coin spawn.");
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
      // console.log(`[GameCanvas Effect 7] Enemies not spawned for level: ${levelPath}`);
      enemiesSpawnedOrAttempted = true; 
    }
    
    if (coinsSpawnedOrAttempted && enemiesSpawnedOrAttempted) {
        // console.log("[GameCanvas Effect 7] All entities attempted or not needed, setting isLoading to false.");
        setIsLoading(false);
    } else {
        // console.log(`[GameCanvas Effect 7] Still waiting for entities. coinsSpawnedOrAttempted: ${coinsSpawnedOrAttempted}, enemiesSpawnedOrAttempted: ${enemiesSpawnedOrAttempted}`);
    }

  }, [
      isClient, isLoading, processedLevel, canvasSize, levelPath, 
      activeCoins.length, activeEnemies.length, // Keep these to re-evaluate if entities disappear
      spawnNewCoinPair, spawnSingleEnemy, setActiveCoins, setActiveEnemies, setIsLoading
  ]);

  // Effect 8: Respawn coins
   useEffect(() => {
    // console.log(`[GameCanvas Effect 8] Running: Check coin respawn. isLoading: ${isLoading}, processedLevel: ${!!processedLevelRef.current}`);
    if (isLoading || !isClient || !processedLevelRef.current || canvasSize.width === 0 || canvasSize.height === 0) {
      return;
    }

    const allCollectedAndParticlesGone = activeCoins.length > 0 && activeCoins.every(c => c.isCollected && c.particles.length === 0 && !c.isVisuallyPresent);
    if (allCollectedAndParticlesGone) {
      // console.log("[GameCanvas Effect 8] All coins collected and particles gone, spawning new pair.");
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
      requestAnimationFrame(gameLoop); // Keep trying
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
            } else { // Fallback if water_pit isn't defined, use canvas bounds
                 tileSpecificMovementBounds.left = 0;
                 tileSpecificMovementBounds.right = canvas.width;
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
    activePlatformId = null; 
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
    
    setActiveCoins(prevCoins => prevCoins.map(coin => {
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
        return newCoin;
    }));

    setActiveEnemies(prevEnemies => prevEnemies.map(enemy => {
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
        // console.log("[GameLoop] Collision with enemy!");
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
    }));

    updatedTiles.forEach(tile => {
      if (tile.layer !== 'foreground') { 
        if (tile.type === 1) { 
          if (tile.id.startsWith('stone_') && assets.stoneImage?.complete) {
            ctx.drawImage(assets.stoneImage, tile.x, tile.y, tile.width, tile.height);
          } else if (assets.tileImage?.complete) {
            ctx.drawImage(assets.tileImage, tile.x, tile.y, tile.width, tile.height);
          } else {
            ctx.fillStyle = tile.color;
            ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
          }
        } else { 
          if (tile.id === 'tree1' && assets.treeImage?.complete) {
            ctx.drawImage(assets.treeImage, tile.x, tile.y, tile.width, tile.height);
          } else if (tile.id === 'tree2' && assets.tree2Image?.complete) {
            ctx.drawImage(assets.tree2Image, tile.x, tile.y, tile.width, tile.height);
          } else if (tile.id === 'house1' && assets.houseImage?.complete) {
            ctx.drawImage(assets.houseImage, tile.x, tile.y, tile.width, tile.height);
          } else if (tile.id !== 'water_area' && tile.id !== 'water_pit') { 
            ctx.fillStyle = tile.color;
            ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
          }
        }
      }
    });

    const waterTile = updatedTiles.find(t => t.id === 'water_area' || t.id === 'water_pit');
    if (waterTile) {
      ctx.fillStyle = waterTile.color;
      ctx.fillRect(waterTile.x, waterTile.y, waterTile.width, waterTile.height);
    }
    
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
    canvasSize, levelPath, 
    GRAVITY, PLAYER_SPEED, JUMP_STRENGTH, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_COLOR,
    COIN_SIZE, COIN_FADE_IN_DURATION, COIN_PARTICLE_COUNT,
    COIN_PARTICLE_LIFESPAN, COIN_PARTICLE_SIZE, COIN_PARTICLE_SPEED_MULTIPLIER, COIN_PARTICLE_GRAVITY_FACTOR,
    ENEMY_COLOR, ENEMY_RADIUS, ENEMY_SPEED_FACTOR, PLATFORM_SPEED,
    P3_SIZE_W, P3_SIZE_H, P3_DRIFT_RANGE, P3_MOVEMENT_DURATION,
    p3BasePosition, p3InterestPoints, p3CurrentTargetIndex, p3MovementStateRef,
    parentPlayerRef, processRawLevelData, spawnNewCoinPair, spawnSingleEnemy 
  ]);

  // Effect 9: Game Loop Setup
  useEffect(() => {
    // console.log(`[GameCanvas Effect 9] Running: Game Loop Setup. isLoading: ${isLoading}, isClient: ${isClient}, canvasSize W:${canvasSize.width}H:${canvasSize.height}, processedLevelRef: ${!!processedLevelRef.current}`);
    let animationFrameId: number;
    
    const conditionsMet = isClient && !isLoading && canvasRef.current && canvasSize.width > 0 && canvasSize.height > 0 && processedLevelRef.current;

    if (conditionsMet) {
      // console.log("[GameCanvas Effect 9] Conditions MET. Starting game loop.");
      lastFrameTime.current = Date.now(); 
      animationFrameId = requestAnimationFrame(gameLoop);
    } else {
      // console.log(`[GameCanvas Effect 9] Conditions NOT MET.`);
    }

    return () => {
      // console.log("[GameCanvas Effect 9] Cleanup: Cancelling animation frame.");
      cancelAnimationFrame(animationFrameId);
    };
  }, [isClient, isLoading, canvasSize, processedLevelRef, gameLoop]); // Depend on processedLevelRef.current might be tricky, but gameLoop depends on it.
  
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
  
  // console.log(`[GameCanvas] Before return. isClient: ${isClient}, isLoading: ${isLoading}`);
  
  return (
    <canvas ref={canvasRef} className="w-full h-full block" tabIndex={0} />
  );
}
