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

export const contrastTones = ['#1A1A1A', '#4D4D4D', '#737373'];

const decalInk = '#FFFFFF';

export const contrastDecals = [
  { color: decalInk, dashArrayX: [1, 0], dashArrayY: [2, 4] },
  { color: decalInk, dashArrayX: [2, 4], dashArrayY: [1, 0] },
  { color: decalInk, dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: Math.PI / 4 },
  { color: decalInk, dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: -Math.PI / 4 },
  { color: decalInk, symbol: 'circle', symbolSize: 0.6, dashArrayX: [[6, 6], [0, 6, 6, 0]], dashArrayY: [6, 0] },
  { color: decalInk, dashArrayX: [[4, 4], [0, 4, 4, 0]], dashArrayY: [4, 0] },
  { color: decalInk, dashArrayX: [[1, 0], [1, 5]], dashArrayY: [1, 0, 5, 0] }
];

export interface ContrastStyle {
  tone: string;
  decal?: typeof contrastDecals[number];
  lineDash: string | number[];
  lineSymbol: string;
}

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