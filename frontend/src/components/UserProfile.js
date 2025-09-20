import React from 'react';
import { useUserContext } from '../contexts/UserContext';
import { useAuthContext } from '../contexts/AuthContext';

/**
 * Example component showing how to use the new context architecture
 */
function UserProfile() {
  const { user, loading, error, shopName, userName, userEmail } = useUserContext();
  const { handleLogout } = useAuthContext();

  if (loading) {
    return <div>Loading user profile...</div>;
  }

  if (error) {
    return (
      <div className="error-message">
        <p>Error loading profile: {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (!user) {
    return <div>No user data available</div>;
  }

  return (
    <div className="user-profile">
      <h2>User Profile</h2>
      <div className="profile-info">
        <p><strong>Name:</strong> {userName}</p>
        <p><strong>Email:</strong> {userEmail}</p>
        <p><strong>Shop:</strong> {shopName}</p>
        <p><strong>Retailer Code:</strong> {user.retailerCode}</p>
      </div>
      <button onClick={handleLogout} className="logout-button">
        Logout
      </button>
    </div>
  );
}

export default UserProfile;
