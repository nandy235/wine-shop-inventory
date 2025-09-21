#!/bin/bash

# Script to analyze ICDC 3 PDF
echo "🔍 Analyzing ICDC 3 PDF..."

# Navigate to backend directory
cd "$(dirname "$0")"

# Check if the ICDC 3 PDF exists
ICDC_PATH="../Icdc/ICDC 3.pdf"
if [ ! -f "$ICDC_PATH" ]; then
    echo "❌ ICDC 3.pdf not found at: $ICDC_PATH"
    echo "Please check the file path and try again."
    exit 1
fi

echo "📄 Found ICDC 3 PDF at: $ICDC_PATH"

# Run the analysis
echo "🚀 Starting PDF analysis..."
node analyzePDF.js "$ICDC_PATH"

echo ""
echo "✅ Analysis complete!"
echo "📁 Check the 'pdf-analysis' folder for detailed results."
echo ""
echo "Next steps:"
echo "1. Review the raw text output to understand the format"
echo "2. Look at the structured lines JSON for line-by-line breakdown"
echo "3. Use this information to improve the invoice parser"
