const fs = require('fs');
const pdf = require('pdf-parse');

async function debugQuantityParsing() {
  try {
    const pdfPath = '../icdc/ICDC-pylon 13.pdf';
    
    if (!fs.existsSync(pdfPath)) {
      console.log('PDF file not found. Trying alternative name...');
      const altPath = '../icdc/ICDC-13 PDF.pdf';
      if (fs.existsSync(altPath)) {
        console.log('Using:', altPath);
        const dataBuffer = fs.readFileSync(altPath);
        const data = await pdf(dataBuffer);
        const text = data.text;
        
        console.log('=== LOOKING FOR COMPACT FORMAT LINES ===');
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        // Look for compact format pattern
        const compactPattern = /^(\d{1,2})(\d{4})(.+?)(Beer|IML|Duty\s*Paid)([GCP])(\d+)\s*\/\s*(\d+)\s*ml(\d+)$/;
        
        lines.forEach((line, index) => {
          const match = line.match(compactPattern);
          if (match) {
            const serial = match[1];
            const brandNumber = match[2];
            const productName = match[3];
            const productType = match[4];
            const packType = match[5];
            const packQty = match[6];
            const sizeML = match[7];
            const casesBottles = match[8];
            
            console.log(`\n--- Line ${index}: ${line} ---`);
            console.log(`Serial: ${serial}`);
            console.log(`Brand: ${brandNumber}`);
            console.log(`Product: ${productName}`);
            console.log(`Type: ${productType}`);
            console.log(`Pack Type: ${packType}`);
            console.log(`Pack Qty: ${packQty}`);
            console.log(`Size: ${sizeML}ml`);
            console.log(`Raw Cases+Bottles: "${casesBottles}"`);
            
            // Test current parsing logic
            let cases = 0;
            let bottles = 0;
            
            if (casesBottles.length >= 3) {
              if (casesBottles.length === 3) {
                cases = parseInt(casesBottles.substring(0, 2));
                bottles = parseInt(casesBottles.substring(2));
              } else if (casesBottles.length === 4) {
                const lastTwo = casesBottles.substring(casesBottles.length - 2);
                if (lastTwo === '00') {
                  cases = parseInt(casesBottles.substring(0, casesBottles.length - 1));
                  bottles = 0;
                } else {
                  cases = parseInt(casesBottles.substring(0, casesBottles.length - 2));
                  bottles = parseInt(lastTwo);
                }
              } else {
                cases = parseInt(casesBottles.substring(0, casesBottles.length - 2));
                bottles = parseInt(casesBottles.substring(casesBottles.length - 2));
              }
            }
            
            console.log(`Parsed Cases: ${cases}`);
            console.log(`Parsed Bottles: ${bottles}`);
            console.log(`Total Quantity: ${(cases * parseInt(packQty)) + bottles}`);
          }
        });
      } else {
        console.log('PDF file not found at either path');
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

debugQuantityParsing();


