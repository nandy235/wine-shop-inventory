import React from 'react';
import './Sheets.css';
import { getCurrentUser } from './authUtils';
import Navigation from './components/Navigation';

function Sheets({ onNavigate, onLogout }) {
 const user = getCurrentUser();
 const shopName = user.shopName || 'Liquor Ledger';

 return (
   <div className="sheets-page-container">
     <Navigation 
       currentPage="sheets"
       onNavigate={onNavigate}
       onLogout={onLogout}
       shopName={shopName}
     />

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
