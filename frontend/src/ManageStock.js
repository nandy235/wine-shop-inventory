import React, { useState } from 'react';
import './ManageStock.css';
import IndentEstimate from './IndentEstimate';
import API_BASE_URL from './config';
import SettingsDropdown from './SettingsDropdown';

function ManageStock({ onNavigate, onLogout }) {
  const [currentView, setCurrentView] = useState('main');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const shopName = user.shopName || 'Liquor Ledger';

  if (currentView === 'indentEstimate') {
    return <IndentEstimate onNavigate={onNavigate} onBack={() => setCurrentView('main')} onLogout={onLogout} />;
  }

  return (
    <div className="manage-stock-container">
      <header className="manage-stock-header">
        <div className="logo-section">
          <h1 className="app-title">{shopName}</h1>
          <p className="app-subtitle">Inventory Management</p>
        </div>
        <nav className="navigation">
          <button className="nav-btn" onClick={() => onNavigate('dashboard')}>Dashboard</button>
          <button className="nav-btn" onClick={() => onNavigate('stockOnboarding')}>Stock Onboarding</button>
          <button className="nav-btn active">Manage Stock</button>
          <button className="nav-btn" onClick={() => onNavigate('sheets')}>Sheets</button>
          <button className="nav-btn" onClick={() => onNavigate('reports')}>Reports</button>
          <SettingsDropdown onLogout={onLogout} />
        </nav>
      </header>

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

          <div className="stock-action-card" onClick={() => onNavigate('addSupplier')}>
            <div className="action-icon supplier">👥</div>
            <div className="action-content">
              <h3 className="action-title">Add Supplier</h3>
              <p className="action-description">Add and manage supplier information</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default ManageStock;