import * as XLSX from 'xlsx';

const REQUIRED_DATA_COLS = [
  'Section', 'SKU', 'ASIN', 'Parent ASIN', 'Category',
  'Available', 'Inbound', 'Reserved',
  'Amazon Days', 'Display Days', 'Out Of Stock',
  'Weighted Velocity', 'Min Level', 'Status', 'QTY',
];

const REQUIRED_SUMMARY_COLS = ['Section', 'SKU Count', 'Total Units'];

export async function parseFile(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  if (!wb.SheetNames.includes('Miami Reorder')) {
    throw new Error('Missing sheet "Miami Reorder"');
  }
  if (!wb.SheetNames.includes('Summary')) {
    throw new Error('Missing sheet "Summary"');
  }

  const data = XLSX.utils.sheet_to_json(wb.Sheets['Miami Reorder'], { defval: '' });
  const summary = XLSX.utils.sheet_to_json(wb.Sheets['Summary'], { defval: '' });

  if (data.length === 0) {
    throw new Error('"Miami Reorder" sheet has no data rows');
  }

  const dataCols = Object.keys(data[0]);
  const missingData = REQUIRED_DATA_COLS.filter(c => !dataCols.includes(c));
  if (missingData.length) {
    throw new Error(`Miami Reorder sheet missing columns: ${missingData.join(', ')}`);
  }

  if (summary.length === 0) {
    throw new Error('"Summary" sheet has no data rows');
  }

  const summaryCols = Object.keys(summary[0]);
  const missingSummary = REQUIRED_SUMMARY_COLS.filter(c => !summaryCols.includes(c));
  if (missingSummary.length) {
    throw new Error(`Summary sheet missing columns: ${missingSummary.join(', ')}`);
  }

  return { data, summary };
}
