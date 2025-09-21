import React, { useState } from 'react';
import './ManageStock.css';
import IndentEstimate from './IndentEstimate';
import StockReceived from './StockReceived';
import { getCurrentUser } from './authUtils';
import Navigation from './components/Navigation';

function ManageStock({ onNavigate, onLogout }) {
  const [currentView, setCurrentView] = useState('main');
  const user = getCurrentUser();
  const shopName = user.shopName || 'Liquor Ledger';

  if (currentView === 'indentEstimate') {
    return <IndentEstimate onNavigate={onNavigate} onBack={() => setCurrentView('main')} onLogout={onLogout} />;
  }

  if (currentView === 'stockReceived') {
    return <StockReceived onNavigate={onNavigate} onBack={() => setCurrentView('main')} onLogout={onLogout} />;
  }



  return (
    <div className="manage-stock-container">
      <Navigation 
        currentPage="manageStock"
        onNavigate={onNavigate}
        onLogout={onLogout}
        shopName={shopName}
      />

      <main className="manage-stock-content">
        <div className="page-title-section">
          <h2 className="main-title">Manage Stock</h2>
          <p className="subtitle">Stock management operations</p>
        </div>

        <div className="stock-actions-grid">

          <div className="stock-action-card" onClick={() => onNavigate('uploadInvoice')}>
            <div className="action-icon invoice">📤</div>
            <div className="action-content">
              <h3 className="action-title">Upload Invoice</h3>
              <p className="action-description">Upload government invoice PDF to automatically update stock</p>
            </div>
          </div>

          <div className="stock-action-card" onClick={() => setCurrentView('indentEstimate')}>
            <div className="action-icon estimate">📊</div>
            <div className="action-content">
              <h3 className="action-title">Indent Estimate</h3>
              <p className="action-description">Estimate the value of products to be purchased</p>
            </div>
          </div>

          <div className="stock-action-card" onClick={() => onNavigate('shiftTransfer')}>
            <div className="action-icon transfer">🔄</div>
            <div className="action-content">
              <h3 className="action-title">Shift/Transfer</h3>
              <p className="action-description">Transfer stock between suppliers and shops</p>
            </div>
          </div>

          <div className="stock-action-card" onClick={() => onNavigate('addStore')}>
            <div className="action-icon supplier">🏪</div>
            <div className="action-content">
              <h3 className="action-title">Add Store</h3>
              <p className="action-description">Add and manage store information</p>
            </div>
          </div>

          <div className="stock-action-card" onClick={() => setCurrentView('stockReceived')}>
            <div className="action-icon received">📦</div>
            <div className="action-content">
              <h3 className="action-title">Stock Received</h3>
              <p className="action-description">View all received stock records with source tracking</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default ManageStock;