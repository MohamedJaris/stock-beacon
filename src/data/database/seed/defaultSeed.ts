export interface DefaultUnitDefinition {
  name: string;
  symbol: string;
  allowFractional: boolean;
}

export const DEFAULT_UNITS_OF_MEASURE: DefaultUnitDefinition[] = [
  { name: 'Pieces', symbol: 'pcs', allowFractional: false },
  { name: 'Units', symbol: 'units', allowFractional: false },
  { name: 'Kilograms', symbol: 'kg', allowFractional: true },
  { name: 'Grams', symbol: 'g', allowFractional: true },
  { name: 'Litres', symbol: 'L', allowFractional: true },
  { name: 'Millilitres', symbol: 'mL', allowFractional: true },
  { name: 'Metres', symbol: 'm', allowFractional: true },
  { name: 'Centimetres', symbol: 'cm', allowFractional: true },
  { name: 'Feet', symbol: 'ft', allowFractional: true },
  { name: 'Boxes', symbol: 'boxes', allowFractional: false },
  { name: 'Packs', symbol: 'packs', allowFractional: false },
  { name: 'Dozens', symbol: 'doz', allowFractional: false },
  { name: 'Rolls', symbol: 'rolls', allowFractional: true },
];

export interface DefaultCategorySeed {
  name: string;
  colorHex: string;
  description: string;
}

export function getSuggestedCategoriesForBusinessType(
  businessType: string
): DefaultCategorySeed[] {
  const lower = businessType.toLowerCase();
  if (lower.includes('textile') || lower.includes('apparel') || lower.includes('garment') || lower.includes('dress')) {
    return [
      {
        name: 'Ready-Made Dresses',
        colorHex: '#2563EB',
        description: 'Ready-made dresses & shirts (Sizes: S, M, L, XL, XXL)',
      },
      {
        name: 'Pants & Trousers',
        colorHex: '#0D9488',
        description: 'Pants, jeans & trousers (Waist sizes: 30, 32, 34, 36, 38, 40)',
      },
      {
        name: 'Nighties',
        colorHex: '#7C3AED',
        description: 'Nighties by style/type (Elastic, Zip, Button, etc.)',
      },
      {
        name: 'Ladies Tops & Kurtis',
        colorHex: '#DB2777',
        description: 'Ladies tops, kurtis & tunics (Sizes: S, M, L, XL, XXL)',
      },
      {
        name: 'Sarees',
        colorHex: '#D97706',
        description: 'Named sarees (Silk, Cotton, Designer, Fancy sarees)',
      },
      {
        name: 'Fabrics & Accessories',
        colorHex: '#059669',
        description: 'Unstitched fabrics, rolls & garment accessories',
      },
    ];
  }
  if (lower.includes('stationery')) {
    return [
      { name: 'Paper & Copier Reams', colorHex: '#2563EB', description: 'A4 reams, art paper, envelopes' },
      { name: 'Notebooks & Registers', colorHex: '#059669', description: 'Notebooks, ledgers, diaries' },
      { name: 'Pens & Writing', colorHex: '#7C3AED', description: 'Pens, pencils, markers, highlighters' },
      { name: 'Office Supplies', colorHex: '#D97706', description: 'Files, folders, staplers, adhesives' },
    ];
  }
  if (lower.includes('grocery')) {
    return [
      { name: 'Grains, Rice & Pulses', colorHex: '#D97706', description: 'Staple grains and lentils' },
      { name: 'Cooking Oils & Spices', colorHex: '#DC2626', description: 'Edible oils, masalas, spices' },
      { name: 'Packaged Foods & Snacks', colorHex: '#2563EB', description: 'Biscuits, snacks, beverages' },
      { name: 'Household & Cleaning', colorHex: '#0D9488', description: 'Soaps, detergents, cleaning supplies' },
    ];
  }
  if (lower.includes('hardware') || lower.includes('electrical')) {
    return [
      { name: 'Fasteners & Fittings', colorHex: '#475569', description: 'Screws, bolts, hinges, locks' },
      { name: 'Cables, Wires & Switches', colorHex: '#2563EB', description: 'Electrical wiring and switchgear' },
      { name: 'Hand & Power Tools', colorHex: '#D97706', description: 'Drills, wrenches, cutting tools' },
      { name: 'Plumbing & Paints', colorHex: '#059669', description: 'Pipes, valves, coatings, primers' },
    ];
  }
  return [
    { name: 'General Merchandise', colorHex: '#2563EB', description: 'Primary stock items' },
    { name: 'Fast-Moving Items', colorHex: '#059669', description: 'Daily high-turnover items' },
    { name: 'Supplies & Packaging', colorHex: '#7C3AED', description: 'Consumables and packing materials' },
  ];
}
