import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './IncomeExpensesReport.css';
import { apiGet } from './apiUtils';
import { getCurrentUser } from './authUtils';

// Helper function to calculate business date
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
  const isBeforeBusinessStart = 
    istTime.getHours() < 11 || 
    (istTime.getHours() === 11 && istTime.getMinutes() < 30);
  
  let businessDate;
  if (isBeforeBusinessStart) {
    const yesterday = new Date(istTime);
    yesterday.setDate(yesterday.getDate() - 1);
    businessDate = yesterday.toLocaleDateString('en-CA');
  } else {
    businessDate = istTime.toLocaleDateString('en-CA');
  }
  
  return businessDate;
};

// Helper functions for date calculations
const getWeeksInMonth = (year, month) => {
  const weeks = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  
  let currentWeekStart = new Date(firstDay);
  let weekNumber = 1;
  
  while (currentWeekStart <= lastDay) {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(currentWeekStart.getDate() + 6);
    
    if (weekEnd > lastDay) {
      weekEnd.setTime(lastDay.getTime());
    }
    
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
    const monthStart = new Date(year, i - 1, 1);
    const monthEnd = new Date(year, i, 0);
    
    months.push({
      monthNumber: i,
      startDate: monthStart.toLocaleDateString('en-CA'),
      endDate: monthEnd.toLocaleDateString('en-CA'),
      label: monthStart.toLocaleDateString('en-US', { month: 'long' })
    });
  }
  return months;
};

