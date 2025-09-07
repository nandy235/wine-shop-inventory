import React, { useState, useEffect } from 'react';
import './IncomeExpenses.css';
import API_BASE_URL from './config';

// Helper function to get business date (day starts at 11:30 AM)
function getBusinessDate() {
  const now = new Date();
  
  // Check if browser is already in IST timezone
  const browserTimezoneOffset = now.getTimezoneOffset();
  const istTimezoneOffset = -330; // IST is UTC+5:30, so offset is -330 minutes
  
  let istTime;
  if (browserTimezoneOffset === istTimezoneOffset) {
    // Browser is already in IST, use current time
    istTime = now;
  } else {
    // Browser is in different timezone, convert to IST
    const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
    istTime = new Date(now.getTime() + istOffset);
  }
  
  if (istTime.getHours() < 11 || (istTime.getHours() === 11 && istTime.getMinutes() < 30)) {
    // Before 11:30 AM IST - use previous day
    const yesterday = new Date(istTime);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toLocaleDateString('en-CA');
  } else {
    // After 11:30 AM IST - use current day
    return istTime.toLocaleDateString('en-CA');
  }
}

function IncomeExpenses({ onNavigate }) {
  const [date, setDate] = useState(getBusinessDate());
  const [incomeData, setIncomeData] = useState([]);
  const [expensesData, setExpensesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState('income');
  const [incomeModified, setIncomeModified] = useState(false);
  const [expensesModified, setExpensesModified] = useState(false);
  const [incomeCategories, setIncomeCategories] = useState([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [addCategoryName, setAddCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');
  const shopName = user.shopName || 'Liquor Ledger';

  const defaultIncomeCategories = [
    'Sitting',
    'Cash discounts',
    'Used bottles/cartons sale',
    'Others'
  ];

  const expenseCategories = [
    'Meals',
    'Stationery', 
    'Groceries',
    'Fuel cost',
    'Rent',
    'Salaries',
    'Electricity',
    'Damages',
    'Depo charges',
    'Transportation',
    'Police dept',
    'Excise dept',
    'Festival charities',
    'Local Charities',
    'Others'
  ];

  useEffect(() => {
    // Load categories on mount
    const fetchIncomeCategories = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/income-expenses/income-categories`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (response.ok) {
          const result = await response.json();
          const names = Array.isArray(result) ? result.map(c => c.name) : [];
          setIncomeCategories(names && names.length > 0 ? names : defaultIncomeCategories);
        } else {
          setIncomeCategories(defaultIncomeCategories);
        }
      } catch (e) {
        setIncomeCategories(defaultIncomeCategories);
      }
      setCategoriesLoaded(true);
    };
    fetchIncomeCategories();
  }, []);

  useEffect(() => {
    if (!categoriesLoaded) return;
    setLoading(true);
    fetchIncomeExpenses();
  }, [date, categoriesLoaded]);

  const fetchIncomeExpenses = async () => {
    try {
      // Fetch existing income data
      const incomeResponse = await fetch(`${API_BASE_URL}/api/income-expenses/income?date=${date}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // Fetch existing expenses data
      const expensesResponse = await fetch(`${API_BASE_URL}/api/income-expenses/expenses?date=${date}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const incomeResult = incomeResponse.ok ? await incomeResponse.json() : [];
      const expensesResult = expensesResponse.ok ? await expensesResponse.json() : [];

      // Check if there's actually saved data (not just zeros)
      const hasIncomeData = incomeResult.length > 0 && incomeResult.some(item => item.amount > 0);
      const hasExpensesData = expensesResult.length > 0 && expensesResult.some(item => item.amount > 0);

      // Initialize income data with categories (from backend or defaults)
      const incomeCategoryList = (incomeCategories && incomeCategories.length > 0) ? incomeCategories : defaultIncomeCategories;
      const initialIncomeData = incomeCategoryList.map(category => {
        const existingEntry = incomeResult.find(item => item.source === category);
        return {
          category,
          amount: existingEntry ? existingEntry.amount : 0,
          description: existingEntry ? existingEntry.description : ''
        };
      });

      // Initialize expenses data with categories  
      const initialExpensesData = expenseCategories.map(category => {
        const existingEntry = expensesResult.find(item => item.category === category);
        return {
          category,
          amount: existingEntry ? existingEntry.amount : 0,
          description: existingEntry ? existingEntry.description : ''
        };
      });

      setIncomeData(initialIncomeData);
      setExpensesData(initialExpensesData);
      
      // Only set as "not modified" if there's actually saved data
      // If no saved data exists, treat as new/unsaved so button shows "Save"
      setIncomeModified(!hasIncomeData);
      setExpensesModified(!hasExpensesData);
    } catch (error) {
      console.error('Error fetching income/expenses data:', error);
      // Initialize with empty data if fetch fails
      const incomeCategoryList = (incomeCategories && incomeCategories.length > 0) ? incomeCategories : defaultIncomeCategories;
      setIncomeData(incomeCategoryList.map(category => ({ category, amount: 0, description: '' })));
      setExpensesData(expenseCategories.map(category => ({ category, amount: 0, description: '' })));
      // New day with no data - should show "Save" button
      setIncomeModified(true);
      setExpensesModified(true);
    }
    setLoading(false);
  };

  const handleConfirmAddCategory = async () => {
    const name = (addCategoryName || '').trim();
    if (!name || addingCategory) return;
    setAddingCategory(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/income-expenses/income-categories`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name })
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        alert(err.message || 'Failed to add category');
        return;
      }
      const data = await response.json();
      const updatedNames = (data.categories || []).map(c => c.name);
      const ordered = updatedNames && updatedNames.length > 0 ? updatedNames : incomeCategories;

      const preserved = ordered.map(cat => {
        const existing = incomeData.find(i => i.category === cat);
        return existing ? existing : { category: cat, amount: 0, description: '' };
      });

      setIncomeCategories(ordered);
      setIncomeData(preserved);
      setIncomeModified(true);
      setAddCategoryName('');
      setIsAddCategoryOpen(false);
      alert('Category added successfully');
    } catch (e) {
      alert('Network error while adding category');
    } finally {
      setAddingCategory(false);
    }
  };

  const handleIncomeChange = (index, field, value) => {
    const updatedData = [...incomeData];
    updatedData[index] = {
      ...updatedData[index],
      [field]: field === 'amount' ? (parseFloat(value) || 0) : value
    };
    setIncomeData(updatedData);
    setIncomeModified(true);
  };

  const handleExpenseChange = (index, field, value) => {
    const updatedData = [...expensesData];
    updatedData[index] = {
      ...updatedData[index],
      [field]: field === 'amount' ? (parseFloat(value) || 0) : value
    };
    setExpensesData(updatedData);
    setExpensesModified(true);
  };

  const handleSaveIncome = async () => {
    setSaving(true);
    try {
      const incomeEntries = incomeData.filter(item => item.amount > 0);

      const response = await fetch(`${API_BASE_URL}/api/income-expenses/save-income`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          date,
          income: incomeEntries
        })
      });

      if (response.ok) {
        alert('Income saved successfully!');
        // Refresh data to show saved values
        await fetchIncomeExpenses();
        setIncomeModified(false);
      } else {
        const error = await response.json();
        alert(`Error: ${error.message}`);
      }
    } catch (error) {
      console.error('Error saving income:', error);
      alert('Network error while saving income');
    }
    setSaving(false);
  };

  const handleSaveExpenses = async () => {
    setSaving(true);
    try {
      const expenseEntries = expensesData.filter(item => item.amount > 0);

      const response = await fetch(`${API_BASE_URL}/api/income-expenses/save-expenses`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          date,
          expenses: expenseEntries
        })
      });

      if (response.ok) {
        alert('Expenses saved successfully!');
        // Refresh data to show saved values
        await fetchIncomeExpenses();
        setExpensesModified(false);
      } else {
        const error = await response.json();
        alert(`Error: ${error.message}`);
      }
    } catch (error) {
      console.error('Error saving expenses:', error);
      alert('Network error while saving expenses');
    }
    setSaving(false);
  };

  const getTotalIncome = () => {
    if (!incomeData || !Array.isArray(incomeData) || incomeData.length === 0) return 0;
    try {
      const total = incomeData.reduce((sum, item) => {
        const amount = item && item.amount !== undefined ? parseFloat(item.amount) || 0 : 0;
        return sum + amount;
      }, 0);
      return typeof total === 'number' ? total : 0;
    } catch (error) {
      console.error('Error calculating total income:', error);
      return 0;
    }
  };

  const getTotalExpenses = () => {
    if (!expensesData || !Array.isArray(expensesData) || expensesData.length === 0) return 0;
    try {
      const total = expensesData.reduce((sum, item) => {
        const amount = item && item.amount !== undefined ? parseFloat(item.amount) || 0 : 0;
        return sum + amount;
      }, 0);
      return typeof total === 'number' ? total : 0;
    } catch (error) {
      console.error('Error calculating total expenses:', error);
      return 0;
    }
  };

  const isDefaultCategory = (name) => {
    if (!name) return false;
    const n = name.toLowerCase();
    return n === 'sitting' || n === 'cash discounts' || n === 'used bottles/cartons sale' || n === 'others';
  };

  const handleDeleteCategory = async (categoryName) => {
    if (!categoryName || isDefaultCategory(categoryName)) return;
    const confirmDelete = window.confirm(`Delete category "${categoryName}"?`);
    if (!confirmDelete) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/income-expenses/income-categories`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: categoryName })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(data.message || 'Failed to delete category');
        return;
      }
      const updatedNames = (data.categories || []).map(c => c.name);
      const ordered = updatedNames && updatedNames.length > 0 ? updatedNames : incomeCategories.filter(c => c !== categoryName);
      const preserved = ordered.map(cat => {
        const existing = incomeData.find(i => i.category === cat);
        return existing ? existing : { category: cat, amount: 0, description: '' };
      });
      setIncomeCategories(ordered);
      setIncomeData(preserved);
      setIncomeModified(true);
    } catch (e) {
      alert('Network error while deleting category');
    }
  };

  if (loading) {
    return (
      <div className="income-expenses-container">
        <div className="loading-container">Loading income and expenses...</div>
      </div>
    );
  }

  return (
    <div className="income-expenses-container">
      <header className="income-expenses-header">
        <div className="income-expenses-logo-section">
          <h1 className="income-expenses-app-title">{shopName}</h1>
          <p className="income-expenses-app-subtitle">Inventory Management</p>
        </div>
        <nav className="income-expenses-navigation">
          <button className="income-expenses-nav-btn" onClick={() => onNavigate('dashboard')}>Dashboard</button>
          <button className="income-expenses-nav-btn" onClick={() => onNavigate('stockOnboarding')}>Stock Onboarding</button>
          <button className="income-expenses-nav-btn" onClick={() => onNavigate('manageStock')}>Manage Stock</button>
          <button className="income-expenses-nav-btn" onClick={() => onNavigate('sheets')}>Sheets</button>
          <button className="income-expenses-nav-btn" onClick={() => onNavigate('reports')}>Reports</button>
          <button className="income-expenses-nav-btn">Settings</button>
        </nav>
      </header>

      <main className="income-expenses-content">
        <div className="income-expenses-page-title-section">
          <h2 className="income-expenses-main-title">Income & Expenses</h2>
          <p className="income-expenses-subtitle">Record additional income sources and operational expenses</p>
        </div>

        <div className="income-expenses-controls">
          <div className="income-expenses-date-display">
            <span className="income-expenses-date-label">Date:</span>
            <span className="income-expenses-date-value">{new Date().toLocaleDateString('en-GB')}</span>
          </div>
          
          <div className="income-expenses-type-selector">
            <div className="income-expenses-radio-group">
              <label className="income-expenses-radio-label">
                <input
                  type="radio"
                  name="incomeExpenseType"
                  value="income"
                  checked={selectedType === 'income'}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="income-expenses-radio-input"
                />
                <span className="income-expenses-radio-text">Income</span>
              </label>
              <label className="income-expenses-radio-label">
                <input
                  type="radio"
                  name="incomeExpenseType"
                  value="expenses"
                  checked={selectedType === 'expenses'}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="income-expenses-radio-input"
                />
                <span className="income-expenses-radio-text">Expenses</span>
              </label>
            </div>
          </div>
        </div>

        <div className="income-expenses-tables-container">
          {selectedType === 'income' ? (
            /* Income Table */
            <div className="income-expenses-table-section">
              <h3 className="income-expenses-table-title">Income</h3>
              <div className="income-expenses-add-category-bar">
                <button
                  className="income-expenses-add-category-btn"
                  onClick={() => setIsAddCategoryOpen(true)}
                >
                  + Add Category
                </button>
              </div>
              <div className="income-expenses-table-container">
                <table className="income-expenses-table">
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Category</th>
                      <th>Amount (₹)</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomeData.map((item, index) => (
                      <tr key={index} className="income-expenses-category-row">
                        <td>{index + 1}</td>
                        <td className="income-expenses-category">
                          {item.category}
                          {isDefaultCategory(item.category) ? (
                            <span className="income-expenses-category-badge income-expenses-default-badge">Default</span>
                          ) : (
                            <button
                              className="income-expenses-delete-btn"
                              title="Delete category"
                              onClick={() => handleDeleteCategory(item.category)}
                            >
                              Delete
                            </button>
                          )}
                        </td>
                        <td>
                          <input
                            type="number"
                            className="income-expenses-amount-input"
                            value={item.amount || ''}
                            onChange={(e) => handleIncomeChange(index, 'amount', e.target.value)}
                            onWheel={(e) => e.target.blur()}
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="income-expenses-description-input"
                            value={item.description || ''}
                            onChange={(e) => handleIncomeChange(index, 'description', e.target.value)}
                            placeholder="Optional description"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="income-expenses-total-row">
                      <td></td>
                      <td><strong>Total Income</strong></td>
                      <td><strong>₹{getTotalIncome().toFixed(2)}</strong></td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            /* Expenses Table */
            <div className="income-expenses-table-section income-expenses-expenses-section">
              <h3 className="income-expenses-table-title">Expenses</h3>
              <div className="income-expenses-table-container">
                <table className="income-expenses-table">
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Category</th>
                      <th>Amount (₹)</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expensesData.map((item, index) => (
                      <tr key={index}>
                        <td>{index + 1}</td>
                        <td className="income-expenses-category">{item.category}</td>
                        <td>
                          <input
                            type="number"
                            className="income-expenses-amount-input"
                            value={item.amount || ''}
                            onChange={(e) => handleExpenseChange(index, 'amount', e.target.value)}
                            onWheel={(e) => e.target.blur()}
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="income-expenses-description-input"
                            value={item.description || ''}
                            onChange={(e) => handleExpenseChange(index, 'description', e.target.value)}
                            placeholder="Optional description"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="income-expenses-total-row">
                      <td></td>
                      <td><strong>Total Expenses</strong></td>
                      <td><strong>₹{getTotalExpenses().toFixed(2)}</strong></td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="income-expenses-bottom-section">
          <div className="income-expenses-save-section">
            <button 
              className={`income-expenses-save-btn ${selectedType === 'income' ? 'income-expenses-save-income' : 'income-expenses-save-expenses'}`}
              onClick={selectedType === 'income' ? handleSaveIncome : handleSaveExpenses}
              disabled={saving || (selectedType === 'income' ? !incomeModified : !expensesModified)}
            >
              {saving 
                ? 'Saving...' 
                : (selectedType === 'income' ? !incomeModified : !expensesModified) 
                  ? 'Already Saved' 
                  : `Save ${selectedType === 'income' ? 'Income' : 'Expenses'}`
              }
            </button>
          </div>
        </div>

        {isAddCategoryOpen && (
          <div className="income-expenses-modal-backdrop" onClick={() => !addingCategory && setIsAddCategoryOpen(false)}>
            <div className="income-expenses-modal" onClick={(e) => e.stopPropagation()}>
              <h4 className="income-expenses-modal-title">Add Income Category</h4>
              <input
                type="text"
                className="income-expenses-modal-input"
                placeholder="Category name"
                value={addCategoryName}
                onChange={(e) => setAddCategoryName(e.target.value)}
                disabled={addingCategory}
                autoFocus
              />
              <div className="income-expenses-modal-actions">
                <button className="income-expenses-modal-cancel" onClick={() => setIsAddCategoryOpen(false)} disabled={addingCategory}>Cancel</button>
                <button className="income-expenses-modal-confirm" onClick={handleConfirmAddCategory} disabled={!addCategoryName.trim() || addingCategory}>
                  {addingCategory ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default IncomeExpenses;
