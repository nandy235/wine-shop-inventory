import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './SalesReport.css';
import { apiGet } from './apiUtils';
import { getCurrentUser } from './authUtils';

// Business date helper (11:30 AM IST boundary)
const calculateBusinessDate = () => {
  const now = new Date();
  const istTimeString = now.toLocaleString('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const istTime = new Date(istTimeString);
  const isBeforeStart = istTime.getHours() < 11 || (istTime.getHours() === 11 && istTime.getMinutes() < 30);
  if (isBeforeStart) {
    const y = new Date(istTime);
    y.setDate(y.getDate() - 1);
    return y.toLocaleDateString('en-CA');
  }
  return istTime.toLocaleDateString('en-CA');
};

const getWeeksInMonth = (year, month) => {
  const weeks = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  let currentWeekStart = new Date(firstDay);
  let weekNumber = 1;
  while (currentWeekStart <= lastDay) {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(currentWeekStart.getDate() + 6);
    if (weekEnd > lastDay) weekEnd.setTime(lastDay.getTime());
    weeks.push({
      weekNumber,
      startDate: currentWeekStart.toLocaleDateString('en-CA'),
      endDate: weekEnd.toLocaleDateString('en-CA'),
      label: `Week ${weekNumber} (${currentWeekStart.getDate()}-${weekEnd.getDate()})`
    });
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    weekNumber++;
  }
  return weeks;
};

const getMonthsInYear = (year) => {
  const months = [];
  for (let i = 1; i <= 12; i++) {
    const mStart = new Date(year, i - 1, 1);
    const mEnd = new Date(year, i, 0);
    months.push({
      monthNumber: i,
      startDate: mStart.toLocaleDateString('en-CA'),
      endDate: mEnd.toLocaleDateString('en-CA'),
      label: mStart.toLocaleDateString('en-US', { month: 'long' })
    });
  }
  return months;
};

function SalesReport({ onNavigate, onLogout }) {
  const businessDate = calculateBusinessDate();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Auth and shop
  const user = useMemo(() => getCurrentUser(), []);
  const shopName = user.shopName || 'Liquor Ledger';

  // Controls
  const [reportType, setReportType] = useState('daily');
  const [selectedDate, setSelectedDate] = useState(businessDate);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [customStartDate, setCustomStartDate] = useState(businessDate);
  const [customEndDate, setCustomEndDate] = useState(businessDate);

  // Data
  const [rows, setRows] = useState([]);
  const [brandMap, setBrandMap] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [periodTotals, setPeriodTotals] = useState([]);

  const weeksInMonth = useMemo(() => {
    if (reportType === 'weekly') return getWeeksInMonth(selectedYear, selectedMonth);
    return [];
  }, [reportType, selectedYear, selectedMonth]);

  const monthsInYear = useMemo(() => {
    if (reportType === 'monthly') return getMonthsInYear(selectedYear);
    return [];
  }, [reportType, selectedYear]);

  // Load master brands for MRP, packQuantity, kind
  useEffect(() => {
    const loadMasterBrands = async () => {
      try {
        const response = await apiGet('/api/master-brands');
        const list = await response.json();
        const m = new Map();
        (list || []).forEach(b => {
          m.set(b.id, {
            id: b.id,
            brandNumber: b.brandNumber,
            brandName: b.name,
            size: b.size,
            sizeCode: b.sizeCode,
            packType: b.packType,
            packQuantity: b.packQuantity,
            mrp: b.mrp,
            brandKind: b.brandKind || null
          });
        });
        setBrandMap(m);
      } catch (_) {}
    };
    loadMasterBrands();
  }, []);

  // Helpers
  const toDatesArray = (start, end) => {
    const out = [];
    const c = new Date(start);
    const e = new Date(end);
    while (c <= e) {
      out.push(c.toLocaleDateString('en-CA'));
      c.setDate(c.getDate() + 1);
    }
    return out;
  };

  const getDateRange = useCallback(() => {
    switch (reportType) {
      case 'daily':
        return { startDate: selectedDate, endDate: selectedDate };
      case 'weekly': {
        const w = weeksInMonth.find(w => w.weekNumber === selectedWeek);
        if (!w) return { startDate: businessDate, endDate: businessDate };
        return { startDate: w.startDate, endDate: w.endDate };
      }
      case 'monthly': {
        const mStart = new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString('en-CA');
        const mEnd = new Date(selectedYear, selectedMonth, 0).toLocaleDateString('en-CA');
        return { startDate: mStart, endDate: mEnd };
      }
      case 'yearly': {
        const yStart = new Date(selectedYear, 0, 1).toLocaleDateString('en-CA');
        const yEnd = new Date(selectedYear, 11, 31).toLocaleDateString('en-CA');
        return { startDate: yStart, endDate: yEnd };
      }
      case 'custom':
        return { startDate: customStartDate, endDate: customEndDate };
      default:
        return { startDate: businessDate, endDate: businessDate };
    }
  }, [reportType, selectedDate, weeksInMonth, selectedWeek, businessDate, selectedYear, selectedMonth, customStartDate, customEndDate]);

  // Brand base name (group header)
  const getBaseName = (productName) => {
    return (productName || '').replace(/\s+(90ml|180ml|375ml|750ml|1000ml|2000ml|60ml|500ml|650ml|330ml|275ml).*$/i, '').trim();
  };

  // Fetch aggregated sales from backend (uses dsr.sales)
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!brandMap || brandMap.size === 0) {
        setLoading(false);
        return;
      }
      const { startDate, endDate } = getDateRange();
      // Determine display order from start date shop products
      const firstDayResponse = await apiGet(`/api/shop/products?date=${startDate}`);
      const firstDayJson = await firstDayResponse.json();
      const orderIndex = new Map();
      (firstDayJson.products || []).forEach((p, i) => orderIndex.set(`${p.brandNumber}|${p.sizeCode}`, i));

      const salesResponse = await apiGet(`/api/reports/sales?startDate=${startDate}&endDate=${endDate}`);
      const data = await salesResponse.json();

      const list = (data.rows || []).map(r => {
        const mb = brandMap.get(r.master_brand_id);
        const brandNumber = r.brand_number || mb?.brandNumber;
        const sizeCode = r.size_code || mb?.sizeCode;
        const brandName = r.brand_name || mb?.brandName || '';
        const key = `${brandNumber}|${sizeCode}`;
        return {
          id: r.master_brand_id,
          key,
          order: orderIndex.has(key) ? orderIndex.get(key) : 9999,
          brandNumber,
          brandName,
          baseName: getBaseName(brandName),
          sizeCode,
          size: r.size_ml || mb?.size,
          packType: mb?.packType,
          packQuantity: r.pack_quantity || mb?.packQuantity,
          brandKind: r.brand_kind || mb?.brandKind || 'Other',
          mrp: r.standard_mrp || mb?.mrp || 0,
          soldBottles: parseInt(r.sold_bottles, 10) || 0
        };
      });
      // Sort by initial view order, then size descending (numeric)
      list.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        const as = parseInt(a.size, 10) || 0;
        const bs = parseInt(b.size, 10) || 0;
        return bs - as;
      });

      setRows(list);

      // Build period totals (day-wise or month-wise)
      if (reportType === 'yearly') {
        const months = Array.from({ length: 12 }, (_, i) => i + 1);
        const ranges = months.map(m => ({
          start: new Date(selectedYear, m - 1, 1).toLocaleDateString('en-CA'),
          end: new Date(selectedYear, m, 0).toLocaleDateString('en-CA'),
          label: new Date(selectedYear, m - 1).toLocaleDateString('en-US', { month: 'long' })
        }));
        const results = await Promise.all(ranges.map(async r => {
          try {
            const response = await apiGet(`/api/reports/sales?startDate=${r.start}&endDate=${r.end}`);
            return await response.json();
          } catch (error) {
            return { rows: [] };
          }
        }));
        const totals = results.map((resp, idx) => {
          const sum = (resp.rows || []).reduce((s, rr) => s + ((parseInt(rr.sold_bottles, 10) || 0) * (parseFloat(rr.standard_mrp) || 0)), 0);
          return { label: ranges[idx].label, mrpTotal: sum };
        });
        setPeriodTotals(totals);
      } else {
        const dates = [];
        const c = new Date(startDate);
        const e = new Date(endDate);
        while (c <= e) { dates.push(c.toLocaleDateString('en-CA')); c.setDate(c.getDate() + 1); }
        const results = await Promise.all(dates.map(async d => {
          try {
            const response = await apiGet(`/api/reports/sales?startDate=${d}&endDate=${d}`);
            return await response.json();
          } catch (error) {
            return { rows: [] };
          }
        }));
        const totals = results.map((resp, idx) => {
          const sum = (resp.rows || []).reduce((s, rr) => s + ((parseInt(rr.sold_bottles, 10) || 0) * (parseFloat(rr.standard_mrp) || 0)), 0);
          const label = new Date(dates[idx]).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
          return { label, mrpTotal: sum };
        });
        setPeriodTotals(totals);
      }
    } catch (e) {
      setError(e.message || 'Failed to load data');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [getDateRange, brandMap]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totals = useMemo(() => {
    const totalBottles = rows.reduce((s, r) => s + (r.soldBottles || 0), 0);
    const totalMrp = rows.reduce((s, r) => s + (r.soldBottles * (r.mrp || 0)), 0);
    return { totalBottles, totalMrp };
  }, [rows]);

  // Kind totals for share table (MRP only)
  const kindTotals = useMemo(() => {
    const ORDER = ['Whisky', 'Beer', 'Brandy', 'Wine', 'Vodka', 'Rum', 'Gin', 'Liqueur', 'Tequila', 'Spirit', 'Ready to drink'];
    const canonical = (rawKind) => {
      switch ((rawKind || '').toString().trim().toUpperCase()) {
        case 'WHISKY':
        case 'WHISKEY':
          return 'whisky';
        case 'BEER':
          return 'beer';
        case 'BRANDY':
          return 'brandy';
        case 'WINE':
          return 'wine';
        case 'VODKA':
          return 'vodka';
        case 'RUM':
          return 'rum';
        case 'GIN':
          return 'gin';
        case 'LIQUEUR':
        case 'LIQUOR':
          return 'liqueur';
        case 'TEQUILA':
          return 'tequila';
        case 'SPIRIT':
          return 'spirit';
        case 'READY TO DRINK':
          return 'ready to drink';
        default:
          return 'other';
      }
    };
    const map = new Map();
    rows.forEach(r => {
      const key = canonical(r.brandKind);
      const mrpVal = (r.soldBottles || 0) * (r.mrp || 0);
      const prev = map.get(key) || { mrp: 0 };
      prev.mrp += mrpVal;
      map.set(key, prev);
    });
    const totalMrp = Array.from(map.values()).reduce((s, v) => s + (v.mrp || 0), 0) || 1;
    return ORDER.map(label => {
      const key = canonical(label);
      const agg = map.get(key) || { mrp: 0 };
      const share = ((agg.mrp || 0) * 100) / totalMrp;
      return { label, valueMrp: agg.mrp || 0, share };
    });
  }, [rows]);

  const formatCurrency = (n) => Math.round(n).toLocaleString('en-IN');

  const getReportTitle = () => {
    const { startDate, endDate } = getDateRange();
    const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    const monthPart = reportType === 'monthly' ? `${new Date(selectedYear, selectedMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} Report - ` : '';
    const rangePart = startDate === endDate ? `${fmt(startDate)}` : `${fmt(startDate)} to ${fmt(endDate)}`;
    return `${shopName} - Sales Report - ${monthPart}${rangePart}`;
  };

  const generatePDF = () => {
    const { startDate, endDate } = getDateRange();
    const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    const totalMrp = totals.totalMrp || 1;
    const kindSharePctTotal = (() => {
      try {
        const mrpSum = (kindTotals || []).reduce((sum, k) => sum + ((k && k.valueMrp) || 0), 0);
        return totalMrp > 0 ? ((mrpSum * 100) / totalMrp).toFixed(2) : '0.00';
      } catch (_) {
        return '0.00';
      }
    })();

    const monthStr = reportType === 'monthly'
      ? new Date(selectedYear, selectedMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : '';
    const rangeStr = startDate === endDate ? fmt(startDate) : `${fmt(startDate)} to ${fmt(endDate)}`;

    // Helpers for PDF rows
    const formatNum = (n) => Math.round(n).toLocaleString('en-IN');
    const calc = (r) => {
      const pq = parseInt(r.packQuantity, 10) || 0;
      const cases = pq > 0 ? Math.floor((r.soldBottles || 0) / pq) : null;
      const loose = pq > 0 ? ((r.soldBottles || 0) % pq) : (r.soldBottles || 0);
      const mrp = (r.soldBottles || 0) * (r.mrp || 0);
      const pct = totalMrp > 0 ? (mrp * 100) / totalMrp : 0;
      return { cases, loose, mrp, pct };
    };
    const rowHtml = (r, idx, bold = false) => {
      const { cases, loose, mrp, pct } = calc(r);
      return `
        <tr${bold ? ' class="bold"' : ''}>
          ${idx !== null ? `<td class="center">${idx}</td>` : ''}
          <td>${r.baseName}</td>
          <td class="center">${r.sizeCode || ''}</td>
          <td>${cases != null ? cases.toFixed(2) : '-'}</td>
          <td>${loose}</td>
          <td>${formatNum(mrp)}</td>
          <td>${pct.toFixed(2)}%</td>
        </tr>
      `;
    };

    const top25 = [...rows].sort((a,b)=>((b.soldBottles||0)*(b.mrp||0)) - ((a.soldBottles||0)*(a.mrp||0))).slice(0,25);
    const top25RowsHtml = top25.map((r,i)=> rowHtml(r, i+1)).join('');

    const kindOrder = ['Whisky','Beer','Brandy','Wine','Vodka','Rum','Gin','Liqueur','Tequila','Spirit','Ready to drink'];
    const canonicalKind = (raw) => {
      const t = (raw||'').toString().trim().toUpperCase();
      if (t.includes('WHISK')) return 'Whisky';
      if (t.includes('BEER')) return 'Beer';
      if (t.includes('BRANDY')) return 'Brandy';
      if (t.includes('WINE')) return 'Wine';
      if (t.includes('VODKA')) return 'Vodka';
      if (t.includes('RUM')) return 'Rum';
      if (t.includes('GIN')) return 'Gin';
      if (t.includes('LIQUEUR')||t.includes('LIQUOR')) return 'Liqueur';
      if (t.includes('TEQUILA')) return 'Tequila';
      if (t.includes('SPIRIT')) return 'Spirit';
      if (t.includes('READY')||t.includes('RTD')) return 'Ready to drink';
      return 'Other';
    };
    const byKind = new Map();
    rows.forEach(r=>{
      const k = canonicalKind(r.brandKind);
      if(!byKind.has(k)) byKind.set(k,[]);
      byKind.get(k).push(r);
    });
    const allKindsHtml = kindOrder.map(kind => {
      const list = (byKind.get(kind)||[]).slice().sort((a,b)=>((b.soldBottles||0)*(b.mrp||0)) - ((a.soldBottles||0)*(a.mrp||0)));
      if (list.length === 0) return '';
      const boldCount = list.length >= 5 ? 5 : 1;
      const rowsHtml = list.map((r, idx) => rowHtml(r, idx+1, idx < boldCount)).join('');
      const mrpTotalRaw = list.reduce((s,r)=> s + ((r.soldBottles||0)*(r.mrp||0)), 0);
      const mrpSum = Math.round(mrpTotalRaw).toLocaleString('en-IN');
      const pctSum = totalMrp > 0 ? ((mrpTotalRaw * 100) / totalMrp).toFixed(2) : '0.00';
      return `
        <div class="subhead-left">${kind}</div>
        <table>
          <thead>
            <tr>
              <th rowspan="2">S.No</th>
              <th rowspan="2">Brand</th>
              <th rowspan="2">Size</th>
              <th colspan="2">Quantity</th>
              <th rowspan="2">Sales (MRP)</th>
              <th rowspan="2">% of Total (MRP)</th>
            </tr>
            <tr>
              <th>Cases</th>
              <th>Bottles</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5"><strong>Total</strong></td>
              <td class="right total-red">${mrpSum}</td>
              <td class="right total-red">${pctSum}%</td>
            </tr>
          </tfoot>
        </table>
      `;
    }).join('');

    // Brand-wise table: group by baseName with size variants
    const byBase = new Map();
    rows.forEach(r => {
      if (!byBase.has(r.baseName)) byBase.set(r.baseName, []);
      byBase.get(r.baseName).push(r);
    });
    const brandWiseHtml = (() => {
      // Order brands and variants using the same latest order as View Current Stock
      const groups = Array.from(byBase.entries()).map(([base, list]) => {
        const groupOrder = Math.min(...list.map(r => (typeof r.order === 'number' ? r.order : 9999)));
        return [base, list, groupOrder];
      }).sort((a, b) => a[2] - b[2]);
      const body = groups.map(([base, list], gIdx) => {
        const sorted = list.slice().sort((a,b)=>{
          const ao = (typeof a.order === 'number' ? a.order : 9999);
          const bo = (typeof b.order === 'number' ? b.order : 9999);
          return ao - bo;
        });
        return sorted.map((r, idx) => {
          const pq = parseInt(r.packQuantity, 10) || 0;
          const cases = pq > 0 ? Math.floor((r.soldBottles || 0) / pq) : null;
          const loose = pq > 0 ? ((r.soldBottles || 0) % pq) : (r.soldBottles || 0);
          const mrp = (r.soldBottles || 0) * (r.mrp || 0);
          const pct = totalMrp > 0 ? (mrp * 100) / totalMrp : 0;
          return `
            <tr>
              ${idx === 0 ? `<td class="center" rowSpan="${sorted.length}">${gIdx + 1}</td>` : ''}
              ${idx === 0 ? `<td rowSpan="${sorted.length}">${base}</td>` : ''}
              <td class="center">${r.sizeCode || ''}</td>
              <td>${cases != null ? cases.toFixed(2) : '-'}</td>
              <td>${loose}</td>
              <td>${formatNum(mrp)}</td>
              <td>${pct.toFixed(2)}%</td>
            </tr>
          `;
        }).join('');
      }).join('');
      const total = Math.round(rows.reduce((s,r)=> s + ((r.soldBottles||0)*(r.mrp||0)), 0)).toLocaleString('en-IN');
      return `
        <table>
          <thead>
            <tr>
              <th rowspan="2">S.No</th>
              <th rowspan="2">Brand</th>
              <th rowspan="2">Size</th>
              <th colspan="2">Quantity</th>
              <th rowspan="2">Sales (MRP)</th>
              <th rowspan="2">% of Total (MRP)</th>
            </tr>
            <tr>
              <th>Cases</th>
              <th>Bottles</th>
            </tr>
          </thead>
          <tbody>
            ${body}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5"><strong>Total</strong></td>
              <td class="right total-red">${total}</td>
              <td class="right total-red">100.00%</td>
            </tr>
          </tfoot>
        </table>
      `;
    })();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Sales Report - ${shopName}</title>
  <style>
    @page { margin: 12mm; size: A4 portrait; }
    body { font-family: Arial, sans-serif; font-size: 11px; }
    .header { text-align: center; margin-bottom: 10px; }
    .shop { font-weight: 800; font-size: 22px; }
    .title { font-weight: 700; font-size: 14px; text-align: center; margin-bottom: 12px; }
    .report { font-weight: 800; font-size: 18px; text-transform: uppercase; }
    .meta { font-weight: 600; font-size: 12px; }
    .month { font-weight: 600; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #000; padding: 4px; text-align: center; }
    th { background: #f0f0f0; }
    .right { text-align: center; }
    .center { text-align: center; }
    .section { margin-top: 18px; }
    .page-break { page-break-before: always; }
    .bold { font-weight: bold; }
    .subhead-left { text-align: left; font-weight: bold; margin: 6px 0; }
    .total-red { color: #d00; font-weight: bold; }
    thead { display: table-header-group; }
    tfoot { display: table-row-group; }
    tfoot tr { page-break-inside: avoid; }
    .summary { width: 60%; margin: 6px auto 0 auto; }
    .summary-section { margin: 18px 0 30px; }
    .summary th, .summary td { font-weight: bold; font-size: 14px; }
    .summary-title { font-size: 16px; }
    .share-table { width: 80%; margin: 10px auto 0 auto; }
    .share-section { margin-top: 36px; }
    .share-section .title { margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="shop">${shopName}</div>
    <div class="report">SALES REPORT</div>
    ${monthStr ? `<div class=\"month\">${monthStr}</div>` : ''}
    <div class="meta">${rangeStr}</div>
  </div>

  <div class="section summary-section">
    <table class="summary">
      <thead>
        <tr>
          <th>Total Sale Value (MRP)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="center"><strong>${formatCurrency(totals.totalMrp)}</strong></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="title">${reportType === 'yearly' ? 'Sales Report - Month Wise' : 'Sales Report - Day Wise'}</div>
    <table class="share-table">
      <thead>
        <tr>
          <th>S.No</th>
          <th>${reportType === 'yearly' ? 'Month' : 'Date'}</th>
          <th>Sales (MRP)</th>
        </tr>
      </thead>
      <tbody>
        ${(periodTotals || []).map((p, idx) => `
          <tr>
            <td class="center">${idx + 1}</td>
            <td>${p.label}</td>
            <td class="right">${Math.round(p.mrpTotal || 0).toLocaleString('en-IN')}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2"><strong>Total</strong></td>
          <td class="right total-red">${Math.round((periodTotals || []).reduce((s, p) => s + (p.mrpTotal || 0), 0)).toLocaleString('en-IN')}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="page-break"></div>
  <div class="header">
    <div class="shop">${shopName}</div>
    <div class="report">SALES REPORT</div>
    ${monthStr ? `<div class=\"month\">${monthStr}</div>` : ''}
    <div class="meta">${rangeStr}</div>
  </div>

  <div class="section">
    <div class="title">Sales - Brand Type wise</div>
    <table class="share-table">
      <thead>
        <tr>
          <th>S.No</th>
          <th>Type</th>
          <th>Sales (MRP)</th>
          <th>% of Total</th>
        </tr>
      </thead>
      <tbody>
        ${kindTotals.map((k, idx) => `
          <tr>
            <td class="center">${idx + 1}</td>
            <td>${k.label}</td>
            <td class="right">${Math.round(k.valueMrp).toLocaleString('en-IN')}</td>
            <td class="right">${k.share.toFixed(2)}%</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2"><strong>Total</strong></td>
          <td class="right total-red">${Math.round(totals.totalMrp).toLocaleString('en-IN')}</td>
          <td class="right total-red">${kindSharePctTotal}%</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="page-break"></div>
  <div class="header">
    <div class="shop">${shopName}</div>
    <div class="report">SALES REPORT</div>
    ${monthStr ? `<div class=\"month\">${monthStr}</div>` : ''}
    <div class="meta">${rangeStr}</div>
  </div>

  <div class="section">
    <div class="title">Sales Report - Top 25</div>
    <table>
      <thead>
        <tr>
          <th rowspan="2">S.No</th>
          <th rowspan="2">Brand</th>
          <th rowspan="2">Size</th>
          <th colspan="2">Quantity</th>
          <th rowspan="2">Sales (MRP)</th>
          <th rowspan="2">% of Total (MRP)</th>
        </tr>
        <tr>
          <th>Cases</th>
          <th>Bottles</th>
        </tr>
      </thead>
      <tbody>
        ${top25RowsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5"><strong>Total</strong></td>
          <td class="right total-red">${Math.round(top25.reduce((s,r)=>s + ((r.soldBottles||0)*(r.mrp||0)),0)).toLocaleString('en-IN')}</td>
          <td class="right total-red">${(((top25.reduce((s,r)=>s + ((r.soldBottles||0)*(r.mrp||0)),0)) * 100) / totalMrp).toFixed(2)}%</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="page-break"></div>
  <div class="header">
    <div class="shop">${shopName}</div>
    <div class="report">SALES REPORT</div>
    ${monthStr ? `<div class=\"month\">${monthStr}</div>` : ''}
    <div class="meta">${rangeStr}</div>
  </div>

  <div class="section">
    <div class="title">Sales Report - All Brands</div>
    ${allKindsHtml}
  </div>

  <div class="page-break"></div>
  <div class="header">
    <div class="shop">${shopName}</div>
    <div class="report">SALES REPORT</div>
    ${monthStr ? `<div class=\"month\">${monthStr}</div>` : ''}
    <div class="meta">${rangeStr}</div>
  </div>

  <div class="section">
    <div class="title">Sales Report - Brand Wise</div>
    ${brandWiseHtml}
  </div>

  <div class="page-break"></div>
  <div class="header">
    <div class="shop">${shopName}</div>
    <div class="report">SALES REPORT</div>
    ${monthStr ? `<div class=\"month\">${monthStr}</div>` : ''}
    <div class="meta">${rangeStr}</div>
  </div>

  <div class="section">
    <div class="title">${reportType === 'yearly' ? 'Sales Report - Month Wise' : 'Sales Report - Day Wise'}</div>
    <table>
      <thead>
        <tr>
          <th>S.No</th>
          <th>${reportType === 'yearly' ? 'Month' : 'Date'}</th>
          <th>Sales (MRP)</th>
        </tr>
      </thead>
      <tbody>
        ${(periodTotals || []).map((p, idx) => `
          <tr>
            <td class="center">${idx + 1}</td>
            <td>${p.label}</td>
            <td class="right">${Math.round(p.mrpTotal || 0).toLocaleString('en-IN')}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2"><strong>Total</strong></td>
          <td class="right total-red">${Math.round((periodTotals || []).reduce((s, p) => s + (p.mrpTotal || 0), 0)).toLocaleString('en-IN')}</td>
        </tr>
      </tfoot>
    </table>
  </div>

</body>
</html>
`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 600);
  };

  if (loading) {
    return (
      <div className="stock-lifted-container">
        <div className="loading-display">
          <div className="loading-spinner"></div>
          <span>Loading sales report...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="stock-lifted-container">
      <header className="stock-lifted-header">
        <div className="logo-section">
          <h1 className="app-title">{shopName}</h1>
          <p className="app-subtitle">Inventory Management</p>
        </div>
        <nav className="navigation">
          <button className="nav-btn" onClick={() => onNavigate('dashboard')}>Dashboard</button>
          <button className="nav-btn" onClick={() => onNavigate('stockOnboarding')}>Stock Onboarding</button>
          <button className="nav-btn" onClick={() => onNavigate('manageStock')}>Manage Stock</button>
          <button className="nav-btn" onClick={() => onNavigate('sheets')}>Sheets</button>
          <button className="nav-btn active" onClick={() => onNavigate('reports')}>Reports</button>
          <button className="nav-btn logout-btn" onClick={onLogout}>Log Out</button>
        </nav>
      </header>

      <main className="stock-lifted-content">
        <div className="page-title-section">
          <h2 className="main-title">Sale Report</h2>
          <p className="subtitle">Per brand-size under brand, cases & bottles, MRP only</p>
        </div>

        {error && (
          <div className="error-display">
            <h3>⚠️ Error</h3>
            <p>{error}</p>
            <button className="retry-btn" onClick={fetchData}>Retry</button>
          </div>
        )}

        <div className="controls-section">
          <div className="report-type-selector">
            {['daily','weekly','monthly','yearly','custom'].map(type => (
              <label key={type} className={`type-option ${reportType === type ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="reportType"
                  value={type}
                  checked={reportType === type}
                  onChange={(e) => setReportType(e.target.value)}
                />
                <span>{type.charAt(0).toUpperCase() + type.slice(1)}</span>
              </label>
            ))}
          </div>

          <div className="date-selectors">
            {reportType === 'daily' && (
              <div className="selector-group">
                <label>Select Date:</label>
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="date-input" />
              </div>
            )}

            {reportType === 'weekly' && (
              <>
                <div className="selector-group">
                  <label>Select Year:</label>
                  <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="year-select">
                    {Array.from({ length: 10 }, (_, i) => currentYear - 5 + i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="selector-group">
                  <label>Select Month:</label>
                  <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="month-select">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>{new Date(2024, m - 1).toLocaleDateString('en-US', { month: 'long' })}</option>
                    ))}
                  </select>
                </div>
                <div className="selector-group">
                  <label>Select Week:</label>
                  <select value={selectedWeek} onChange={(e) => setSelectedWeek(parseInt(e.target.value))} className="week-select">
                    {weeksInMonth.map(w => (
                      <option key={w.weekNumber} value={w.weekNumber}>{w.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {reportType === 'monthly' && (
              <>
                <div className="selector-group">
                  <label>Select Year:</label>
                  <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="year-select">
                    {Array.from({ length: 10 }, (_, i) => currentYear - 5 + i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="selector-group">
                  <label>Select Month:</label>
                  <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="month-select">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>{new Date(2024, m - 1).toLocaleDateString('en-US', { month: 'long' })}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {reportType === 'yearly' && (
              <div className="selector-group">
                <label>Select Year:</label>
                <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="year-select">
                  {Array.from({ length: 10 }, (_, i) => currentYear - 5 + i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            )}

            {reportType === 'custom' && (
              <>
                <div className="selector-group">
                  <label>Start Date:</label>
                  <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="date-input" />
                </div>
                <div className="selector-group">
                  <label>End Date:</label>
                  <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="date-input" min={customStartDate} />
                </div>
              </>
            )}
          </div>

          <div className="report-title-section">
            <h3>{(() => {
              const { startDate, endDate } = getDateRange();
              const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
              return startDate === endDate ? fmt(startDate) : `${fmt(startDate)} to ${fmt(endDate)}`;
            })()}</h3>
          </div>
        </div>

        <div className="pdf-section">
          <button className="generate-pdf-btn" onClick={generatePDF}>Generate PDF</button>
        </div>
      </main>
    </div>
  );
}

export default SalesReport;


