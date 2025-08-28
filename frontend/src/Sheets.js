import React from 'react';
import './Sheets.css';

function Sheets({ onNavigate }) {
 const user = JSON.parse(localStorage.getItem('user') || '{}');
 const shopName = user.shopName || 'Liquor Ledger';

 return (
   <div className="sheets-page-container">
     <header className="sheets-page-header">
       <div className="sheets-logo-section">
         <h1 className="sheets-app-title">{shopName}</h1>
         <p className="sheets-app-subtitle">Inventory Management</p>
       </div>
       <nav className="sheets-navigation">
         <button className="sheets-nav-btn" onClick={() => onNavigate('dashboard')}>Dashboard</button>
         <button className="sheets-nav-btn" onClick={() => onNavigate('stockOnboarding')}>Stock Onboarding</button>
         <button className="sheets-nav-btn" onClick={() => onNavigate('manageStock')}>Manage Stock</button>
         <button className="sheets-nav-btn sheets-nav-btn-active">Sheets</button>
 
         <button className="sheets-nav-btn">Reports</button>
         <button className="sheets-nav-btn">Settings</button>
       </nav>
     </header>

     <main className="sheets-page-content">
       <div className="sheets-page-title-section">
         <h2 className="sheets-main-title">Sheets</h2>
         <p className="sheets-subtitle">Daily operations and data management</p>
       </div>

       <div className="sheets-action-cards-grid">
         <div 
           className="sheets-action-card sheets-action-card-blue"
           onClick={() => onNavigate('updateClosingStock')}
         >
           <div className="sheets-card-icon">📝</div>
           <div className="sheets-card-content">
             <h3 className="sheets-card-title">Update Closing Stock</h3>
             <p className="sheets-card-description">Update end-of-day closing stock quantities</p>
           </div>
           <div className="sheets-card-arrow">→</div>
         </div>

         <div 
           className="sheets-action-card sheets-action-card-green"
           onClick={() => onNavigate('incomeExpenses')}
         >
           <div className="sheets-card-icon">💰</div>
           <div className="sheets-card-content">
             <h3 className="sheets-card-title">Income/Expenses</h3>
             <p className="sheets-card-description">Record additional income sources and operational expenses</p>
           </div>
           <div className="sheets-card-arrow">→</div>
         </div>

         <div 
           className="sheets-action-card sheets-action-card-orange"
           onClick={() => onNavigate('trackPayments')}
         >
           <div className="sheets-card-icon">💸</div>
           <div className="sheets-card-content">
             <h3 className="sheets-card-title">Track Payments</h3>
             <p className="sheets-card-description">Record daily payment collections</p>
           </div>
           <div className="sheets-card-arrow">→</div>
         </div>
       </div>
     </main>
   </div>
 );
}

export default Sheets;
