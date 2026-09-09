export const links = {
    ministrySite: 'https://www.gov.il/he/departments/molsa/govil-landing-page',
    ministrySiteAbout: 'https://www.gov.il/he/departments/topics/molsa-policies-and-procedures/govil-landing-page',
    phone: '118',
    facebook: 'https://www.facebook.com/molsa.gov.il',
    x: 'https://x.com/Social_Israel',
    instagram: 'https://www.instagram.com/israel_social/',
    contact: 'https://www.gov.il/he/service/contact-the-ministry-of-labor-welfare-and-social-services',
    organizationStructure: 'https://www.gov.il/he/pages/molsa-organization-structure',
    seniorPositions: 'https://www.gov.il/he/Departments/DynamicCollectors/molsa-senior-positions?skip=0&limit=10',
    accessibilityStatement: 'https://www.gov.il/he/pages/accessibility-statement'
}

export const graphColors = [
  '#78D1F7',
  '#0068F5',
  '#064A9D',
  '#FF70BF',
  '#FF8497',
  '#DEAAFF',
  '#70D7BD',
  '#00F587',
  '#FFBF1F',
  '#F2DD54'
];

/**
 * High contrast replaces the palette with three dark grays - hue cannot be
 * relied on. Contrast against the white high-contrast background: 17.4:1,
 * 8.5:1 and 4.7:1, so all three clear both the 4.5:1 and 3:1 thresholds.
 * Keep in sync with $contrast-tones in graph.component.scss.
 */
export const contrastTones = ['#1A1A1A', '#4D4D4D', '#737373'];

/** The texture is drawn in white so it reads on all three tones */
const decalInk = '#FFFFFF';

/**
 * Seven textures, deliberately plain: stripes, diagonals, dots, checks, grid.
 * Keep in sync with the .tooltip-texture-- rules in graph.component.scss.
 */
export const contrastDecals = [
  // horizontal stripes
  { color: decalInk, dashArrayX: [1, 0], dashArrayY: [2, 4] },
  // vertical stripes
  { color: decalInk, dashArrayX: [2, 4], dashArrayY: [1, 0] },
  // diagonal stripes, leaning right
  { color: decalInk, dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: Math.PI / 4 },
  // diagonal stripes, leaning left
  { color: decalInk, dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: -Math.PI / 4 },
  // dots
  { color: decalInk, symbol: 'circle', symbolSize: 0.6, dashArrayX: [[6, 6], [0, 6, 6, 0]], dashArrayY: [6, 0] },
  // checkerboard
  { color: decalInk, dashArrayX: [[4, 4], [0, 4, 4, 0]], dashArrayY: [4, 0] },
  // grid
  { color: decalInk, dashArrayX: [[1, 0], [1, 5]], dashArrayY: [1, 0, 5, 0] }
];

export interface ContrastStyle {
  /** Fill for a bar, stroke for a line */
  tone: string;
  /** Left out for the three full fills */
  decal?: typeof contrastDecals[number];
  /** A canvas texture cannot fill a stroke, so lines carry the identity as a dash... */
  lineDash: string | number[];
  /** ...and a symbol on each point, for lines that cross */
  lineSymbol: string;
}

/**
 * One style per slot of graphColors, in the same order. The first three are
 * full fills - black and the two grays, no texture - and the remaining seven
 * add a texture over a repeating tone. Ten styles for ten palette colours,
 * so no two series in a graph can collide.
 */
export const contrastStyles: ContrastStyle[] = [
  { tone: contrastTones[0], lineDash: 'solid', lineSymbol: 'circle' },
  { tone: contrastTones[1], decal: contrastDecals[4], lineDash: [10, 4, 2, 4, 2, 4], lineSymbol: 'emptyCircle' },
  { tone: contrastTones[2], lineDash: 'solid', lineSymbol: 'triangle' },
  { tone: contrastTones[0], decal: contrastDecals[0], lineDash: [10, 6], lineSymbol: 'diamond' },
  { tone: contrastTones[1], decal: contrastDecals[1], lineDash: [2, 4], lineSymbol: 'roundRect' },
  { tone: contrastTones[2], decal: contrastDecals[2], lineDash: [12, 5, 2, 5], lineSymbol: 'pin' },
  { tone: contrastTones[0], decal: contrastDecals[3], lineDash: [20, 7], lineSymbol: 'arrow' },
  { tone: contrastTones[1], lineDash: 'solid', lineSymbol: 'rect' },
  { tone: contrastTones[2], decal: contrastDecals[5], lineDash: [2, 4, 10, 4], lineSymbol: 'emptyRect' },
  { tone: contrastTones[0], decal: contrastDecals[6], lineDash: [4, 4, 4, 12], lineSymbol: 'emptyTriangle' }
];