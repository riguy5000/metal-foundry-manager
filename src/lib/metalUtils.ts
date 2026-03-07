/**
 * Utility functions for metal type display logic
 */

export function getMetalCardClass(colorGroup: string, metalFamily: string): string {
  const color = colorGroup?.toLowerCase() ?? '';
  const family = metalFamily?.toLowerCase() ?? '';
  
  if (family === 'platinum') return 'metal-card-platinum';
  if (family === 'palladium') return 'metal-card-palladium';
  if (family === 'silver') return 'metal-card-silver';
  if (color === 'red') return 'metal-card-red';
  if (color === 'rose') return 'metal-card-rose';
  if (color === 'white') return 'metal-card-white';
  return 'metal-card-yellow';
}

export function getMetalDotClass(colorGroup: string, metalFamily: string): string {
  const color = colorGroup?.toLowerCase() ?? '';
  const family = metalFamily?.toLowerCase() ?? '';
  
  if (family === 'platinum') return 'metal-dot-platinum';
  if (family === 'palladium') return 'metal-dot-palladium';
  if (family === 'silver') return 'metal-dot-silver';
  if (color === 'red') return 'metal-dot-red';
  if (color === 'rose') return 'metal-dot-rose';
  if (color === 'white') return 'metal-dot-white';
  return 'metal-dot-yellow';
}

export function getMetalAccentColor(colorGroup: string, metalFamily: string): string {
  const color = colorGroup?.toLowerCase() ?? '';
  const family = metalFamily?.toLowerCase() ?? '';
  
  if (family === 'platinum') return 'text-metal-platinum';
  if (family === 'palladium') return 'text-metal-palladium';
  if (family === 'silver') return 'text-metal-silver';
  if (color === 'red') return 'text-metal-red';
  if (color === 'rose') return 'text-metal-rose';
  if (color === 'white') return 'text-metal-white';
  return 'text-metal-yellow';
}

/** Generate a flask code: FL-YYMMDD-SEQ */
export function generateFlaskCode(sequence: number = 1): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const seq = String(sequence).padStart(3, '0');
  return `FL-${yy}${mm}${dd}-${seq}`;
}

/** Group metals by family for hierarchical selection */
export function groupMetalsByFamily(metals: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {};
  for (const m of metals) {
    const family = m.metal_family || 'Other';
    if (!groups[family]) groups[family] = [];
    groups[family].push(m);
  }
  return groups;
}
