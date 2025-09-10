import React, { useState, useEffect } from 'react';
import './SettingsDropdown.css';

function SettingsDropdown({ onLogout }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    console.log('isOpen state changed to:', isOpen);
  }, [isOpen]);

  const handleClick = () => {
    console.log('Settings clicked! Current isOpen:', isOpen);
    setIsOpen(!isOpen);
    console.log('Setting isOpen to:', !isOpen);
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
  };

  console.log('SettingsDropdown rendering, isOpen:', isOpen);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button 
        className="nav-btn"
        onClick={() => {
          console.log('CLICKED!');
          setIsOpen(!isOpen);
        }}
      >
        Settings
      </button>
      
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: '0',
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 999999,
          minWidth: '120px',
          padding: '8px 0',
          whiteSpace: 'nowrap',
          marginTop: '4px'
        }}>
          <button 
            onClick={handleLogout}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              color: '#333',
              fontSize: '14px',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default SettingsDropdown;
