import type { RawLevelData } from '@/types/game';

export async function loadLevel(levelPath: string): Promise<RawLevelData | null> {
  try {
    const response = await fetch(levelPath);
    if (!response.ok) {
      console.error(`Failed to load level: ${response.statusText} (${response.status}) from ${levelPath}`);
      return null;
    }
    // Make sure to parse as JSON
    const rawData: RawLevelData = await response.json();
    return rawData;
  } catch (error) {
    console.error(`Error loading or parsing level from ${levelPath}:`, error);
    return null;
  }
}