function IncomeExpensesReport({ onNavigate, onLogout }) {
  const businessDate = calculateBusinessDate();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  
  // State management
  const [reportType, setReportType] = useState('daily');
  const [selectedDate, setSelectedDate] = useState(businessDate);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [customStartDate, setCustomStartDate] = useState(businessDate);
  const [customEndDate, setCustomEndDate] = useState(businessDate);
  const [incomeData, setIncomeData] = useState([]);
  const [expensesData, setExpensesData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);

  // User data
  const userData = useMemo(() => getCurrentUser(), []);
  // Token no longer needed - apiUtils handles authentication automatically
  const shopName = useMemo(() => userData.shopName || 'Liquor Ledger', [userData.shopName]);

  // Category ordering (to preserve original entry order from category master)
  const [incomeCategoryOrderMap, setIncomeCategoryOrderMap] = useState({});
  const normalizeCategoryName = (val) => (val || '').toString().trim().toLowerCase();

  // Load income categories (defines canonical order used in entry screen)
  useEffect(() => {
    const loadIncomeCategories = async () => {
      try {
        const res = await apiGet('/api/income-expenses/income-categories');
        const categories = await res.json();
          // Build order map: lower index means earlier in list
          const map = {};
          (categories || []).forEach((c, idx) => {
            const raw = (c?.name || c)?.toString();
            const key = normalizeCategoryName(raw);
            if (key) map[key] = idx;
          });
          setIncomeCategoryOrderMap(map);
      } catch (_) {}
    };
    loadIncomeCategories();
  }, []);

  // Get weeks for selected month
  const weeksInMonth = useMemo(() => {
    if (reportType === 'weekly') {
      return getWeeksInMonth(selectedYear, selectedMonth);
    }
    return [];
  }, [reportType, selectedYear, selectedMonth]);

  // Get months for selected year
  const monthsInYear = useMemo(() => {
    if (reportType === 'monthly') {
      return getMonthsInYear(selectedYear);
    }
    return [];
  }, [reportType, selectedYear]);

  // Get date range for data fetching
  const getDateRange = useCallback(() => {
    switch (reportType) {
      case 'daily':
        return { startDate: selectedDate, endDate: selectedDate };
      
      case 'weekly':
        const selectedWeekData = weeksInMonth.find(w => w.weekNumber === selectedWeek);
        if (selectedWeekData) {
          return { startDate: selectedWeekData.startDate, endDate: selectedWeekData.endDate };
        }
        return { startDate: businessDate, endDate: businessDate };
      
      case 'monthly':
        // Monthly view: selected month within the selected year
        const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
        const monthEnd = new Date(selectedYear, selectedMonth, 0);
        return {
          startDate: monthStart.toLocaleDateString('en-CA'),
          endDate: monthEnd.toLocaleDateString('en-CA')
        };
      
      case 'yearly':
        const yearStart = new Date(selectedYear, 0, 1);
        const yearEnd = new Date(selectedYear, 11, 31);
        return { 
          startDate: yearStart.toLocaleDateString('en-CA'), 
          endDate: yearEnd.toLocaleDateString('en-CA') 
        };
      
      case 'custom':
        return { startDate: customStartDate, endDate: customEndDate };
      
      default:
        return { startDate: businessDate, endDate: businessDate };
    }
  }, [reportType, selectedDate, selectedYear, selectedMonth, selectedWeek, weeksInMonth, businessDate, customStartDate, customEndDate]);

  // Fetch data for the selected date range
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { startDate, endDate } = getDateRange();
      
      // Generate array of dates in range
      const dates = [];
      const current = new Date(startDate);
      const end = new Date(endDate);
      
      while (current <= end) {
        dates.push(current.toLocaleDateString('en-CA'));
        current.setDate(current.getDate() + 1);
      }
      
      // Fetch data for all dates in parallel
      const incomePromises = dates.map(async date => {
        try {
          const res = await apiGet(`/api/income-expenses/income?date=${date}`);
          return await res.json();
        } catch (error) {
          return [];
        }
      });
      
      const expensesPromises = dates.map(async date => {
        try {
          const res = await apiGet(`/api/income-expenses/expenses?date=${date}`);
          return await res.json();
        } catch (error) {
          return [];
        }
      });
      
      const [incomeResults, expensesResults] = await Promise.all([
        Promise.all(incomePromises),
        Promise.all(expensesPromises)
      ]);
      
      // Flatten and combine results with dates
      const allIncome = incomeResults.flatMap((dayIncome, index) => 
        (dayIncome || []).map(item => ({ ...item, date: dates[index] }))
      );
      
      const allExpenses = expensesResults.flatMap((dayExpenses, index) => 
        (dayExpenses || []).map(item => ({ ...item, date: dates[index] }))
      );
      
      setIncomeData(allIncome);
      setExpensesData(allExpenses);
      
    } catch (err) {
      setError(err.message);
      console.error('Error fetching income/expenses data:', err);
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  // Fetch data when parameters change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalIncome = incomeData.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const totalExpenses = expensesData.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    return { totalIncome, totalExpenses };
  }, [incomeData, expensesData]);

  // Aggregations by category/source for weekly, monthly, yearly, custom
  const aggregatedIncomeByCategory = useMemo(() => {
    if (!(reportType === 'weekly' || reportType === 'monthly' || reportType === 'yearly' || reportType === 'custom')) return [];
    const map = new Map();
    (incomeData || []).forEach(item => {
      const key = normalizeCategoryName(item.source || item.category || 'N/A');
      const amt = parseFloat(item.amount) || 0;
      map.set(key, (map.get(key) || 0) + amt);
    });
    const list = Array.from(map.entries()).map(([key, amount]) => ({ category: key, amount }));
    // If we have a canonical order from categories, sort by it; otherwise keep insertion order
    const preferred = ['sitting', 'cash discounts', 'used bottles/cartons sale', 'others'];
    list.sort((a, b) => {
      const aiPref = preferred.indexOf(a.category);
      const biPref = preferred.indexOf(b.category);
      if (aiPref !== -1 || biPref !== -1) {
        return (aiPref === -1 ? Number.MAX_SAFE_INTEGER : aiPref) - (biPref === -1 ? Number.MAX_SAFE_INTEGER : biPref);
      }
      if (incomeCategoryOrderMap && Object.keys(incomeCategoryOrderMap).length > 0) {
        const ai = incomeCategoryOrderMap[a.category] ?? Number.MAX_SAFE_INTEGER;
        const bi = incomeCategoryOrderMap[b.category] ?? Number.MAX_SAFE_INTEGER;
        return ai - bi;
      }
      return 0;
    });
    // Pretty label: title case for display if needed
    return list.map(it => ({
      category: it.category.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      amount: it.amount
    }));
  }, [reportType, incomeData, incomeCategoryOrderMap]);

  // Daily income ordering by canonical order (no aggregation)
  const orderedDailyIncome = useMemo(() => {
    if (reportType !== 'daily') return incomeData;
    const preferred = ['sitting', 'cash discounts', 'used bottles/cartons sale', 'others'];
    const getIndex = (name) => {
      const key = normalizeCategoryName(name || '');
      const pref = preferred.indexOf(key);
      if (pref !== -1) return pref;
      const ord = incomeCategoryOrderMap[key];
      return ord !== undefined ? ord : Number.MAX_SAFE_INTEGER;
    };
    return [...incomeData].sort((a, b) => getIndex(a.source) - getIndex(b.source));
  }, [reportType, incomeData, incomeCategoryOrderMap]);

  const aggregatedExpensesByCategory = useMemo(() => {
    if (!(reportType === 'weekly' || reportType === 'monthly' || reportType === 'yearly')) return [];
    const map = new Map();
    (expensesData || []).forEach(item => {
      const key = (item.category || 'N/A').toString();
      const amt = parseFloat(item.amount) || 0;
      map.set(key, (map.get(key) || 0) + amt);
    });
    const list = Array.from(map.entries()).map(([category, amount]) => ({ category, amount }));
    // Keep insertion order (no canonical expense category list provided)
    return list;
  }, [reportType, expensesData]);

  // Format currency
  const formatCurrency = (amount) => {
    return Math.round(amount).toLocaleString('en-IN');
  };

  // Format date for display
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: '2-digit' 
    });
  };

  // Format date as dd-mm-yyyy
  const formatDMY = (dateStr) => {
    const date = new Date(dateStr);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  // Get report title and optional subtitle (date range moved to next line when needed)
  const getReportTitleParts = () => {
    switch (reportType) {
      case 'daily':
        return { title: `Daily Report - ${formatDate(selectedDate)}`, subtitle: '' };
      case 'weekly': {
        const weekData = weeksInMonth.find(w => w.weekNumber === selectedWeek);
        const monthYear = new Date(selectedYear, selectedMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const title = `Weekly Report - Week ${selectedWeek} - ${monthYear}`;
        const subtitle = weekData ? `(${formatDMY(weekData.startDate)} to ${formatDMY(weekData.endDate)})` : '';
        return { title, subtitle };
      }
      case 'monthly':
        return { title: `Monthly Report - ${new Date(selectedYear, selectedMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`, subtitle: '' };
      case 'yearly':
        return { title: `Yearly Report - ${selectedYear}`, subtitle: '' };
      case 'custom': {
        const title = 'Custom Report';
        const subtitle = `(${formatDMY(customStartDate)} to ${formatDMY(customEndDate)})`;
        return { title, subtitle };
      }
      default:
        return { title: 'Income & Expenses Report', subtitle: '' };
    }
  };

  // Generate PDF
  const generatePDF = () => {
    setGenerating(true);
    
    const pdfContent = createPDFContent();
    const printWindow = window.open('', '_blank');
    printWindow.document.write(pdfContent);
    printWindow.document.close();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
      setGenerating(false);
    }, 1000);
  };

  // Create PDF content
  const createPDFContent = () => {
    const { title: reportTitle, subtitle: reportSubtitle } = getReportTitleParts();
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${reportTitle} - ${shopName}</title>
      <style>
        @page { margin: 15mm; size: A4 portrait; }
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 0; }
        .report-header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
        .shop-name { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
        .report-title { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
        .report-date { font-size: 12px; color: #666; display: none; }
        .report-subtitle { font-size: 12px; margin-top: 4px; }
        .footer { position: fixed; bottom: 10mm; left: 15mm; right: 15mm; text-align: right; font-size: 12px; }
        .data-section { margin: 20px 0; }
        .section-title { font-size: 14px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #000; }
        .data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .data-table th, .data-table td { border: 1px solid #000; padding: 6px; text-align: left; }
        .data-table th { background-color: #f0f0f0; font-weight: bold; }
        .amount { text-align: right; }
        .total-row { font-weight: bold; background-color: #f9f9f9; }
        .positive { color: #008000; }
        .negative { color: #ff0000; }
        .page-break { page-break-before: always; }
      </style>
    </head>
    <body>
      <div class="report-header">
        <div class="shop-name">${shopName}</div>
        <div class="report-title">${reportTitle}</div>
        ${reportSubtitle ? `<div class=\"report-subtitle\">${reportSubtitle}</div>` : ''}
        <div class="report-date">Generated on: ${new Date().toLocaleDateString('en-GB')}</div>
      </div>

      <div class="data-section">
        <div class="section-title">OTHER INCOME DETAILS</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>S.No</th>
              <th>Category</th>
              <th>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${((reportType === 'weekly' || reportType === 'monthly' || reportType === 'yearly')
                ? aggregatedIncomeByCategory
                : incomeData.map(i => ({ category: (i.source || i.category || 'N/A'), amount: i.amount || 0 }))
              ).map((row, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${row.category}</td>
                <td class="amount">${formatCurrency(row.amount || 0)}</td>
              </tr>
            `).join('')}
            ${((reportType === 'weekly' || reportType === 'monthly' || reportType === 'yearly') ? aggregatedIncomeByCategory.length === 0 : incomeData.length === 0) ? '<tr><td colspan="3" style="text-align: center;">No income records found</td></tr>' : ''}
            <tr class="total-row">
              <td colspan="2"><strong>TOTAL OTHER INCOME</strong></td>
              <td class="amount"><strong>${formatCurrency(totals.totalIncome)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="page-break"></div>

      <div class="report-header">
        <div class="shop-name">${shopName}</div>
        <div class="report-title">${reportTitle}</div>
        ${reportSubtitle ? `<div class=\"report-subtitle\">${reportSubtitle}</div>` : ''}
        <div class="report-date">Generated on: ${new Date().toLocaleDateString('en-GB')}</div>
      </div>

      <div class="data-section">
        <div class="section-title">EXPENSES DETAILS</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>S.No</th>
              <th>Category</th>
              <th>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${((reportType === 'weekly' || reportType === 'monthly' || reportType === 'yearly')
                ? aggregatedExpensesByCategory
                : expensesData.map(i => ({ category: (i.category || 'N/A'), amount: i.amount || 0 }))
              ).map((row, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${row.category}</td>
                <td class="amount">${formatCurrency(row.amount || 0)}</td>
              </tr>
            `).join('')}
            ${((reportType === 'weekly' || reportType === 'monthly' || reportType === 'yearly') ? aggregatedExpensesByCategory.length === 0 : expensesData.length === 0) ? '<tr><td colspan="3" style="text-align: center;">No expense records found</td></tr>' : ''}
            <tr class="total-row">
              <td colspan="2"><strong>TOTAL EXPENSES</strong></td>
              <td class="amount"><strong>${formatCurrency(totals.totalExpenses)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="footer">Generated on: ${new Date().toLocaleDateString('en-GB')}</div>
    </body>
    </html>
    `;
  };

  if (loading) {
    return (
      <div className="income-expenses-container">
        <div className="loading-display">
          <div className="loading-spinner"></div>
          <span>Loading income & expenses data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="income-expenses-container">
      <header className="income-expenses-header">
        <div className="logo-section">
          <h1 className="app-title">{shopName}</h1>
          <p className="app-subtitle">Inventory Management</p>
        </div>
        <nav className="navigation">
          <button className="nav-btn" onClick={() => onNavigate('home')}>Home</button>
          <button className="nav-btn" onClick={() => onNavigate('stockOnboarding')}>Stock Onboarding</button>
          <button className="nav-btn" onClick={() => onNavigate('manageStock')}>Manage Stock</button>
          <button className="nav-btn" onClick={() => onNavigate('sheets')}>Sheets</button>
          <button className="nav-btn active" onClick={() => onNavigate('reports')}>Reports</button>
          <button className="nav-btn logout-btn" onClick={onLogout}>Log Out</button>
        </nav>
      </header>

      <main className="income-expenses-content">
        <div className="page-title-section">
          <h2 className="main-title">Income & Expenses Report</h2>
          <p className="subtitle">View and analyze income and expense records with PDF generation</p>
        </div>

        {error && (
          <div className="error-display">
            <h3>⚠️ Error Loading Data</h3>
            <p>{error}</p>
            <button onClick={fetchData} className="retry-btn">Retry</button>
          </div>
        )}

        <div className="controls-section">
          <div className="report-type-selector">
            <label className={`type-option ${reportType === 'daily' ? 'active' : ''}`}>
              <input
                type="radio"
                name="reportType"
                value="daily"
                checked={reportType === 'daily'}
                onChange={(e) => setReportType(e.target.value)}
              />
              <span>Daily</span>
            </label>
            <label className={`type-option ${reportType === 'weekly' ? 'active' : ''}`}>
              <input
                type="radio"
                name="reportType"
                value="weekly"
                checked={reportType === 'weekly'}
                onChange={(e) => setReportType(e.target.value)}
              />
              <span>Weekly</span>
            </label>
            <label className={`type-option ${reportType === 'monthly' ? 'active' : ''}`}>
              <input
                type="radio"
                name="reportType"
                value="monthly"
                checked={reportType === 'monthly'}
                onChange={(e) => setReportType(e.target.value)}
              />
              <span>Monthly</span>
            </label>
            <label className={`type-option ${reportType === 'yearly' ? 'active' : ''}`}>
              <input
                type="radio"
                name="reportType"
                value="yearly"
                checked={reportType === 'yearly'}
                onChange={(e) => setReportType(e.target.value)}
              />
              <span>Yearly</span>
            </label>
            <label className={`type-option ${reportType === 'custom' ? 'active' : ''}`}>
              <input
                type="radio"
                name="reportType"
                value="custom"
                checked={reportType === 'custom'}
                onChange={(e) => setReportType(e.target.value)}
              />
              <span>Custom</span>
            </label>
          </div>

          <div className="date-selectors">
            {reportType === 'daily' && (
              <div className="selector-group">
                <label>Select Date:</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="date-input"
                />
              </div>
            )}

            {reportType === 'weekly' && (
              <>
                <div className="selector-group">
                  <label>Select Year:</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="year-select"
                  >
                    {Array.from({ length: 10 }, (_, i) => currentYear - 5 + i).map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
                <div className="selector-group">
                  <label>Select Month:</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                    className="month-select"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                      <option key={month} value={month}>
                        {new Date(2024, month - 1).toLocaleDateString('en-US', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="selector-group">
                  <label>Select Week:</label>
                  <select
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
                    className="week-select"
                  >
                    {weeksInMonth.map(week => (
                      <option key={week.weekNumber} value={week.weekNumber}>
                        {week.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {reportType === 'monthly' && (
              <>
                <div className="selector-group">
                  <label>Select Year:</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="year-select"
                  >
                    {Array.from({ length: 10 }, (_, i) => currentYear - 5 + i).map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
                <div className="selector-group">
                  <label>Select Month:</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                    className="month-select"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                      <option key={month} value={month}>
                        {new Date(2024, month - 1).toLocaleDateString('en-US', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {reportType === 'yearly' && (
              <div className="selector-group">
                <label>Select Year:</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="year-select"
                >
                  {Array.from({ length: 10 }, (_, i) => currentYear - 5 + i).map(year => (
                    <option key={year} value={year}>{year}</option>
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
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="date-input"
                  />
                </div>
                <div className="selector-group">
                  <label>End Date:</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    min={customStartDate}
                    className="date-input"
                  />
                </div>
              </>
            )}
          </div>

          <div className="report-title-section">
            {(() => {
              const { title, subtitle } = getReportTitleParts();
              return (
                <>
                  <h3>{title}</h3>
                  {subtitle && <div style={{ marginTop: '4px', color: '#4a5568', fontWeight: 600 }}>{subtitle}</div>}
                </>
              );
            })()}
          </div>
        </div>

        <div className="summary-section ie-summary">
          <div className="summary-cards">
            <div className="summary-card income-card">
              <div className="card-icon">💰</div>
              <div className="card-content">
                <h3>Total Other Income</h3>
                <div className="amount positive">₹{formatCurrency(totals.totalIncome)}</div>
                <div className="count">{incomeData.length} entries</div>
              </div>
            </div>
            
            <div className="summary-card expenses-card">
              <div className="card-icon">💸</div>
              <div className="card-content">
                <h3>Total Expenses</h3>
                <div className="amount negative">₹{formatCurrency(totals.totalExpenses)}</div>
                <div className="count">{expensesData.length} entries</div>
              </div>
            </div>
          </div>

          <div className="pdf-section ie-pdf">
            <button 
              className="generate-pdf-btn"
              onClick={generatePDF}
              disabled={generating}
            >
              {generating ? 'Generating PDF...' : 'Generate PDF Report'}
            </button>
          </div>
        </div>

        <div className="data-tables">
          <div className="table-section">
            <h3>Other Income Details</h3>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Category</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(reportType === 'weekly' || reportType === 'monthly' || reportType === 'yearly' ? aggregatedIncomeByCategory : orderedDailyIncome).map((item, index) => (
                    <tr key={`income-${index}`}>
                      <td className="center">{index + 1}</td>
                      <td>{(reportType === 'weekly' || reportType === 'monthly' || reportType === 'yearly') ? item.category : (item.source || 'N/A')}</td>
                      <td className="amount positive">₹{formatCurrency((item.amount || 0))}</td>
                    </tr>
                  ))}
                  {((reportType === 'weekly' || reportType === 'monthly' || reportType === 'yearly') ? aggregatedIncomeByCategory.length === 0 : orderedDailyIncome.length === 0) && (
                    <tr>
                      <td colSpan="3" className="no-data">No income records found</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="total-row">
                    <td colSpan="2"><strong>TOTAL</strong></td>
                    <td className="amount positive"><strong>₹{formatCurrency(totals.totalIncome)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="table-section">
            <h3>Expenses Details</h3>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Category</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(reportType === 'weekly' || reportType === 'monthly' || reportType === 'yearly' ? aggregatedExpensesByCategory : expensesData).map((item, index) => (
                    <tr key={`expense-${index}`}>
                      <td className="center">{index + 1}</td>
                      <td>{(reportType === 'weekly' || reportType === 'monthly') ? item.category : (item.category || 'N/A')}</td>
                      <td className="amount negative">₹{formatCurrency((item.amount || 0))}</td>
                    </tr>
                  ))}
                  {((reportType === 'weekly' || reportType === 'monthly' || reportType === 'yearly') ? aggregatedExpensesByCategory.length === 0 : expensesData.length === 0) && (
                    <tr>
                      <td colSpan="3" className="no-data">No expense records found</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="total-row">
                    <td colSpan="2"><strong>TOTAL</strong></td>
                    <td className="amount negative"><strong>₹{formatCurrency(totals.totalExpenses)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default IncomeExpensesReport;