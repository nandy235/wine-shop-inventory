// src/reportWebVitals.js - Alternative for v5.1.0

const reportWebVitals = (onPerfEntry) => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    // Try different import patterns for v5
    Promise.all([
      import('web-vitals/attribution'),
      import('web-vitals')
    ]).then(([attribution, vitals]) => {
      // Use either the main export or attribution export
      const webVitals = vitals.default || vitals;
      
      if (webVitals.getCLS) {
        webVitals.getCLS(onPerfEntry);
        webVitals.getFID(onPerfEntry);
        webVitals.getFCP(onPerfEntry);
        webVitals.getLCP(onPerfEntry);
        webVitals.getTTFB(onPerfEntry);
      }
    }).catch((error) => {
      console.log('Web Vitals not available:', error);
    });
  }
};

export const sendToAnalytics = (metric) => {
  console.log('📊 Web Vital:', metric.name, '=', metric.value);
};

export default reportWebVitals;