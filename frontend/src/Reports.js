import React from 'react';
import './Reports.css';

function Reports({ onNavigate }) {
 const user = JSON.parse(localStorage.getItem('user') || '{}');
 const shopName = user.shopName || 'Liquor Ledger';

 return (
   <div className="reports-page-container">
     <header className="reports-page-header">
       <div className="reports-logo-section">
         <h1 className="reports-app-title">{shopName}</h1>
         <p className="reports-app-subtitle">Inventory Management</p>
       </div>
       <nav className="reports-navigation">
         <button className="reports-nav-btn" onClick={() => onNavigate('dashboard')}>Dashboard</button>
         <button className="reports-nav-btn" onClick={() => onNavigate('stockOnboarding')}>Stock Onboarding</button>
         <button className="reports-nav-btn" onClick={() => onNavigate('manageStock')}>Manage Stock</button>
         <button className="reports-nav-btn" onClick={() => onNavigate('sheets')}>Sheets</button>
         <button className="reports-nav-btn reports-nav-btn-active">Reports</button>
         <button className="reports-nav-btn">Settings</button>
       </nav>
     </header>

     <main className="reports-page-content">
       <div className="reports-page-title-section">
         <h2 className="reports-main-title">Reports</h2>
         <p className="reports-subtitle">Analytics and comprehensive business reports</p>
       </div>

        <div className="reports-action-cards-grid">
          <div 
            className="reports-action-card reports-action-card-blue"
            onClick={() => onNavigate('downloadSaleSheet')}
          >
            <div className="reports-card-icon">📊</div>
            <div className="reports-card-content">
              <h3 className="reports-card-title">Download Sale Sheet</h3>
              <p className="reports-card-description">Generate PDF sale reports with financial summary</p>
            </div>
            <div className="reports-card-arrow">→</div>
          </div>

          <div 
            className="reports-action-card reports-action-card-green"
            onClick={() => onNavigate('incomeExpensesReport')}
          >
            <div className="reports-card-icon">💰</div>
            <div className="reports-card-content">
              <h3 className="reports-card-title">Income & Expenses Report</h3>
              <p className="reports-card-description">Analyze income sources and expense categories with charts</p>
            </div>
            <div className="reports-card-arrow">→</div>
          </div>

          <div 
            className="reports-action-card reports-action-card-purple"
            onClick={() => onNavigate('stockLifted')}
          >
            <div className="reports-card-icon">📦</div>
            <div className="reports-card-content">
              <h3 className="reports-card-title">Stock Lifted Report</h3>
              <p className="reports-card-description">Track stock movement and quantities lifted by date</p>
            </div>
            <div className="reports-card-arrow">→</div>
          </div>

          <div 
            className="reports-action-card reports-action-card-orange"
            onClick={() => onNavigate('brandWiseSales')}
          >
            <div className="reports-card-icon">🏷️</div>
            <div className="reports-card-content">
              <h3 className="reports-card-title">Brand Wise Sales Report</h3>
              <p className="reports-card-description">Sales analysis by brand with performance metrics</p>
            </div>
            <div className="reports-card-arrow">→</div>
          </div>
        </div>
     </main>
   </div>
 );
}

export default Reports;