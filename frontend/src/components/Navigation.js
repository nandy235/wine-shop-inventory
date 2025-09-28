import React from 'react';
import './Navigation.css';

function Navigation({ currentPage, onNavigate, onLogout, shopName, onBack }) {
  const navItems = [
    { key: 'home', label: 'Home' },
    { key: 'stockOnboarding', label: 'Stock Onboarding' },
    { key: 'manageStock', label: 'Manage Stock' },
    { key: 'sheets', label: 'Sheets' },
    { key: 'reports', label: 'Reports' }
  ];

  // For sub-pages, show their parent page as active but don't include them in main nav
  const getActivePage = () => {
    if (currentPage === 'uploadInvoice' || currentPage === 'indentEstimate' || currentPage === 'shiftTransfer' || currentPage === 'addStore' || currentPage === 'stockReceived') {
      return 'manageStock'; // Show Manage Stock as active since these are accessed through it
    }
    if (currentPage === 'updateClosingStock' || currentPage === 'incomeExpenses' || currentPage === 'trackPayments') {
      return 'sheets'; // Show Sheets as active since these are accessed through it
    }
    if (currentPage === 'downloadSaleSheet' || currentPage === 'brandWiseSales' || currentPage === 'stockTransferReport' || currentPage === 'stockLifted' || currentPage === 'incomeExpensesReport') {
      return 'reports'; // Show Reports as active since these are accessed through it
    }
    return currentPage;
  };

  return (
    <header className="app-header">
      <div className="logo-section">
        <h1 className="app-title">{shopName}</h1>
        <p className="app-subtitle">Inventory Management</p>
      </div>
      <nav className="navigation">
        {navItems.map(item => (
          <button 
            key={item.key}
            className={`nav-btn ${getActivePage() === item.key ? 'active' : ''}`}
            onClick={() => {
              // For sub-pages, use onBack when clicking their parent page
              if (getActivePage() === item.key && currentPage !== item.key && onBack) {
                onBack();
              } else {
                onNavigate(item.key);
              }
            }}
          >
            {item.label}
          </button>
        ))}
        <button className="nav-btn logout-btn" onClick={onLogout}>Log Out</button>
      </nav>
    </header>
  );
}

export default Navigation;
