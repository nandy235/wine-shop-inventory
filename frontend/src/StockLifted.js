import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './StockLifted.css';
import { apiGet } from './apiUtils';
import { getCurrentUser } from './authUtils';
import Navigation from './components/Navigation';

// Business date helper (11:30 AM IST boundary) - Safari compatible
const calculateBusinessDate = () => {
  const now = new Date();
  
  // Safari-compatible IST timezone handling
  // IST is UTC+5:30, so we add 5.5 hours to UTC time
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istTime = new Date(utcTime + (5.5 * 60 * 60 * 1000));
  
  const isBeforeStart = istTime.getHours() < 11 || (istTime.getHours() === 11 && istTime.getMinutes() < 30);
  
  if (isBeforeStart) {
    const yesterday = new Date(istTime);
    yesterday.setDate(yesterday.getDate() - 1);
    // Safari-compatible date formatting
    const year = yesterday.getFullYear();
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const day = String(yesterday.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Safari-compatible date formatting
  const year = istTime.getFullYear();
  const month = String(istTime.getMonth() + 1).padStart(2, '0');
  const day = String(istTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeeksInMonth = (year, month) => {
  const weeks = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  let currentWeekStart = new Date(firstDay);
  let weekNumber = 1;
  
  // Safari-compatible date formatting helper
  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  
  while (currentWeekStart <= lastDay) {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(currentWeekStart.getDate() + 6);
    if (weekEnd > lastDay) weekEnd.setTime(lastDay.getTime());
    weeks.push({
      weekNumber,
      startDate: formatDate(currentWeekStart),
      endDate: formatDate(weekEnd),
      label: `Week ${weekNumber} (${currentWeekStart.getDate()}-${weekEnd.getDate()})`
    });
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    weekNumber++;
  }
  return weeks;
};

const getMonthsInYear = (year) => {
  const months = [];
  
  // Safari-compatible date formatting helper
  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  
  // Month names for Safari compatibility
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  for (let i = 1; i <= 12; i++) {
    const mStart = new Date(year, i - 1, 1);
    const mEnd = new Date(year, i, 0);
    months.push({
      monthNumber: i,
      startDate: formatDate(mStart),
      endDate: formatDate(mEnd),
      label: monthNames[i - 1]
    });
  }
  return months;
};

function StockLifted({ onNavigate, onLogout }) {
  const businessDate = calculateBusinessDate();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  
  // Fallback date validation - ensure we always have a valid business date
  const validatedBusinessDate = (() => {
    if (businessDate && businessDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return businessDate;
    }
    // Fallback to today's date in YYYY-MM-DD format if business date calculation fails
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })();

  // Auth and shop
  const user = useMemo(() => getCurrentUser(), []);
  // Token no longer needed - apiUtils handles authentication automatically
  const shopName = user.shopName || 'Liquor Ledger';

  // Controls - with Safari-compatible date validation
  const [reportType, setReportType] = useState('daily');
  const [selectedDate, setSelectedDate] = useState(validatedBusinessDate);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [customStartDate, setCustomStartDate] = useState(validatedBusinessDate);
  const [customEndDate, setCustomEndDate] = useState(validatedBusinessDate);
  
  // Safari-compatible date validation helper
  const isValidDate = (dateString) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime()) && dateString.match(/^\d{4}-\d{2}-\d{2}$/);
  };

  // Data
  const [rows, setRows] = useState([]);
  const [brandMap, setBrandMap] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [periodTotals, setPeriodTotals] = useState([]); // [{ label, invTotal, mrpTotal }]

  const weeksInMonth = useMemo(() => {
    if (reportType === 'weekly') return getWeeksInMonth(selectedYear, selectedMonth);
    return [];
  }, [reportType, selectedYear, selectedMonth]);

  const monthsInYear = useMemo(() => {
    if (reportType === 'monthly') return getMonthsInYear(selectedYear);
    return [];
  }, [reportType, selectedYear]);

  // Load master brands for invoice price, MRP, packQuantity, kind
  useEffect(() => {
    const loadMasterBrands = async () => {
      try {
        const res = await apiGet('/api/master-brands');
        const list = await res.json();
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
              invoicePrice: b.invoice || 0,
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
      // Safari-compatible date formatting
      const year = c.getFullYear();
      const month = String(c.getMonth() + 1).padStart(2, '0');
      const day = String(c.getDate()).padStart(2, '0');
      out.push(`${year}-${month}-${day}`);
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
        if (!w) return { startDate: validatedBusinessDate, endDate: validatedBusinessDate };
        return { startDate: w.startDate, endDate: w.endDate };
      }
      case 'monthly': {
        const mStart = new Date(selectedYear, selectedMonth - 1, 1);
        const mEnd = new Date(selectedYear, selectedMonth, 0);
        // Safari-compatible date formatting
        const formatDate = (date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };
        return { startDate: formatDate(mStart), endDate: formatDate(mEnd) };
      }
      case 'yearly': {
        const yStart = new Date(selectedYear, 0, 1);
        const yEnd = new Date(selectedYear, 11, 31);
        // Safari-compatible date formatting
        const formatDate = (date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };
        return { startDate: formatDate(yStart), endDate: formatDate(yEnd) };
      }
      case 'custom':
        return { startDate: customStartDate, endDate: customEndDate };
      default:
        return { startDate: validatedBusinessDate, endDate: validatedBusinessDate };
    }
  }, [reportType, selectedDate, weeksInMonth, selectedWeek, validatedBusinessDate, selectedYear, selectedMonth, customStartDate, customEndDate]);

  // Brand base name (group header)
  const getBaseName = (productName) => {
    return (productName || '').replace(/\s+(90ml|180ml|375ml|750ml|1000ml|2000ml|60ml|500ml|650ml|330ml|275ml).*$/i, '').trim();
  };

  // Fetch and compute lifted across range by summing daily sales
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!brandMap || brandMap.size === 0) {
        // Wait for master brands to load to classify kinds correctly
        setLoading(false);
        return;
      }
      const { startDate, endDate } = getDateRange();
      const dates = toDatesArray(startDate, endDate);

      // Maintain initial order based on the first day's products
      const firstDay = dates[0];
      const firstDayRes = await apiGet(`/api/shop/products?date=${firstDay}`);
      if (!firstDayRes.ok) throw new Error('Failed to load stock');
      const firstDayJson = await firstDayRes.json();
      const orderKeys = (firstDayJson.products || []).map(p => `${p.brandNumber}|${p.sizeCode}`);
      const orderIndex = new Map();
      orderKeys.forEach((k, i) => orderIndex.set(k, i));

      // Fetch received stock across range and aggregate invoice quantities
      const allReceived = await Promise.all(dates.map(async d => {
        try {
          const r = await apiGet(`/api/received-stock?date=${d}`);
          return await r.json();
        } catch (error) {
          return { receivedStock: [] };
        }
      }));

      const agg = new Map(); // key by master_brand_id
      const dayTotals = new Map(); // dateStr -> { inv, mrp }
      for (const day of allReceived) {
        const recs = day.receivedStock || [];
        for (const rs of recs) {
          const qty = rs.invoice_quantity || 0;
          if (!qty) continue;
          const mbId = rs.master_brand_id;
          const mb = brandMap.get(mbId);
          const brandNumber = mb?.brandNumber || rs.brand_number;
          const sizeCode = mb?.sizeCode || rs.size_code;
          const key = `${brandNumber}|${sizeCode}`;
          if (!agg.has(mbId)) {
            const brandName = mb?.brandName || rs.brand_name || '';
            agg.set(mbId, {
              id: mbId,
              key,
              order: orderIndex.has(key) ? orderIndex.get(key) : 9999,
              brandNumber,
              brandName,
              baseName: getBaseName(brandName),
              sizeCode,
              size: mb?.size || rs.size_ml,
              packType: mb?.packType,
              packQuantity: mb?.packQuantity,
              brandKind: mb?.brandKind || 'Other',
              invoicePrice: mb?.invoicePrice || 0,
              mrp: mb?.mrp || rs.mrp_price || 0,
              liftedBottles: 0
            });
          }
          const row = agg.get(mbId);
          row.liftedBottles += qty;
        }
      }

      // Compute period totals (day-wise or month-wise) using allReceived and dates
      const invMrpByDate = new Map();
      for (let i = 0; i < dates.length; i++) {
        const d = dates[i];
        const day = allReceived[i] || {};
        const recs = day.receivedStock || [];
        let invSum = 0;
        let mrpSum = 0;
        for (const rs of recs) {
          const mb = brandMap.get(rs.master_brand_id);
          const priceInv = (mb?.invoicePrice || 0);
          const priceMrp = (mb?.mrp || rs.mrp_price || 0);
          const qty = rs.invoice_quantity || 0;
          invSum += qty * priceInv;
          mrpSum += qty * priceMrp;
        }
        invMrpByDate.set(d, { inv: invSum, mrp: mrpSum });
      }

      if (reportType === 'yearly') {
        const monthMap = new Map(); // 'YYYY-M' -> { label, inv, mrp }
        for (const d of dates) {
          const dt = new Date(d);
          const key = `${dt.getFullYear()}-${dt.getMonth()+1}`;
          if (!monthMap.has(key)) monthMap.set(key, { label: dt.toLocaleDateString('en-US', { month: 'long' }), inv: 0, mrp: 0 });
          const acc = monthMap.get(key);
          const dayv = invMrpByDate.get(d) || { inv: 0, mrp: 0 };
          acc.inv += dayv.inv || 0;
          acc.mrp += dayv.mrp || 0;
          monthMap.set(key, acc);
        }
        setPeriodTotals(Array.from(monthMap.values()));
      } else {
        const totals = dates.map(d => ({ label: new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }), invTotal: (invMrpByDate.get(d)||{}).inv || 0, mrpTotal: (invMrpByDate.get(d)||{}).mrp || 0 }));
        setPeriodTotals(totals);
      }

      const list = Array.from(agg.values());
      // Sort by initial view order, then size descending (numeric)
      list.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        const as = parseInt(a.size, 10) || 0;
        const bs = parseInt(b.size, 10) || 0;
        return bs - as;
      });

      setRows(list);
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
    const totalBottles = rows.reduce((s, r) => s + (r.liftedBottles || 0), 0);
    const totalMrp = rows.reduce((s, r) => s + (r.liftedBottles * (r.mrp || 0)), 0);
    const totalInvoice = rows.reduce((s, r) => s + (r.liftedBottles * (r.invoicePrice || 0)), 0);
    return { totalBottles, totalMrp, totalInvoice };
  }, [rows]);

  // Kind totals for share table
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
    const map = new Map(); // key -> { mrp, invoice }
    rows.forEach(r => {
      const key = canonical(r.brandKind);
      const mrpVal = (r.liftedBottles || 0) * (r.mrp || 0);
      const invVal = (r.liftedBottles || 0) * (r.invoicePrice || 0);
      const prev = map.get(key) || { mrp: 0, invoice: 0 };
      prev.mrp += mrpVal;
      prev.invoice += invVal;
      map.set(key, prev);
    });
    const totalMrp = Array.from(map.values()).reduce((s, v) => s + (v.mrp || 0), 0) || 1;
    return ORDER.map(label => {
      const key = canonical(label);
      const agg = map.get(key) || { mrp: 0, invoice: 0 };
      const share = ((agg.mrp || 0) * 100) / totalMrp;
      return { label, valueMrp: agg.mrp || 0, valueInvoice: agg.invoice || 0, share };
    });
  }, [rows]);

  const formatCurrency = (n) => Math.round(n).toLocaleString('en-IN');

  const grouped = useMemo(() => {
    const g = new Map();
    rows.forEach(r => {
      if (!g.has(r.baseName)) g.set(r.baseName, []);
      g.get(r.baseName).push(r);
    });
    return g;
  }, [rows]);

  const kindsTop = useMemo(() => {
    const ORDER = ['Whisky', 'Beer', 'Brandy', 'Wine', 'Vodka', 'Rum', 'Gin', 'Liqueur', 'Tequila', 'Spirit', 'Ready to drink'];
    const canonical = (rawKind) => {
      // Trust DB kind when provided; map to display labels
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
        case 'RTD':
          return 'ready to drink';
        default:
          return 'other';
      }
    };
    const kindMap = new Map();
    rows.forEach(r => {
      const key = canonical(r.brandKind);
      if (!kindMap.has(key)) kindMap.set(key, []);
      kindMap.get(key).push(r);
    });
    return ORDER.map(label => {
      const key = canonical(label);
      const arr = (kindMap.get(key) || []).slice().sort((a, b) => (b.liftedBottles * (b.mrp || 0)) - (a.liftedBottles * (a.mrp || 0)));
      return { label, top: arr.slice(0, 3), count: arr.length };
    });
  }, [rows]);

  const getReportTitle = () => {
    const { startDate, endDate } = getDateRange();
    const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    const monthPart = reportType === 'monthly' ? `${new Date(selectedYear, selectedMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} Report - ` : '';
    const rangePart = startDate === endDate ? `${fmt(startDate)}` : `${fmt(startDate)} to ${fmt(endDate)}`;
    return `${shopName} - Stock Lifted Report - ${monthPart}${rangePart}`;
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
    // Build header lines
    const monthStr = reportType === 'monthly'
      ? new Date(selectedYear, selectedMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : '';
    const rangeStr = startDate === endDate ? fmt(startDate) : `${fmt(startDate)} to ${fmt(endDate)}`;
    const headerHtml = `
      <div class="header">
        <div class="shop">${shopName}</div>
        <div class="title">Stock Lifted Report</div>
        ${monthStr ? `<div class=\"title\">${monthStr}</div>` : ''}
        <div class="title">${rangeStr}</div>
      </div>
    `;
    // Helpers for PDF rows
    const formatNum = (n) => Math.round(n).toLocaleString('en-IN');
    const calc = (r) => {
      const pq = parseInt(r.packQuantity, 10) || 0;
      const cases = pq > 0 ? Math.floor((r.liftedBottles || 0) / pq) : null;
      const loose = pq > 0 ? ((r.liftedBottles || 0) % pq) : (r.liftedBottles || 0);
      const inv = (r.liftedBottles || 0) * (r.invoicePrice || 0);
      const mrp = (r.liftedBottles || 0) * (r.mrp || 0);
      const pct = totalMrp > 0 ? (mrp * 100) / totalMrp : 0;
      return { cases, loose, inv, mrp, pct };
    };
    const rowHtml = (r, idx, bold = false, kindLabelCell = '') => {
      const { cases, loose, inv, mrp, pct } = calc(r);
      return `
        <tr${bold ? ' class="bold"' : ''}>
          ${idx !== null ? `<td class="center">${idx}</td>` : ''}
          ${kindLabelCell}
          <td>${r.baseName}</td>
          <td class="center">${r.sizeCode || ''}</td>
          <td>${cases != null ? cases.toFixed(2) : '-'}</td>
          <td>${loose}</td>
          <td>${formatNum(inv)}</td>
          <td>${formatNum(mrp)}</td>
          <td>${pct.toFixed(2)}%</td>
        </tr>
      `;
    };

    // Top 25 (by MRP value)
    const top25 = [...rows].sort((a,b)=>((b.liftedBottles||0)*(b.mrp||0)) - ((a.liftedBottles||0)*(a.mrp||0))).slice(0,25);
    const top25RowsHtml = top25.map((r,i)=> rowHtml(r, i+1)).join('');

    // Per-kind sub tables
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
      const list = (byKind.get(kind)||[]).slice().sort((a,b)=>((b.liftedBottles||0)*(b.mrp||0)) - ((a.liftedBottles||0)*(a.mrp||0)));
      if (list.length === 0) return '';
      const boldCount = list.length >= 5 ? 5 : 1;
      const rowsHtml = list.map((r, idx) => rowHtml(r, idx+1, idx < boldCount, '')).join('');
      const invTotalRaw = list.reduce((s,r)=> s + ((r.liftedBottles||0)*(r.invoicePrice||0)), 0);
      const mrpTotalRaw = list.reduce((s,r)=> s + ((r.liftedBottles||0)*(r.mrp||0)), 0);
      const invSum = Math.round(invTotalRaw).toLocaleString('en-IN');
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
              <th colspan="2">Stock lifted</th>
              <th rowspan="2">% of Total (MRP)</th>
            </tr>
            <tr>
              <th>Cases</th>
              <th>Bottles</th>
              <th>Invoice</th>
              <th>MRP</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5"><strong>Total</strong></td>
              <td class="right total-red">${invSum}</td>
              <td class="right total-red">${mrpSum}</td>
              <td class="right total-red">${pctSum}%</td>
            </tr>
          </tfoot>
        </table>
      `;
    }).join('');

    // Brand-wise (one table per base brand; thead repeats across page breaks)
    const byBase = new Map();
    rows.forEach(r => { if (!byBase.has(r.baseName)) byBase.set(r.baseName, []); byBase.get(r.baseName).push(r); });
    const brandWiseHtml = (() => {
      const groups = Array.from(byBase.entries()).map(([base, list]) => {
        const groupOrder = Math.min(...list.map(r => (typeof r.order === 'number' ? r.order : 9999)));
        return [base, list, groupOrder];
      }).sort((a,b)=>a[2]-b[2]);
      const tables = groups.map(([base, list]) => {
        const sorted = list.slice().sort((a,b)=>{
          const ao = (typeof a.order === 'number' ? a.order : 9999);
          const bo = (typeof b.order === 'number' ? b.order : 9999);
          return ao - bo;
        });
        const rowsHtmlBrand = sorted.map((r, idx) => {
          const { cases, loose, inv, mrp, pct } = calc(r);
          return `
            <tr>
              <td class=\"center\">${idx + 1}</td>
              <td class=\"center\">${r.sizeCode || ''}</td>
              <td>${cases != null ? cases.toFixed(2) : '-'}</td>
              <td>${loose}</td>
              <td>${formatNum(inv)}</td>
              <td>${formatNum(mrp)}</td>
              <td>${pct.toFixed(2)}%</td>
            </tr>
          `;
        }).join('');
        const invSumBrand = Math.round(sorted.reduce((s,r)=> s + ((r.liftedBottles||0)*(r.invoicePrice||0)), 0)).toLocaleString('en-IN');
        const mrpSumBrand = Math.round(sorted.reduce((s,r)=> s + ((r.liftedBottles||0)*(r.mrp||0)), 0)).toLocaleString('en-IN');
        const pctSumBrand = totalMrp > 0 ? ((sorted.reduce((s,r)=> s + ((r.liftedBottles||0)*(r.mrp||0)), 0) * 100) / totalMrp).toFixed(2) : '0.00';
        return `
          <table>
            <thead>
              <tr><th colspan=\"7\">${base}</th></tr>
              <tr>
                <th>S.No</th>
                <th>Size</th>
                <th colspan=\"2\">Quantity</th>
                <th colspan=\"2\">Stock lifted</th>
                <th>% of Total (MRP)</th>
              </tr>
              <tr>
                <th></th>
                <th></th>
                <th>Cases</th>
                <th>Bottles</th>
                <th>Invoice</th>
                <th>MRP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtmlBrand}
            </tbody>
            <tfoot>
              <tr>
                <td colspan=\"4\"><strong>Total</strong></td>
                <td class=\"right total-red\">${invSumBrand}</td>
                <td class=\"right total-red\">${mrpSumBrand}</td>
                <td class=\"right total-red\">${pctSumBrand}%</td>
              </tr>
            </tfoot>
          </table>
        `;
      }).join('');
      return tables;
    })();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Stock Lifted Report - ${shopName}</title>
  <style>
    @page { margin: 12mm; size: A4 portrait; }
    body { font-family: Arial, sans-serif; font-size: 11px; }
    .header { text-align: center; margin-bottom: 10px; }
    .shop { font-weight: 800; font-size: 22px; }
    .title { font-weight: 700; font-size: 14px; text-align: center; }
    .report { font-weight: 800; font-size: 18px; text-transform: uppercase; }
    .meta { font-weight: 600; font-size: 12px; }
    .month { font-weight: 600; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #000; padding: 4px; text-align: center; }
    th { background: #f0f0f0; }
    .right { text-align: center; }
    .center { text-align: center; }
    .group-row td { border-top: 2px solid #000; font-weight: bold; background: #fafafa; }
    .section { margin-top: 14px; }
    .page-break { page-break-before: always; }
    .bold { font-weight: bold; }
    .subhead-left { text-align: left; font-weight: bold; margin: 6px 0; }
    .total-red { color: #d00; font-weight: bold; }
    /* Ensure thead repeats, but totals footer is only printed once at the end */
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
    <div class="report">STOCK LIFTED REPORT</div>
    ${monthStr ? `<div class=\"month\">${monthStr}</div>` : ''}
    <div class="meta">${rangeStr}</div>
  </div>

  <div class="section summary-section">
    <table class="summary">
      <thead>
        <tr>
          <th colspan="2">Stock lifted</th>
        </tr>
        <tr>
          <th>Invoice</th>
          <th>MRP</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="center"><strong>${formatCurrency(totals.totalInvoice)}</strong></td>
          <td class="center"><strong>${formatCurrency(totals.totalMrp)}</strong></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="title">${reportType === 'yearly' ? 'Stock Lifted - Month Wise' : 'Stock Lifted - Day Wise'}</div>
    <table class="share-table">
      <thead>
        <tr>
          <th>S.No</th>
          <th>${reportType === 'yearly' ? 'Month' : 'Date'}</th>
          <th>Invoice</th>
          <th>MRP</th>
        </tr>
      </thead>
      <tbody>
        ${(periodTotals || []).map((p, idx) => `
          <tr>
            <td class="center">${idx + 1}</td>
            <td>${p.label}</td>
            <td class="right">${Math.round(p.invTotal || p.inv || 0).toLocaleString('en-IN')}</td>
            <td class="right">${Math.round(p.mrpTotal || p.mrp || 0).toLocaleString('en-IN')}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2"><strong>Total</strong></td>
          <td class="right total-red">${Math.round((periodTotals || []).reduce((s, p) => s + (p.invTotal || p.inv || 0), 0)).toLocaleString('en-IN')}</td>
          <td class="right total-red">${Math.round((periodTotals || []).reduce((s, p) => s + (p.mrpTotal || p.mrp || 0), 0)).toLocaleString('en-IN')}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="page-break"></div>
  <div class="header">
    <div class="shop">${shopName}</div>
    <div class="report">STOCK LIFTED REPORT</div>
    ${monthStr ? `<div class=\"month\">${monthStr}</div>` : ''}
    <div class="meta">${rangeStr}</div>
  </div>

  <div class="section share-section">
    <div class="title">Stock Lifted - Brand Type wise</div>
    <table class="share-table">
      <thead>
        <tr>
          <th rowspan="2">S.No</th>
          <th rowspan="2">Type</th>
          <th colspan="2">Stock lifted</th>
          <th rowspan="2">% of Total</th>
        </tr>
        <tr>
          <th>Invoice</th>
          <th>MRP</th>
        </tr>
      </thead>
      <tbody>
        ${kindTotals.map((k, idx) => `
          <tr>
            <td class="center">${idx + 1}</td>
            <td>${k.label}</td>
            <td class="right">${Math.round(k.valueInvoice).toLocaleString('en-IN')}</td>
            <td class="right">${Math.round(k.valueMrp).toLocaleString('en-IN')}</td>
            <td class="right">${k.share.toFixed(2)}%</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2"><strong>Total</strong></td>
          <td class="right total-red">${Math.round(totals.totalInvoice).toLocaleString('en-IN')}</td>
          <td class="right total-red">${Math.round(totals.totalMrp).toLocaleString('en-IN')}</td>
          <td class="right total-red">${kindSharePctTotal}%</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="page-break"></div>
  <div class="header">
    <div class="shop">${shopName}</div>
    <div class="report">STOCK LIFTED REPORT</div>
    ${monthStr ? `<div class=\"month\">${monthStr}</div>` : ''}
    <div class="meta">${rangeStr}</div>
  </div>

  <div class="section">
    <div class="title">Stock Lifted - Top 25</div>
    <table>
      <thead>
        <tr>
          <th rowspan="2">S.No</th>
          <th rowspan="2">Brand</th>
          <th rowspan="2">Size</th>
          <th colspan="2">Quantity</th>
          <th colspan="2">Stock lifted</th>
          <th rowspan="2">% of Total (MRP)</th>
        </tr>
        <tr>
          <th>Cases</th>
          <th>Bottles</th>
          <th>Invoice</th>
          <th>MRP</th>
        </tr>
      </thead>
      <tbody>
        ${top25RowsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5"><strong>Total</strong></td>
          <td class="right total-red">${Math.round(top25.reduce((s,r)=>s + ((r.liftedBottles||0)*(r.invoicePrice||0)),0)).toLocaleString('en-IN')}</td>
          <td class="right total-red">${Math.round(top25.reduce((s,r)=>s + ((r.liftedBottles||0)*(r.mrp||0)),0)).toLocaleString('en-IN')}</td>
          <td class="right total-red">${(((top25.reduce((s,r)=>s + ((r.liftedBottles||0)*(r.mrp||0)),0)) * 100) / totalMrp).toFixed(2)}%</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="page-break"></div>
  <div class="header">
    <div class="shop">${shopName}</div>
    <div class="report">STOCK LIFTED REPORT</div>
    ${monthStr ? `<div class=\"month\">${monthStr}</div>` : ''}
    <div class="meta">${rangeStr}</div>
  </div>

  <div class="section">
    <div class="title">Stock lifted - All Brands</div>
    ${allKindsHtml}
  </div>

  <div class="page-break"></div>
  <div class="header">
    <div class="shop">${shopName}</div>
    <div class="report">STOCK LIFTED REPORT</div>
    ${monthStr ? `<div class=\"month\">${monthStr}</div>` : ''}
    <div class="meta">${rangeStr}</div>
  </div>

  <div class="section">
    <div class="title">Stock Lifted - Brand Wise</div>
    ${brandWiseHtml}
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
          <span>Loading stock lifted data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="stock-lifted-container">
      <Navigation 
        currentPage="stockLifted"
        onNavigate={onNavigate}
        onLogout={onLogout}
        shopName={shopName}
      />

      <main className="stock-lifted-content">
        <div className="page-title-section">
          <h2 className="main-title">Stock Lifted Report</h2>
          <p className="subtitle">Per brand-size under brand, cases & bottles, Invoice vs MRP</p>
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
                <input 
                  type="date" 
                  value={selectedDate} 
                  onChange={(e) => {
                    const newDate = e.target.value;
                    if (isValidDate(newDate)) {
                      setSelectedDate(newDate);
                    }
                  }} 
                  className="date-input" 
                />
                {!isValidDate(selectedDate) && (
                  <div className="date-error">Invalid date format</div>
                )}
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
                  <input 
                    type="date" 
                    value={customStartDate} 
                    onChange={(e) => {
                      const newDate = e.target.value;
                      if (isValidDate(newDate)) {
                        setCustomStartDate(newDate);
                      }
                    }} 
                    className="date-input" 
                  />
                  {!isValidDate(customStartDate) && (
                    <div className="date-error">Invalid start date</div>
                  )}
                </div>
                <div className="selector-group">
                  <label>End Date:</label>
                  <input 
                    type="date" 
                    value={customEndDate} 
                    onChange={(e) => {
                      const newDate = e.target.value;
                      if (isValidDate(newDate)) {
                        setCustomEndDate(newDate);
                      }
                    }} 
                    className="date-input" 
                    min={customStartDate} 
                  />
                  {!isValidDate(customEndDate) && (
                    <div className="date-error">Invalid end date</div>
                  )}
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

        {/* Hidden data preview removed as per request */}
        {/* <div className="data-tables">
          <div className="table-section">
            <h3>All Brands</h3>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Brand</th>
                    <th>Size</th>
                    <th>Lifted (Cases)</th>
                    <th>Lifted (Bottles)</th>
                    <th>Value (Invoice)</th>
                    <th>Value (MRP)</th>
                    <th>% of Total (MRP)</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(grouped.entries()).map(([base, items], idx) => (
                    items.map((r, i) => {
                      const cases = r.packQuantity ? (r.liftedBottles / r.packQuantity) : null;
                      const inv = r.liftedBottles * (r.invoicePrice || 0);
                      const mrp = r.liftedBottles * (r.mrp || 0);
                      const pct = totals.totalMrp > 0 ? (mrp * 100) / totals.totalMrp : 0;
                      return (
                        <tr key={`${r.key}-${i}`}>
                          {i === 0 && (
                            <>
                              <td className="center" rowSpan={items.length}>{idx + 1}</td>
                              <td rowSpan={items.length}>{base}</td>
                            </>
                          )}
                          <td className="center">{r.sizeCode || ''}</td>
                          <td className="amount">{cases != null ? cases.toFixed(2) : '-'}</td>
                          <td className="amount">{r.liftedBottles}</td>
                          <td className="amount">₹{formatCurrency(inv)}</td>
                          <td className="amount">₹{formatCurrency(mrp)}</td>
                          <td className="amount">{pct.toFixed(2)}%</td>
                        </tr>
                      );
                    })
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan="8" className="no-data">No records</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="total-row">
                    <td colSpan="4"><strong>TOTAL</strong></td>
                    <td className="amount"><strong>{totals.totalBottles}</strong></td>
                    <td className="amount"><strong>₹{formatCurrency(totals.totalInvoice)}</strong></td>
                    <td className="amount"><strong>₹{formatCurrency(totals.totalMrp)}</strong></td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="table-section">
            <h3>Top 3 by Kind</h3>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Kind</th>
                    <th>Brand</th>
                    <th>Size</th>
                    <th>Lifted (Bottles)</th>
                    <th>Value (Invoice)</th>
                    <th>Value (MRP)</th>
                    <th>% of Total (MRP)</th>
                  </tr>
                </thead>
                <tbody>
                  {kinds.map(k => (
                    k.top.map((r, i) => {
                      const inv = r.liftedBottles * (r.price || 0);
                      const mrp = r.liftedBottles * (r.mrp || 0);
                      const pct = totals.totalMrp > 0 ? (mrp * 100) / totals.totalMrp : 0;
                      return (
                        <tr key={`${k.kind}-${r.key}`}>
                          {i === 0 && <td rowSpan={k.top.length}>{k.kind}</td>}
                          <td>{r.baseName}</td>
                          <td className="center">{r.sizeCode || ''}</td>
                          <td className="amount">{r.liftedBottles}</td>
                          <td className="amount">₹{formatCurrency(inv)}</td>
                          <td className="amount">₹{formatCurrency(mrp)}</td>
                          <td className="amount">{pct.toFixed(2)}%</td>
                        </tr>
                      );
                    })
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan="7" className="no-data">No records</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div> */}
      </main>
    </div>
  );
}

export default StockLifted;


