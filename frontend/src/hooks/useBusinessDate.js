import { useState, useEffect } from 'react';

// Business date helper (11:30 AM IST boundary)
const calculateBusinessDate = () => {
  const now = new Date();
  
  // Always get IST time using toLocaleString with Asia/Kolkata timezone
  // This works regardless of server timezone (UTC, IST, or any other)
  const istTimeString = now.toLocaleString('en-CA', { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse the IST time string
  const [datePart, timePart] = istTimeString.split(', ');
  const [year, month, day] = datePart.split('-');
  const [hour, minute, second] = timePart.split(':');
  
  // Create IST date object
  const istTime = new Date(year, month - 1, day, parseInt(hour), parseInt(minute), parseInt(second));
  
  // Check if current IST time is before 11:30 AM
  const isBeforeBusinessStart = 
    istTime.getHours() < 11 || 
    (istTime.getHours() === 11 && istTime.getMinutes() < 30);
  
  let businessDate;
  if (isBeforeBusinessStart) {
    // If before 11:30 AM, use previous day as business date
    const yesterday = new Date(istTime);
    yesterday.setDate(yesterday.getDate() - 1);
    businessDate = yesterday.toLocaleDateString('en-CA');
  } else {
    // If after 11:30 AM, use current day as business date
    businessDate = istTime.toLocaleDateString('en-CA');
  }
  
  return businessDate;
};

// Custom hook for business date
const useBusinessDate = () => {
  const [businessDate, setBusinessDate] = useState(calculateBusinessDate);

  // Update business date every minute to handle the 11:30 AM transition
  useEffect(() => {
    const interval = setInterval(() => {
      const newBusinessDate = calculateBusinessDate();
      setBusinessDate(newBusinessDate);
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  return businessDate;
};

export default useBusinessDate;
