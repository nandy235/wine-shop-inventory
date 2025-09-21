import React from 'react';
import './Reports.css';
import { getCurrentUser } from './authUtils';
import Navigation from './components/Navigation';

function Reports({ onNavigate, onLogout }) {
 const user = getCurrentUser();
 const shopName = user.shopName || 'Liquor Ledger';

 return (
   <div className="reports-page-container">
     <Navigation 
       currentPage="reports"
       onNavigate={onNavigate}
       onLogout={onLogout}
       shopName={shopName}
     />

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
              <h3 className="reports-card-title">Sales Report</h3>
              <p className="reports-card-description">Sales analysis by brand with performance metrics</p>
            </div>
            <div className="reports-card-arrow">→</div>
          </div>

          <div 
            className="reports-action-card reports-action-card-teal"
            onClick={() => onNavigate('stockTransferReport')}
          >
            <div className="reports-card-icon">🔄</div>
            <div className="reports-card-content">
              <h3 className="reports-card-title">Stock Transfer Report</h3>
              <p className="reports-card-description">View and download stock transfer reports by date</p>
            </div>
            <div className="reports-card-arrow">→</div>
          </div>
        </div>
     </main>
   </div>
 );
}

export default Reports;